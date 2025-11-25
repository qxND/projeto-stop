// routes/auth.js
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { supa } from '../services/supabase.js'
import requireAuth from '../middlewares/requireAuth.js' // <--- ADICIONE ISTO

const router = Router()
const JWT_SECRET = process.env.JWT_SECRET || 'developer_secret_key'
const JWT_EXPIRES_IN = '6h' // ajustar conforme necessário

// POST /auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, nome_de_usuario } = req.body
    if (!email || !password || !nome_de_usuario) {
      return res.status(400).json({ error: 'email, senha e nome de usuário são obrigatórios' })
    }

 
    const allowedDomains = [
      'gmail.com',
      'hotmail.com',
      'outlook.com',
      'yahoo.com',
      'icloud.com'
      // Adicione aqui outros domínios que deseja permitir
    ];

    let emailDomain;
    try {
      emailDomain = email.split('@')[1].toLowerCase();
    } catch (splitError) {
      // Isso falha se o email não tiver '@' ou for inválido
      return res.status(400).json({ error: 'Formato de email inválido' });
    }

    if (!allowedDomains.includes(emailDomain)) {
      return res.status(400).json({ 
        error: 'Dominio de email inválido, adicione um dominio valido' 
      });
    }
    
    const { data: existing, error: e1 } = await supa
      .from('jogador')
      .select('jogador_id')
      .or(`email.eq.${email},nome_de_usuario.eq.${nome_de_usuario}`)
      .maybeSingle()
    if (e1) throw e1
    if (existing) {
      return res.status(409).json({ error: 'email ou nome de usuários já cadastrados' })
    }

    const senha_hash = await bcrypt.hash(password, 8)
    const ins = await supa.from('jogador').insert({
      nome_de_usuario,
      email,
      senha_hash
    }).select('jogador_id, nome_de_usuario, email').single()
    if (ins.error) throw ins.error

    const jogador = ins.data
    const { error: rpcError } = await supa.rpc('dar_itens_iniciais', {
      p_jogador_id: jogador.jogador_id // Usa o ID do jogador recém-criado
    });

    if (rpcError) {
      console.error(`Erro ao dar itens iniciais para jogador ${jogador.jogador_id}:`, rpcError.message);
    }
    const token = jwt.sign({ sub: jogador.jogador_id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })

    res.json({ token, jogador })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST /auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ error: 'email e senha obrigatórios' })

    const { data: user, error } = await supa.from('jogador').select('jogador_id, nome_de_usuario, email, senha_hash, role').eq('email', email).maybeSingle()
    if (error) throw error
    if (!user) return res.status(401).json({ error: 'Credenciais invalidas' })

    const ok = await bcrypt.compare(password, user.senha_hash)
    if (!ok) return res.status(401).json({ error: 'Credenciais invalidas' })

    const token = jwt.sign({ sub: user.jogador_id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
    // return user without senha_hash
    const jogador = { jogador_id: user.jogador_id, nome_de_usuario: user.nome_de_usuario, email: user.email, role: user.role }
    res.json({ token, jogador })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET /auth/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    // O middleware 'requireAuth' já fez todo o trabalho:
    // 1. Verificou o token
    // 2. Buscou o jogador no banco (incluindo 'avatar_nome')
    // 3. Anexou o jogador em 'req.user'

    // Apenas retornamos o jogador que o middleware encontrou
    const jogador_id = req.user.jogador_id;

    // Buscar estatísticas de ranking
    const { data: rankingStats, error: rankingError } = await supa.rpc('get_ranking_stats', { p_jogador_id: jogador_id });

    if (rankingError) {
      console.error('Erro ao buscar estatísticas de ranking:', rankingError);
      // Não impede o retorno do perfil, apenas loga o erro
    }

    const stats = rankingStats && rankingStats.length > 0 ? rankingStats[0] : { partidas_jogadas: 0, vitorias: 0, pontuacao_total: 0 };

    res.json({
      jogador: {
        ...req.user,
        ranking_stats: stats
      }
    });

  } catch (e) {
    // O requireAuth já trata erros 401,
    // este catch é apenas para segurança.
    res.status(500).json({ error: 'Erro interno', message: e.message });
  }
});

// === NOVA ROTA ===
// PUT /auth/avatar (Para salvar o novo avatar)
router.put('/avatar', async (req, res) => {
  try {
    // 1. Autenticar o usuário (pegar o ID do token)
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'header de autorização faltando' });
    }
    const token = auth.split(' ')[1];
    const payload = jwt.verify(token, JWT_SECRET);
    const jogador_id = payload.sub;

    // 2. Pegar o nome do avatar do corpo da requisição
    const { avatar_nome } = req.body;
    if (!avatar_nome) {
      return res.status(400).json({ error: 'avatar_nome necessário' });
    }

    // 3. Atualizar o banco de dados
    const { data, error } = await supa
      .from('jogador')
      .update({ avatar_nome: avatar_nome })
      .eq('jogador_id', jogador_id)
      .select('avatar_nome') // Retorna o novo valor
      .single();

    if (error) throw error;

    res.json({ success: true, avatar_nome: data.avatar_nome });
  } catch (e) {
    res.status(401).json({ error: 'token inválido', message: e.message });
  }
});

router.put('/personagem', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'header de autorização faltando' });
    }
    const token = auth.split(' ')[1];
    const payload = jwt.verify(token, JWT_SECRET);
    const jogador_id = payload.sub;

    const { personagem_nome } = req.body;
    if (!personagem_nome) {
      return res.status(400).json({ error: 'personagem_nome necessário' });
    }

    const { data, error } = await supa
      .from('jogador')
      .update({ personagem_nome: personagem_nome })
      .eq('jogador_id', jogador_id)
      .select('personagem_nome')
      .single();

    if (error) throw error;

    res.json({ success: true, personagem_nome: data.personagem_nome });
  } catch (e) {
    res.status(401).json({ error: 'token inválido', message: e.message });
  }
});

// ROTA: reset imediato sem email/token
// POST /auth/instant-reset
// body: { email, newPassword }
router.post('/instant-reset', async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    if (!email || !newPassword) return res.status(400).json({ error: 'email e newPassword obrigatórios' });
    if (typeof newPassword !== 'string' || newPassword.length < 6) return res.status(400).json({ error: 'Senha mínima de 6 caracteres' });

    // buscar jogador pelo email
    const { data: user, error: userErr } = await supa
      .from('jogador')
      .select('jogador_id, nome_de_usuario, email')
      .eq('email', email)
      .maybeSingle();

    if (userErr) throw userErr;

    // Segurança: não dizer explicitamente que o email não existe — retorna mensagem genérica
    if (!user) {
      console.warn(`instant-reset solicitado para email inexistente: ${email}`);
      // responder 200 para evitar enumeração de emails
      return res.json({ message: 'Se existir uma conta com esse email, a senha foi atualizada.' });
    }

    // atualizar senha imediatamente
    const senha_hash = await bcrypt.hash(newPassword, 8);
    const { error: updateErr } = await supa
      .from('jogador')
      .update({ senha_hash })
      .eq('jogador_id', user.jogador_id);

    if (updateErr) throw updateErr;

    // sucesso (resposta genérica)
    return res.json({ message: 'Se existir uma conta com esse email, a senha foi atualizada.' });
  } catch (e) {
    console.error('instant-reset error:', e);
    res.status(500).json({ error: e.message });
  }
});


export default router;
