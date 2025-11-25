// routes/feedback.js
import { Router } from 'express';
import { supa } from '../services/supabase.js';
import requireAuth from '../middlewares/requireAuth.js';
import requireRole from '../middlewares/requireRole.js';
import jwt from 'jsonwebtoken';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'developer_secret_key';

// POST /api/feedback - Submit new feedback
router.post('/', async (req, res) => {
  const { feedback_type, feedback_message } = req.body;

  if (!feedback_type || !feedback_message) {
    return res.status(400).json({ error: 'Feedback type and message are required.' });
  }

  const validTypes = ['improvement', 'bug_report', 'compliment'];
  if (!validTypes.includes(feedback_type)) {
    return res.status(400).json({ error: 'Invalid feedback type.' });
  }
  
  let jogador_id = null;
  let nome_jogador = 'Anonymous';

  // Check for an optional Authorization header
  const { authorization } = req.headers;
  if (authorization && authorization.startsWith('Bearer ')) {
    const token = authorization.split(' ')[1];
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      const { data: user, error } = await supa
        .from('jogador')
        .select('jogador_id, nome_de_usuario')
        .eq('jogador_id', payload.sub)
        .single();
      
      if (user && !error) {
        jogador_id = user.jogador_id;
        nome_jogador = user.nome_de_usuario;
      }
    } catch (e) {
      // Ignore token errors, proceed as anonymous
      console.warn('Could not process auth token for feedback:', e.message);
    }
  }


  try {
    const { data, error } = await supa
      .from('feedback')
      .insert({
        jogador_id,
        nome_jogador,
        feedback_type,
        feedback_message,
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(data);
  } catch (error) {
    console.error('Error saving feedback:', error);
    res.status(500).json({ error: 'Failed to save feedback.' });
  }
});

// GET /api/feedback - Retrieve all feedback (Admin only)
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { data, error } = await supa
      .from('feedback')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error fetching feedback:', error);
    res.status(500).json({ error: 'Failed to fetch feedback.' });
  }
});

export default router;
