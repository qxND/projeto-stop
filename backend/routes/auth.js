// backend/routes/auth.js
import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { supabaseAdmin } from '../services/supabase.js'

const router = Router()
const url = process.env.SUPABASE_URL
const anon = process.env.SUPABASE_ANON_KEY
const SKIP_CONFIRM = String(process.env.AUTH_SKIP_EMAIL_CONFIRM || 'false') === 'true'

function toCompatJogador(perfil) {
  if (!perfil) return null
  return {
    jogador_id: perfil.jogador_id,           // <- devolve o ID numérico existente
    nome_de_usuario: perfil.nome_de_usuario,
    email: perfil.email
  }
}


router.post('/register', async (req, res) => {
  try {
    const { email, password, nome_de_usuario } = req.body
    if (!email || !password || !nome_de_usuario) {
      return res.status(400).json({ error: 'email, password e nome_de_usuario são obrigatórios' })
    }

    // 1) cria usuário no Supabase Auth
    const { data: created, error: e1 } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      user_metadata: { nome_de_usuario },
      email_confirm: SKIP_CONFIRM
    })
    if (e1) return res.status(400).json({ error: e1.message })
    const user = created.user

    // 2) salva perfil na sua tabela LEGADA (que exige senha_hash)
    const senha_hash = await bcrypt.hash(password, 8)

    const up = await supabaseAdmin
      .from('jogador')
      .upsert(
        { nome_de_usuario, email, senha_hash },  // <- NÃO use user.id aqui; sua tabela não tem user_id ainda
        { onConflict: 'email' }                  // <- evita duplicar por email
      )
      .select('jogador_id, nome_de_usuario, email')
      .maybeSingle()
    if (up.error) return res.status(500).json({ error: up.error.message })

    // 3) fluxo de confirmação
    if (!SKIP_CONFIRM) {
      return res.json({
        user,
        jogador: toCompatJogador(up.data),
        require_email_confirmation: true
      })
    }

    // 4) DEV: login automático
    const supa = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data: login, error: eLogin } = await supa.auth.signInWithPassword({ email, password })
    if (eLogin) return res.status(401).json({ error: eLogin.message })

    return res.json({
      access_token: login.session?.access_token,
      refresh_token: login.session?.refresh_token,
      user: login.user,
      jogador: toCompatJogador(up.data),
      require_email_confirmation: false
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})


router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ error: 'email e password são obrigatórios' })

    const supa = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data, error } = await supa.auth.signInWithPassword({ email, password })
    if (error) return res.status(401).json({ error: error.message })

    // Perfil legado por email
    const supaUser = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${data.session?.access_token}` } },
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const prof = await supaUser
      .from('jogador')
      .select('jogador_id, nome_de_usuario, email')
      .eq('email', email)
      .maybeSingle()
    if (prof.error) return res.status(500).json({ error: prof.error.message })

    return res.json({
      access_token: data.session?.access_token,
      refresh_token: data.session?.refresh_token,
      user: data.user,
      jogador: toCompatJogador(prof.data)
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})


// POST /auth/refresh  (para Axios renovar tokens)
router.post('/refresh', async (req, res) => {
  try {
    const { refresh_token } = req.body
    if (!refresh_token) return res.status(400).json({ error: 'refresh_token é obrigatório' })
    const supa = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data, error } = await supa.auth.refreshSession({ refresh_token })
    if (error) return res.status(401).json({ error: error.message })
    return res.json({
      access_token: data.session?.access_token,
      refresh_token: data.session?.refresh_token,
      user: data.user
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.get('/me', async (req, res) => {
  try {
    const auth = req.headers.authorization
    if (!auth?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing Authorization header' })
    }
    const token = auth.split(' ')[1]

    const supa = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data, error } = await supa.auth.getUser(token)
    if (error || !data?.user) return res.status(401).json({ error: 'Invalid token' })

    const supaUser = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const prof = await supaUser
      .from('jogador')
      .select('jogador_id, nome_de_usuario, email')
      .eq('email', data.user.email)
      .maybeSingle()
    if (prof.error) return res.status(500).json({ error: prof.error.message })

    return res.json({ user: data.user, jogador: toCompatJogador(prof.data) })
  } catch (e) {
    res.status(401).json({ error: 'Invalid token', message: e.message })
  }
})


export default router
