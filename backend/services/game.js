// backend/services/game.js
import { supa } from './supabase.js'

/* =========================
   Utilidades
========================= */
function normalize(txt = '') {
  return String(txt)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
}

/* =========================
   Helpers de banco
========================= */

// CORRIGIDO: Adicionado 'export' para que possa ser importada
export async function getJogadoresDaSala(salaId) {
  const sId = Number(salaId)

  // A) fonte canônica
  const js = await supa
    .from('jogador_sala')
    .select('jogador_id')
    .eq('sala_id', sId)
    .order('jogador_id', { ascending: true })
  if (js.error) throw js.error
  let ids = (js.data || []).map(r => Number(r.jogador_id)).filter(Boolean)

  // B) fallback: participante_sala (REMOVIDO)

  return ids.sort((a,b) => a - b)
}


/** Core da rodada: sala + letra */
async function getRoundCore(rodadaId) {
  const r = await supa
    .from('rodada')
    .select('rodada_id, sala_id, letra_id')
    .eq('rodada_id', rodadaId)
    .maybeSingle()
  if (r.error) throw r.error
  if (!r.data) return null

  const qLetra = await supa
    .from('letra')
    .select('letra_id, letra_caractere')
    .eq('letra_id', r.data.letra_id)
    .maybeSingle()
  if (qLetra.error) throw qLetra.error

  return {
    rodada_id: r.data.rodada_id,
    sala_id: r.data.sala_id,
    letra_id: qLetra.data?.letra_id,
    letra: qLetra.data?.letra_caractere || ''
  }
}

/** Temas (id+nome) associados à rodada */
async function getRoundTemas(rodadaId) {
  const q = await supa
    .from('rodada_tema')
    .select('tema_id, tema:tema_id ( tema_nome )')
    .eq('rodada_id', rodadaId)
  if (q.error) throw q.error
  return (q.data || []).map(row => ({
    id: row.tema_id,
    nome: row.tema?.tema_nome || ''
  }))
}

/** Payload completo para o frontend */
export async function buildRoundPayload(rodadaId) {
  const core = await getRoundCore(rodadaId)
  if (!core) return null
  const temas = await getRoundTemas(rodadaId)
  return { ...core, temas }
}

async function getTemasDaRodada(rodadaId) {
  const { data, error } = await supa
    .from('rodada_tema')
    .select(`
      rodada_id,
      tema_id,
      tema:tema_id ( tema_nome )
    `)
    .eq('rodada_id', rodadaId)
  if (error) throw error
  return (data || []).map(row => ({
    rodada_id: row.rodada_id,
    tema_id: row.tema_id,
    tema_nome: row.tema?.tema_nome || ''
  }))
}

async function getRodadasFromSala(salaId) {
  const { data, error } = await supa
    .from('rodada')
    .select('rodada_id, numero_da_rodada')
    .eq('sala_id', Number(salaId))
    .order('numero_da_rodada', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getNextRoundForSala({ salaId, afterRoundId }) {
  const rounds = await getRodadasFromSala(salaId);
  if (!rounds.length) return null;

  const afterIdNum = Number(afterRoundId);
  const idx = rounds.findIndex(r => Number(r.rodada_id) === afterIdNum);

  if (idx === -1) {
    // ❌ NUNCA volte para a primeira; sinalize “acabou” para evitar loop
    return null;
  }

  const proxima = rounds[idx + 1];
  if (!proxima) return null; // ✅ fim das rodadas

  return await buildRoundPayload(proxima.rodada_id);
}

/* =========================
   Scoring helpers
========================= */
async function ensurePlaceholders({ rodadaId, jogadores, temas }) {
  const rows = []
  for (const jog of jogadores) {
    for (const t of temas) {
      rows.push({
        rodada_id: rodadaId,
        jogador_id: jog,
        tema_nome: t.tema_nome,
        resposta: '',
        pontos: 0
      })
    }
  }
  if (!rows.length) return
  const up = await supa
    .from('participacao_rodada')
    .upsert(rows, {
      onConflict: 'rodada_id,jogador_id,tema_nome',
      ignoreDuplicates: true
    })
  if (up.error) throw up.error
}

async function loadRespostasRodada({ rodadaId, jogadores, temas }) {
  const { data, error } = await supa
    .from('participacao_rodada')
    .select('jogador_id, tema_nome, resposta, pontos')
    .eq('rodada_id', rodadaId)
    .in('jogador_id', jogadores)
    .in('tema_nome', temas.map(t => t.tema_nome))
  if (error) throw error
  const map = {}
  for (const r of data || []) {
    map[r.tema_nome] ||= {}
    map[r.tema_nome][r.jogador_id] = { resposta: r.resposta || '', pontos: r.pontos || 0 }
  }
  return map
}

async function savePontuacao({ rodadaId, temaNome, jogadorId, pontos }) {
  const { error } = await supa
    .from('participacao_rodada')
    .update({ pontos })
    .eq('rodada_id', rodadaId)
    .eq('tema_nome', temaNome)
    .eq('jogador_id', jogadorId)
  if (error) throw error
}

async function computeTotaisSala({ salaId }) {
  const qRounds = await supa
    .from('rodada')
    .select('rodada_id')
    .eq('sala_id', salaId)
  if (qRounds.error) throw qRounds.error
  const rodadaIds = (qRounds.data || []).map(r => r.rodada_id)
  if (!rodadaIds.length) return {}

  const qPart = await supa
    .from('participacao_rodada')
    .select('jogador_id, pontos, rodada_id')
    .in('rodada_id', rodadaIds)
  if (qPart.error) throw qPart.error

  const totais = {}
  for (const r of qPart.data || []) {
    totais[r.jogador_id] = (totais[r.jogador_id] || 0) + (r.pontos || 0)
  }
  return totais
}

/**
 * Carrega o dicionário (resposta_base) para a letra da rodada
 * Retorna um mapa: { [tema_id]: Set<string_normalizada> }
 */
async function loadLexiconMap({ temaIds, letraId }) {
  if (!temaIds || !temaIds.length) return {} // Adiciona verificação
  if (!letraId) return {}; // Adiciona verificação

  const { data, error } = await supa
    .from('resposta_base')
    .select('tema_id, texto')
    .eq('letra_id', letraId)
    .in('tema_id', temaIds)
  
    if (error) throw error

  const map = {}
  for (const row of data || []) {
    const t = Number(row.tema_id)
    if (!map[t]) map[t] = new Set()
    map[t].add(normalize(row.texto))
  }
  return map
}

/* =========================
   SCORING (com dicionário)
========================= */
/**
 * HARDENING: encerra rodada com lock e pontua com base no dicionário
 * ATUALIZADO: Lógica de pontuação refeita para N jogadores
 *
 * *** PASSO 4 - MODIFICAÇÃO 1 INICIA AQUI ***
 */
export async function endRoundAndScore({ salaId, roundId, skippedWordsSet = null, disregardedOpponentWordsSet = null }) {
  // 🔒 Tenta ganhar o "lock" para evitar pontuação dupla
  const lock = await supa
    .from('rodada')
    .update({ status: 'scoring' })
    .eq('rodada_id', roundId)
    .in('status', ['ready', 'in_progress']) // Só pode pontuar se estava pronta ou em progresso
    .select('rodada_id')
    .maybeSingle()
  if (lock.error) throw lock.error
  if (!lock.data) {
    // Outro processo (ou o mesmo, em caso de erro anterior) já está pontuando ou já pontuou.
    console.warn(`[endRoundAndScore] Lock não adquirido ou rodada ${roundId} já em scoring/done.`);
    // Retorna os totais atuais para consistência, mas sem calcular placar da rodada novamente.
    // *** MODIFICADO: Chama getRoundResults para pegar os dados corretos ***
    return await getRoundResults({ salaId, roundId });
  }

  // ==== Fluxo normal de pontuação ====
  let jogadores = await getJogadoresDaSala(salaId) // Pega jogadores da tabela jogador_sala
  // Fallback: Se jogador_sala estiver vazio (ex: jogadores saíram?), pega quem participou
  if (!jogadores || jogadores.length === 0) {
    console.warn(`[endRoundAndScore] Nenhum jogador encontrado em jogador_sala para sala ${salaId}. Verificando participacao_rodada.`);
    const q = await supa
      .from('participacao_rodada')
      .select('jogador_id', { distinct: true }) // Pega IDs únicos
      .eq('rodada_id', roundId)
    if (q.error) throw q.error
    jogadores = (q.data || []).map(r => Number(r.jogador_id)).filter(Boolean).sort((a,b)=>a-b);
    if (jogadores.length === 0) {
        console.warn(`[endRoundAndScore] Nenhum jogador participou da rodada ${roundId}. Abortando pontuação.`);
        // Marca como done mesmo assim para não bloquear
        await supa.from('rodada').update({ status: 'done' }).eq('rodada_id', roundId);
        return { roundId, roundDetails: {}, totais: {} }; // Retorna vazio
    }
  }

  const temas = await getTemasDaRodada(roundId) // [{rodada_id, tema_id, tema_nome}]
  if (!temas || temas.length === 0) {
      console.warn(`[endRoundAndScore] Rodada ${roundId} não tem temas associados. Abortando pontuação.`);
      await supa.from('rodada').update({ status: 'done' }).eq('rodada_id', roundId);
      return { roundId, roundDetails: {}, totais: await computeTotaisSala({ salaId }) };
  }
  
  // Garante que existe uma linha em participacao_rodada para cada jogador/tema
  await ensurePlaceholders({ rodadaId: roundId, jogadores, temas })

  // Carrega todas as respostas (incluindo as placeholders vazias)
  const respostas = await loadRespostasRodada({ rodadaId: roundId, jogadores, temas })

  // Pega a letra da rodada (necessário para validação e para carregar o dicionário)
  const core = await getRoundCore(roundId)
  if (!core) { // Segurança extra
      console.error(`[endRoundAndScore] Falha ao carregar core da rodada ${roundId}.`);
      // Não reverter o status 'scoring' aqui, marcar como done
      await supa.from('rodada').update({ status: 'done' }).eq('rodada_id', roundId);
      return { roundId, roundDetails: {}, totais: await computeTotaisSala({ salaId }) };
  }
  const letraId = core.letra_id
  const letraChar = core.letra?.toUpperCase() || ''
  const letraNorm = normalize(letraChar); // Normaliza a letra da rodada uma vez

  // Carrega o dicionário de respostas válidas para esta letra e temas
  const temaIds = temas.map(t => t.tema_id);
  const lexicon = await loadLexiconMap({ temaIds, letraId });

  const roundDetails = {};
  const allJogadorIds = [...jogadores];

  // Itera sobre cada tema da rodada
  for (const t of temas) {
    const temaId = t.tema_id;
    const temaNome = t.tema_nome;
    const set = lexicon[temaId] || new Set(); // dicionário só para esse tema/letra

    const temaRespostas = {}; // { jogador_id: { resposta, norm, valida, pontos } }
    const validos = {};       // { resposta_normalizada: [jogador_id1, jogador_id2...] }

    // 1. Coleta e valida as respostas de TODOS os jogadores para este tema
    for (const jId of allJogadorIds) {
      const resposta = respostas[temaNome]?.[jId]?.resposta || '';
      const norm = normalize(resposta);          // normaliza (minúsculo, sem acento)
      const startsWith = letraNorm
        ? norm.startsWith(letraNorm)
        : false;

      // *** REGRAS QUE VOCÊ QUER ***
      // - tem que ter texto
      // - tem que começar com a letra da rodada
      // - tem que existir no dicionário resposta_base (set.has(norm))
      const valida = !!norm && startsWith && set.has(norm);

      temaRespostas[jId] = { resposta, norm, valida, pontos: 0 };

      if (valida) {
        if (!validos[norm]) validos[norm] = [];
        validos[norm].push(jId);
      }
    }

    // 2. Pontuação: 10 única, 5 repetida, 0 inválida
    for (const norm in validos) {
      const jogadoresComEstaResposta = validos[norm];

      if (jogadoresComEstaResposta.length === 1) {
        const jId = jogadoresComEstaResposta[0];
        const isDisregarded =
          disregardedOpponentWordsSet &&
          disregardedOpponentWordsSet.has(`${jId}-${temaNome}`);
        if (!isDisregarded) {
          temaRespostas[jId].pontos = 10;
        }
      } else {
        for (const jId of jogadoresComEstaResposta) {
          const isDisregarded =
            disregardedOpponentWordsSet &&
            disregardedOpponentWordsSet.has(`${jId}-${temaNome}`);
          if (!isDisregarded) {
            temaRespostas[jId].pontos = 5;
          }
        }
      }
    }

    // 2.5. Powerup SKIP_WORD (se você estiver usando)
    if (skippedWordsSet && skippedWordsSet.size > 0) {
      for (const jId of allJogadorIds) {
        const skipKey = `${jId}-${temaNome}`;
        if (skippedWordsSet.has(skipKey) && temaRespostas[jId].pontos === 0) {
          temaRespostas[jId].pontos = 10;
          console.log(`[SKIP_WORD] Jogador ${jId} ganhou 10 pontos por pular palavra em "${temaNome}"`);
        }
      }
    }

    // 3. Persiste pontos no banco + monta payload pro frontend
    roundDetails[temaNome] = {};
    for (const jId of allJogadorIds) {
      const p = temaRespostas[jId].pontos;
      const resposta = temaRespostas[jId].resposta;

      await savePontuacao({
        rodadaId: roundId,
        temaNome,
        jogadorId: jId,
        pontos: p,
      });

      roundDetails[temaNome][jId] = {
        resposta,
        pontos: p,
      };
    }
  }

  const totais = await computeTotaisSala({ salaId });
  await supa.from('rodada').update({ status: 'done' }).eq('rodada_id', roundId);

  return { roundId, roundDetails, totais };
}

/**
 * *** PASSO 4 - MODIFICAÇÃO 1 TERMINA AQUI ***
 */


/**
 * *** PASSO 4 - MODIFICAÇÃO 2 INICIA AQUI ***
 */
// Função auxiliar para buscar resultados de uma rodada já pontuada
export async function getRoundResults({ salaId, roundId }) {
  try {
    // Busca os jogadores da sala
    let jogadores = await getJogadoresDaSala(salaId);
    if (!jogadores || jogadores.length === 0) {
      const q = await supa
        .from('participacao_rodada')
        .select('jogador_id', { distinct: true })
        .eq('rodada_id', roundId);
      if (q.error) throw q.error;
      jogadores = (q.data || []).map(r => Number(r.jogador_id)).filter(Boolean).sort((a,b)=>a-b);
    }

    // Busca os temas da rodada
    const temas = await getTemasDaRodada(roundId);
    if (!temas || temas.length === 0) {
      // *** MODIFICADO: Retorna roundDetails vazio ***
      return { roundId, roundDetails: {}, totais: await computeTotaisSala({ salaId }) };
    }

    // Busca os resultados pontuados do banco
    // *** MODIFICADO: Seleciona 'resposta' também ***
    const { data: participacoes, error } = await supa
      .from('participacao_rodada')
      .select('jogador_id, tema_nome, pontos, resposta') // <-- MUDANÇA AQUI
      .eq('rodada_id', roundId)
      .in('jogador_id', jogadores)
      .in('tema_nome', temas.map(t => t.tema_nome));

    if (error) throw error;

    // Constrói o roundDetails no formato esperado
    // *** MODIFICADO: Renomeado roundScore para roundDetails ***
    const roundDetails = {};
    for (const tema of temas) {
      roundDetails[tema.tema_nome] = {};
      for (const jId of jogadores) {
        const participacao = participacoes?.find(p => p.jogador_id === jId && p.tema_nome === tema.tema_nome);
        // *** MODIFICADO: Salva objeto { resposta, pontos } ***
        roundDetails[tema.tema_nome][jId] = {
            resposta: participacao?.resposta || '',
            pontos: participacao?.pontos || 0
        };
      }
    }

    // Calcula os totais
    const totais = await computeTotaisSala({ salaId });

    // *** MODIFICADO: Retorna roundDetails ***
    return { roundId, roundDetails, totais };
    
  } catch (err) {
    console.error(`[getRoundResults] Erro ao buscar resultados da rodada ${roundId}:`, err);
    // *** MODIFICADO: Retorna roundDetails vazio ***
    return { roundId, roundDetails: {}, totais: await computeTotaisSala({ salaId }) };
  }
}
/**
 * *** PASSO 4 - MODIFICAÇÃO 2 TERMINA AQUI ***
 */


/* =========================
   Sorteio coerente (letra com >=4 temas)
========================= */
export async function generateCoherentRounds({ totalRounds = 5 }) {
  // 1) Carrega TODAS as combinações de letra x tema que existem na resposta_base
  let allRows = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supa
      .from('resposta_base')
      .select('tema_id, letra_id')
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data?.length) break;

    allRows = allRows.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  // 2) Monta mapa: letra_id -> Set(tema_id) (somente temas que têm dicionário)
  const mapa = {};
  for (const r of allRows || []) {
    const lid = Number(r.letra_id);
    const tid = Number(r.tema_id);
    if (!mapa[lid]) mapa[lid] = new Set();
    mapa[lid].add(tid);
  }

  // 3) Filtra letras que têm pelo menos 4 temas
  const letrasValidas = Object.entries(mapa)
    .filter(([_, temasSet]) => temasSet.size >= 4)
    .map(([lid]) => Number(lid));

  if (letrasValidas.length < totalRounds) {
    throw new Error(
      `Não há letras suficientes com >= 4 temas em resposta_base para gerar ${totalRounds} rodadas.`
    );
  }

  // 4) Embaralha e escolhe as letras
  const pool = [...letrasValidas];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const letrasEscolhidas = pool.slice(0, totalRounds);

  // 5) Busca nomes das letras
  const { data: letrasTbl, error: eL } = await supa
    .from('letra')
    .select('letra_id, letra_caractere')
    .in('letra_id', letrasEscolhidas);
  if (eL) throw eL;

  const letraIdToChar = {};
  for (const l of letrasTbl || []) {
    letraIdToChar[Number(l.letra_id)] = l.letra_caractere;
  }

  // 6) Busca todos os temas para mapear id -> nome
  const { data: temasTbl, error: eT } = await supa
    .from('tema')
    .select('tema_id, tema_nome');
  if (eT) throw eT;

  const temaIdToName = {};
  for (const t of temasTbl || []) {
    temaIdToName[Number(t.tema_id)] = t.tema_nome;
  }

  // 7) Monta as rodadas no FORMATO ESPERADO por /matches/start:
  //    { letra_id, letra_char, temas: [{ tema_id, tema_nome }] }
  const rounds = [];
  for (const letra_id of letrasEscolhidas) {
    const temasPossiveisParaLetra = [...(mapa[letra_id] || [])];

    // Embaralha temas
    for (let i = temasPossiveisParaLetra.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [temasPossiveisParaLetra[i], temasPossiveisParaLetra[j]] = [
        temasPossiveisParaLetra[j],
        temasPossiveisParaLetra[i]
      ];
    }

    const temasEscolhidosIds = temasPossiveisParaLetra.slice(0, 4);

    const temasObjs = temasEscolhidosIds.map(id => ({
      tema_id: id,
      tema_nome: temaIdToName[id] || ''
    }));

    rounds.push({
      letra_id,
      letra_char: letraIdToChar[letra_id] || '',
      temas: temasObjs
    });
  }

  return rounds;
}



/* =========================
   LETRAS sem repetição (fallback antigo - manter caso precise?)
========================= */
export function pickLettersNoRepeat({ total, blacklist = [] }) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter(ch => !blacklist.includes(ch))
  for (let i = A.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[A[i], A[j]] = [A[j], A[i]]
  }
  return A.slice(0, total)
}