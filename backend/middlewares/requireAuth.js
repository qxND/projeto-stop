// backend/src/middlewares/requireAuth.js

import { supabaseAdmin } from '../services/supabase.js';

export async function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing Authorization header' });
    }
    const token = auth.split(' ')[1];

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user?.email) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Resolve jogador_id (numérico) pela sua tabela
    const { data: jogador, error: jErr } = await supabaseAdmin
      .from('jogador')
      .select('jogador_id, nome_de_usuario, email')
      .eq('email', data.user.email)
      .maybeSingle();

    if (jErr || !jogador) {
      return res.status(401).json({ error: 'Perfil de jogador não encontrado' });
    }

    req.user = {
      supabase_user_id: data.user.id,
      email: data.user.email,
      jogador_id: Number(jogador.jogador_id),
      nome_de_usuario: jogador.nome_de_usuario
    };

    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token', message: e.message });
  }
}
