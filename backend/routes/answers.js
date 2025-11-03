// routes/answers.js
import { Router } from 'express'
import { supabaseAdmin } from '../services/supabase.js'
import { requireAuth } from '../middlewares/requireAuth.js'

const router = Router()

/**
 * POST /answers
 * Body: { rodada_id, tema_id, texto }
 * - Usa jogador do token (req.user.jogador_id). Se faltar, tenta fallback do body (compat).
 * - Upsert em participacao_rodada por (rodada_id, jogador_id, tema_nome).
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const authJogadorId = req?.user?.jogador_id
    const {
      rodada_id,
      tema_id,
      texto = '',
      jogador_id: jogadorIdFromBody, // fallback compat
    } = req.body

    console.log('[answers] recv', {
      rodada_id,
      tema_id,
      byAuth: authJogadorId ?? null,
      byBody: jogadorIdFromBody ?? null,
      len: String(texto || '').length,
    })

    if (!rodada_id || !tema_id) {
      return res.status(400).json({ error: 'rodada_id e tema_id são obrigatórios' })
    }

    const jogador_id = Number(authJogadorId || jogadorIdFromBody || 0)
    if (!jogador_id) {
      return res.status(401).json({ error: 'jogador_id não encontrado (token ausente?)' })
    }

    // 1) pegar nome do tema (o score agrupa por nome)
    const qTema = await supa
      .from('tema')
      .select('tema_nome')
      .eq('tema_id', tema_id)
      .maybeSingle()
    if (qTema.error) throw qTema.error
    if (!qTema.data?.tema_nome) {
      return res.status(400).json({ error: `Tema inválido (tema_id=${tema_id})` })
    }
    const tema_nome = qTema.data.tema_nome

    // 2) valida se este tema faz parte desta rodada
    const qTemaDaRodada = await supa
      .from('rodada_tema')
      .select('rodada_id')
      .eq('rodada_id', rodada_id)
      .eq('tema_id', tema_id)
      .maybeSingle()
    if (qTemaDaRodada.error) throw qTemaDaRodada.error
    if (!qTemaDaRodada.data) {
      return res.status(400).json({ error: 'tema_id não pertence a esta rodada' })
    }

    // 3) UPSERT atômico evita corrida e duplicatas
    const payload = {
      rodada_id: Number(rodada_id),
      jogador_id: Number(jogador_id),
      tema_nome,
      resposta: String(texto || '').trim(),
      pontos: 0, // scoring atualiza após STOP
    }

    const up = await supa
      .from('participacao_rodada')
      .upsert(payload, {
        onConflict: 'rodada_id,jogador_id,tema_nome',
        ignoreDuplicates: false
      })
    if (up.error) throw up.error

    console.log('[answers] upsert ok', { rodada_id, jogador_id, tema_nome })
    return res.json({ ok: true })
  } catch (e) {
    console.error('[answers] error', e)
    return res.status(500).json({ error: e.message })
  }
})

export default router
