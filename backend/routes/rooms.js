// backend/routes/rooms.js
import { Router } from 'express';
import { supa } from '../services/supabase.js';
import { requireAuth } from '../middlewares/requireAuth.js';
import { getIO } from '../src/sockets.js';

const router = Router();

// --- ROTA EXISTENTE: Criar sala ---
router.post('/', requireAuth, async (req, res) => {
  try {
    const jogador_id = req.user.jogador_id;
    const { nome_sala = 'Sala' } = req.body;

    const { data: sala, error } = await supa.from('sala')
      .insert({ jogador_criador_id: jogador_id, nome_sala, status: 'waiting' })
      .select('*').single();
    if (error) throw error;

    await supa.from('jogador_sala').insert({ jogador_id, sala_id: sala.sala_id });

    // LOG DE CONFIRMAÇÃO ADICIONADO
    console.log(`---> [POST /rooms] Sala ${sala.sala_id} criada com sucesso.`);

    res.json({ sala_id: sala.sala_id, host_user: jogador_id });
  } catch (e) {
    console.error('[POST /rooms] Error:', e);
    res.status(500).json({ error: e.message });
  }
});

// --- ROTA EXISTENTE: Entrar sala (COM LOGS ADICIONADOS) ---
router.post('/join', requireAuth, async (req, res) => {
  // --- CORREÇÃO DE TIPO DE DADO ---
  const sala_id = Number(req.body.sala_id); // Converte para Number
  const jogador_id = req.user.jogador_id;
  
  console.log(`---> [POST /rooms/join] REQUISIÇÃO RECEBIDA por jogador ${jogador_id} para sala ${sala_id}`);

  try {
    if (!sala_id) {
        console.log(`---> [POST /rooms/join] Erro: sala_id não fornecido.`);
        return res.status(400).json({ error: 'sala_id required' });
    }

    // ... (resto da rota /join, que já deve estar correta)
    console.log(`---> [POST /rooms/join] Verificando status da sala ${sala_id}...`);
    const { data: salaData, error: salaError } = await supa
        .from('sala')
        .select('status, jogador_criador_id')
        .eq('sala_id', sala_id) // .eq() funciona bem com Number
        .single();
    
    // ... (resto da lógica /join)
    if (salaError) {
        console.error(`---> [POST /rooms/join] Erro ao buscar sala ${sala_id}:`, salaError);
        throw salaError;
    }
    if (!salaData) {
        console.log(`---> [POST /rooms/join] Erro: Sala ${sala_id} não encontrada.`);
        return res.status(404).json({ error: 'Sala não encontrada' });
    }
    console.log(`---> [POST /rooms/join] Status da sala ${sala_id}: '${salaData.status}'. Criador: ${salaData.jogador_criador_id}`);
    if (salaData.status !== 'waiting') {
        console.log(`---> [POST /rooms/join] Erro: Sala ${sala_id} não está 'waiting' (status: ${salaData.status}).`);
        return res.status(400).json({ error: 'Sala não está aguardando jogadores (status: ' + salaData.status + ')' });
    }
    if (salaData.jogador_criador_id === jogador_id) {
        console.log(`---> [POST /rooms/join] Erro: Criador ${jogador_id} tentou usar /join.`);
        return res.status(400).json({ error: 'Criador não pode usar /join para re-entrar.' });
    }
    console.log(`---> [POST /rooms/join] Tentando UPSERT jogador ${jogador_id} na sala ${sala_id}...`);
    const { error: upsertError } = await supa
        .from('jogador_sala')
        .upsert({ jogador_id, sala_id }, { onConflict: 'jogador_id, sala_id' });
    if (upsertError) {
        console.error(`---> [POST /rooms/join] ERRO NO UPSERT para jogador ${jogador_id} na sala ${sala_id}:`, upsertError);
        throw upsertError;
    } else {
        console.log(`---> [POST /rooms/join] UPSERT de jogador ${jogador_id} na sala ${sala_id} bem-sucedido.`);
    }
    const io = getIO();
    if (io) {
       console.log(`---> [POST /rooms/join] Buscando jogadores atualizados para emitir evento...`);
       const { data: jogadoresAtualizadosData, error: jogadoresError } = await supa
           .from('jogador_sala')
           .select('jogador:jogador_id ( jogador_id, nome_de_usuario )')
           .eq('sala_id', sala_id);
       if (!jogadoresError) {
           const jogadoresNomes = (jogadoresAtualizadosData || []).map(js => js.jogador?.nome_de_usuario || `Jogador ${js.jogador?.jogador_id}`);
           console.log(`---> [POST /rooms/join] Emitindo room:players_updated para sala ${sala_id} com jogadores:`, jogadoresNomes);
           io.to(String(sala_id)).emit('room:players_updated', { jogadores: jogadoresNomes });
       } else {
            console.error(`---> [POST /rooms/join] Erro ao buscar jogadores atualizados para emitir evento:`, jogadoresError);
       }
    } else {
        console.warn(`---> [POST /rooms/join] Instância do Socket.IO não encontrada. Não foi possível emitir evento.`);
    }
    console.log(`---> [POST /rooms/join] Resposta enviada com sucesso para jogador ${jogador_id}.`);
    res.json({ sala_id, guest_user: jogador_id });

  } catch (e) {
    console.error(`---> [POST /rooms/join] ERRO GERAL NO CATCH para sala ${sala_id} por jogador ${jogador_id}:`, e);
    if (e.code === '23505' || (e.message && e.message.includes('jogador_sala_pkey'))) {
        console.warn(`---> [POST /rooms/join] Capturado erro de chave única (23505). Verificando se jogador ${jogador_id} realmente está na sala ${sala_id}...`);
         const { data: checkData, error: checkError } = await supa
            .from('jogador_sala')
            .select('jogador_id')
            .eq('jogador_id', req.user.jogador_id)
            .eq('sala_id', req.body.sala_id)
            .maybeSingle();
         if (checkData) {
              console.log(`---> [POST /rooms/join] Verificação confirmou que jogador ${jogador_id} já está na sala. Retornando OK.`);
              return res.json({ sala_id: req.body.sala_id, guest_user: req.user.jogador_id });
         } else {
              console.error(`---> [POST /rooms/join] Erro de chave única, mas jogador ${jogador_id} não encontrado na verificação!? Erro check:`, checkError);
              return res.status(409).json({ error: 'Jogador já está nesta sala (ou erro ao verificar).' });
         }
    } else if (e.code === 'PGRST116') {
        console.log(`---> [POST /rooms/join] Erro no catch: Sala ${sala_id} não encontrada (PGRST116).`);
        return res.status(404).json({ error: 'Sala não encontrada.' });
    }
    res.status(500).json({ error: e.message });
  }
});

// --- NOVA ROTA: Sair da sala ---
router.post('/:salaId/leave', requireAuth, async (req, res) => {
   try {
       // --- CORREÇÃO DE TIPO DE DADO ---
       const salaId = Number(req.params.salaId); // Converte para Number
       const jogador_id = req.user.jogador_id;

       console.log(`---> [LEAVE /rooms/${salaId}/leave] REQUISIÇÃO RECEBIDA por jogador ${jogador_id}`);

       // ... (resto da lógica /leave)
       const { data: salaData, error: salaError } = await supa
           .from('sala')
           .select('status, jogador_criador_id')
           .eq('sala_id', salaId)
           .maybeSingle();
       if (salaError) throw salaError;
       console.log(`---> [LEAVE /rooms/${salaId}/leave] Dados da sala encontrados:`, salaData);
       let salaAbandonada = false;
       if (salaData && salaData.jogador_criador_id === jogador_id && salaData.status === 'waiting') {
           console.log(`---> [LEAVE /rooms/${salaId}/leave] CONDIÇÃO DE ABANDONO ATENDIDA! Atualizando status...`);
           const { error: updateError } = await supa
               .from('sala')
               .update({ status: 'abandonada' })
               .eq('sala_id', salaId);
           if (updateError) {
               console.error(`---> [LEAVE /rooms/${salaId}/leave] Erro ao atualizar status para abandonada:`, updateError);
           } else {
               salaAbandonada = true;
           }
       } else {
           console.log(`---> [LEAVE /rooms/${salaId}/leave] Condição de abandono NÃO atendida (Criador=${salaData?.jogador_criador_id}, Status=${salaData?.status})`);
       }
       const { error: deleteError } = await supa
           .from('jogador_sala')
           .delete()
           .eq('sala_id', salaId)
           .eq('jogador_id', jogador_id);
       console.log(`---> [LEAVE /rooms/${salaId}/leave] Jogador ${jogador_id} removido de jogador_sala (Erro: ${deleteError ? deleteError.message : 'Nenhum'})`);
       const io = getIO();
       if (io) {
           if (salaAbandonada) {
               console.log(`---> [LEAVE /rooms/${salaId}/leave] Emitindo room:abandoned para sala ${salaId}`);
               io.to(String(salaId)).emit('room:abandoned', { message: 'O criador abandonou a sala.' });
           } else if (salaData && salaData.status === 'waiting') {
               const { data: jogadoresAtualizadosData, error: jogadoresError } = await supa
                   .from('jogador_sala')
                   .select('jogador:jogador_id ( jogador_id, nome_de_usuario )')
                   .eq('sala_id', salaId);
               if (!jogadoresError) {
                   const jogadoresNomes = (jogadoresAtualizadosData || []).map(js => js.jogador?.nome_de_usuario || `Jogador ${js.jogador?.jogador_id}`);
                   console.log(`---> [LEAVE /rooms/${salaId}/leave] Emitindo room:players_updated para sala ${salaId} com jogadores:`, jogadoresNomes);
                   io.to(String(salaId)).emit('room:players_updated', { jogadores: jogadoresNomes });
               } else {
                   console.error(`---> [LEAVE /rooms/${salaId}/leave] Erro ao buscar jogadores atualizados pós-saída:`, jogadoresError);
               }
           }
       } else {
            console.warn(`---> [LEAVE /rooms/${salaId}/leave] Instância do Socket.IO não encontrada.`);
       }
       res.json({ success: true, message: 'Você saiu da sala.' });

   } catch (e) {
       console.error(`---> [LEAVE /rooms/${req.params.salaId}/leave] ERRO GERAL NO CATCH:`, e);
       res.status(500).json({ error: e.message || 'Erro ao sair da sala.' });
   }
});


// --- ROTA EXISTENTE: Obter detalhes da sala ---
router.get('/:salaId', requireAuth, async (req, res) => {
    try {
        // --- CORREÇÃO DE TIPO DE DADO ---
        const salaId = Number(req.params.salaId); // Converte para Number
        // -------------------------
        const current_jogador_id = req.user.jogador_id;

        console.log(`---> [GET /rooms/${salaId}] REQUISIÇÃO RECEBIDA por jogador ${current_jogador_id}`);

        if (!salaId) return res.status(400).json({ error: 'ID da sala é obrigatório.' });

        // 1. Busca detalhes da sala
        const { data: salaData, error: salaError } = await supa
            .from('sala')
            .select(`
                sala_id, nome_sala, status, jogador_criador_id,
                jogador:jogador_criador_id ( nome_de_usuario ),
                temas_excluidos, letras_excluidas
            `)
            .eq('sala_id', salaId) // Agora 'salaId' é um Number
            .single();

        if (salaError) throw salaError;
        if (!salaData) {
            console.log(`---> [GET /rooms/${salaId}] Sala NÃO encontrada no banco.`);
            return res.status(404).json({ error: 'Sala não encontrada.' });
        }

        // ... (resto da lógica /:salaId)
        console.log(`---> [GET /rooms/${salaId}] Status encontrado no banco: '${salaData.status}'`);
        if (salaData.status === 'abandonada') {
            console.log(`---> [GET /rooms/${salaId}] Status é 'abandonada'. Retornando 410 Gone.`);
            return res.status(410).json({ error: 'Esta sala foi abandonada pelo criador.' });
        }
        console.log(`---> [GET /rooms/${salaId}] Status OK. Buscando jogadores...`);
        const { data: jogadoresData, error: jogadoresError } = await supa
            .from('jogador_sala')
            .select(`jogador:jogador_id ( jogador_id, nome_de_usuario )`)
            .eq('sala_id', salaId);
        if (jogadoresError) throw jogadoresError;
        const jogadoresNaSala = (jogadoresData || []).map(js => js.jogador?.nome_de_usuario || `Jogador ${js.jogador?.jogador_id}`);
        console.log(`---> [GET /rooms/${salaId}] Jogadores encontrados:`, jogadoresNaSala);
        const is_creator = salaData.jogador_criador_id === current_jogador_id;
        const responseData = {
            sala_id: salaData.sala_id,
            nome_sala: salaData.nome_sala,
            status: salaData.status,
            jogador: {
                jogador_id: salaData.jogador_criador_id,
                nome_de_usuario: salaData.jogador?.nome_de_usuario || 'Desconhecido'
            },
            jogadores: jogadoresNaSala,
            temas_excluidos: salaData.temas_excluidos || [],
            letras_excluidas: salaData.letras_excluidas || [],
            is_creator: is_creator
        };
        res.json(responseData);

    } catch (e) {
        console.error(`---> [GET /rooms/${req.params.salaId}] ERRO GERAL NO CATCH:`, e);
        if (e.code === 'PGRST116') { // Not found from single()
             return res.status(404).json({ error: 'Sala não encontrada.' });
        }
        res.status(500).json({ error: e.message || 'Erro ao buscar detalhes da sala.' });
    }
});
export default router;