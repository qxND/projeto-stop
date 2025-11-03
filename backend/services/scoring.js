// services/scoring.js
import { supa } from './supabase.js'

function normalize(str) {
  if (!str) return ''
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase()
}

export async function scoreRound(roundId) {
  // pega rodada + letra
  const { data: round, error: eRound } = await supabaseAdmin
    .from('rodada')
    .select('rodada_id, sala_id, numero_da_rodada, letra:letra_id(letra_caractere)')
    .eq('rodada_id', roundId).single()
  if (eRound) throw eRound
  const letra = round.letra.letra_caractere?.toUpperCase()

  // jogadores da sala
  const { data: jogadoresSala } = await supabaseAdmin
    .from('jogador_sala')
    .select('jogador_id')
    .eq('sala_id', round.sala_id)
  const jogadores = (jogadoresSala || []).map(j => j.jogador_id)

  // 4 temas da rodada
  const { data: temas, error: eTemas } = await supabaseAdmin
    .from('rodada_tema')
    .select('tema:tema_id(tema_id, tema_nome)')
    .eq('rodada_id', roundId)
  if (eTemas) throw eTemas
  const temaList = temas.map(t => t.tema)

  // EXISTENTES
  const { data: existentes } = await supabaseAdmin
    .from('participacao_rodada')
    .select('participacao_id, jogador_id, tema_nome, resposta, pontos')
    .eq('rodada_id', roundId)

  // 👇 PREENCHE FALTANTES: para cada (jogador × tema) que não tem linha, cria uma “vazia”
  const precisaInserir = []
  for (const tema of temaList) {
    for (const jogador of jogadores) {
      const tem = existentes?.some(r => r.jogador_id === jogador && r.tema_nome === tema.tema_nome)
      if (!tem) {
        precisaInserir.push({
          rodada_id: roundId,
          jogador_id: jogador,
          tema_nome: tema.tema_nome,
          resposta: null,
          pontos: 0
        })
      }
    }
  }
  if (precisaInserir.length > 0) {
    await supabaseAdmin.from('participacao_rodada').insert(precisaInserir)
  }

  // Reconsulta já com placeholders
  const { data: respostas, error: eResp2 } = await supabaseAdmin
    .from('participacao_rodada')
    .select('participacao_id, jogador_id, tema_nome, resposta, pontos')
    .eq('rodada_id', roundId)
  if (eResp2) throw eResp2

  // organiza por tema
  const byTema = new Map()
  for (const r of respostas) {
    const key = r.tema_nome
    if (!byTema.has(key)) byTema.set(key, [])
    byTema.get(key).push(r)
  }

  // calcula pontos
  const updates = []
  const roundScore = new Map() // jogador_id -> soma na rodada

  const addScore = (j, pts) => roundScore.set(j, (roundScore.get(j) || 0) + pts)

  for (const tema of temaList) {
    const entries = (byTema.get(tema.tema_nome) || []).slice(0, 2) // esperamos 2
    // garante 2 posições
    const a = entries[0] || { resposta: '', jogador_id: null, participacao_id: null }
    const b = entries[1] || { resposta: '', jogador_id: null, participacao_id: null }

    const A = normalize(a.resposta)
    const B = normalize(b.resposta)
    const startsWith = (s) => s && s[0] === (letra || '').toUpperCase()

    const aValida = A && startsWith(A)
    const bValida = B && startsWith(B)

    let pa = 0, pb = 0
    if (aValida && bValida) {
      if (A === B) { pa = 5; pb = 5 } else { pa = 10; pb = 10 }
    } else if (aValida && !bValida) {
      pa = 10; pb = 0
    } else if (!aValida && bValida) {
      pa = 0; pb = 10
    } else {
      pa = 0; pb = 0
    }

    if (a.participacao_id) {
      updates.push({ id: a.participacao_id, pontos: pa })
      if (a.jogador_id) addScore(a.jogador_id, pa)
    }
    if (b.participacao_id) {
      updates.push({ id: b.participacao_id, pontos: pb })
      if (b.jogador_id) addScore(b.jogador_id, pb)
    }
  }

  // aplica pontos
  for (const u of updates) {
    await supabaseAdmin.from('participacao_rodada').update({ pontos: u.pontos }).eq('participacao_id', u.id)
  }

  return {
    sala_id: round.sala_id,
    numero_da_rodada: round.numero_da_rodada,
    roundScore: Object.fromEntries(roundScore)
  }
}
