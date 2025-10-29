// src/middlewares/requireAuth.js
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'developer_secret_key';

export function requireAuth(req, res, next) {
  console.log(`[requireAuth] Checking auth for: ${req.method} ${req.originalUrl}`); // <-- ADD THIS
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      console.log("[requireAuth] FAILED: Missing Authorization header"); // <-- ADD THIS
      return res.status(401).json({ error: 'Missing Authorization header' });
    }
    const token = auth.split(' ')[1];
    console.log("[requireAuth] Token found:", token ? 'Yes' : 'No'); // <-- ADD THIS
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { jogador_id: payload.sub };
    console.log("[requireAuth] SUCCESS: User ID", req.user.jogador_id); // <-- ADD THIS
    next();
  } catch (e) {
    console.log("[requireAuth] FAILED: Invalid token -", e.message); // <-- ADD THIS
    return res.status(401).json({ error: 'Invalid token', message: e.message });
  }
}