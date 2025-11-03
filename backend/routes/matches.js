// backend/routes/matches.js
import { Router } from 'express';
import { supabaseAdmin } from '../services/supabase.js';
import { getIO, scheduleRoundCountdown } from '../src/sockets.js';
import { buildRoundPayload, generateCoherentRounds } from '../services/game.js';

const router = Router();

// helper: garante tempo_id para uma duração
async function ensureTempoId(durationSeconds) {
  let { data, error } = await supabaseAdmin
    .from('tempo')
    .select('tempo_id, valor')
    .eq('valor', durationSeconds)
    .maybeSingle();
  if (error) throw error;
  if (data) return data.tempo_id;

  const ins = await supabaseAdmin
    .from('tempo')
    .insert({ valor: durationSeconds })
    .select('tempo_id')
    .maybeSingle();
  if (ins.error) throw ins.error;
  return ins.data.tempo_id;
}

router.post('/start', async (req, res) => {
  try {
    const sala_id = Number(req.body.sala_id);
    if (!sala_id) throw new Error('sala_id é obrigatório');

    const ROUNDS = Number(req.body.rounds || 5);
    const DURATION = Number(req.body.duration || 20);

    // 1) Reutiliza rodadas existentes (ready/in_progress) se houver
    const qExisting = await supabaseAdmin
      .from('rodada')
      .select('rodada_id, numero_da_rodada, status')
      .eq('sala_id', sala_id)
      .not('status', 'eq', 'done') // ignora partidas já encerradas
      .order('numero_da_rodada', { ascending: true });

    if (qExisting.error) throw qExisting.error;

    if ((qExisting.data || []).length > 0) {
      const first = qExisting.data[0];
      const io = getIO();
      if (io) {
        const payload = await buildRoundPayload(first.rodada_id);

        // ATUALIZA O STATUS DA SALA ANTES DE INICIAR A RODADA
        const { error: updateSalaError } = await supabaseAdmin
          .from('sala')
          .update({ status: 'in_progress' }) // Ou o status que indica jogo ativo
          .eq('sala_id', sala_id);
        if (updateSalaError) {
            console.error(`Erro ao atualizar status da sala ${sala_id} para in_progress:`, updateSalaError);
            // Considerar se deve retornar erro ou continuar
        }

        // marca como in_progress antes de começar
        await supabaseAdmin
          .from('rodada')
          .update({ status: 'in_progress' })
          .eq('rodada_id', payload.rodada_id);

        io.to(String(sala_id)).emit('round:ready', payload);
        io.to(String(sala_id)).emit('round:started', { roundId: payload.rodada_id, duration: DURATION });
        scheduleRoundCountdown({ salaId: sala_id, roundId: payload.rodada_id, duration: DURATION });
      }
      return res.json({ ok: true, reused: true });
    }

    // 2) Precisa de pelo menos 2 jogadores na sala
    const qPlayersJS = await supabaseAdmin.from('jogador_sala').select('jogador_id').eq('sala_id', sala_id);

    const ids = (qPlayersJS.data || []).map(r => Number(r.jogador_id));
    const unique = [...new Set(ids)].filter(Boolean);

    if (unique.length < 2) {
      return res.status(400).json({ error: 'A sala precisa ter pelo menos 2 jogadores para iniciar a partida.' });
    }

    // 3) Tempo configurado para as rodadas
    const tempo_id = await ensureTempoId(DURATION);

    // 4) NOVO SORTEIO COERENTE (letra com ≥4 temas; 4 temas com palavras)
    const roundsInfo = await generateCoherentRounds({ totalRounds: ROUNDS });

    console.log('[SORTEIO_COERENTE]', {
    sala_id,
    rounds: roundsInfo.map((r, i) => ({
      n: i + 1,
      letra_id: r.letra_id,
      letra: r.letra_char,
      temas: r.temas.map(t => `${t.tema_id}:${t.tema_nome}`)
      }))
    });

    // 5) Persistir rodadas e temas sorteados
    const created = [];
    for (let i = 0; i < Math.min(roundsInfo.length, ROUNDS); i++) {
      const { letra_id, letra_char, temas } = roundsInfo[i];

      const ins = await supabaseAdmin
        .from('rodada')
        .insert({
          sala_id,
          numero_da_rodada: i + 1,
          letra_id,
          tempo_id,
          status: 'ready'
        })
        .select('rodada_id')
        .maybeSingle();
      if (ins.error) throw ins.error;
      const rodada_id = ins.data.rodada_id;

      // vincula temas
      const payloadTema = temas.map(t => ({
        rodada_id,
        tema_id: t.tema_id
      }));
      const insTema = await supabaseAdmin.from('rodada_tema').insert(payloadTema);
      if (insTema.error) throw insTema.error;

      created.push({
        rodada_id,
        sala_id,
        letra: letra_char,
        temas: temas.map(t => ({ id: t.tema_id, nome: t.tema_nome }))
      });
    }

    // 6) Dispara primeira rodada via Socket.IO
    const io = getIO();
    if (io && created.length) {
      // ATUALIZA O STATUS DA SALA ANTES DE INICIAR A RODADA
      const { error: updateSalaError } = await supabaseAdmin
        .from('sala')
        .update({ status: 'in_progress' }) // Ou o status que indica jogo ativo
        .eq('sala_id', sala_id);
      if (updateSalaError) {
          console.error(`Erro ao atualizar status da sala ${sala_id} para in_progress:`, updateSalaError);
          // Considerar se deve retornar erro ou continuar
      }

      // Atualiza status da RODADA
      await supabaseAdmin
        .from('rodada')
        .update({ status: 'in_progress' })
        .eq('rodada_id', created[0].rodada_id);

      // Emite eventos
      io.to(String(sala_id)).emit('round:ready', created[0]);
      io.to(String(sala_id)).emit('round:started', { roundId: created[0].rodada_id, duration: DURATION });
      scheduleRoundCountdown({ salaId: sala_id, roundId: created[0].rodada_id, duration: DURATION });
    }

    return res.json({ ok: true, rounds: created });
  } catch (e) {
    console.error('/matches/start failed', e);
    res.status(500).json({ error: e.message });
  }
});

export default router;