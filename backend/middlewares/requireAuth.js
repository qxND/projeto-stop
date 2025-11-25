// UploadiaBreno/backend/middlewares/requireAuth.js (Atualizado)

import jwt from 'jsonwebtoken'
import { supa } from '../services/supabase.js'

// Garanta que esta chave é a MESMA do seu routes/auth.js
const JWT_SECRET = process.env.JWT_SECRET || 'developer_secret_key'

const requireAuth = async (req, res, next) => {
  // 1. Pegar o token do cabeçalho
  const { authorization } = req.headers
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization token required' })
  }
  const token = authorization.split(' ')[1]

  try {
    // 2. Verificar o token com JWT (igual ao routes/auth.js)
    const payload = jwt.verify(token, JWT_SECRET)
    const jogador_id = payload.sub

    // 3. Buscar o jogador no banco (igual ao routes/auth.js)
    const { data: jogador, error } = await supa
      .from('jogador')
      .select('jogador_id, nome_de_usuario, email, avatar_nome, personagem_nome, role') // Já pegamos o avatar aqui também
      .eq('jogador_id', jogador_id)
      .maybeSingle()

    if (error) throw error
    if (!jogador) {
      return res.status(401).json({ error: 'User not found' })
    }

    // 4. Anexar o 'jogador' (não o 'user' do supabase) ao request
    req.user = jogador// Agora 'req.user' será o objeto do jogador
    req.jogadorId = jogador.jogador_id 
    console.log('[requireAuth] ID do jogador anexado:', req.jogadorId);
    next()
  } catch (e) {
    // Se jwt.verify falhar (expirado, inválido), cai aqui
    res.status(401).json({ error: 'Invalid token', message: e.message })
  }
}

export default requireAuth