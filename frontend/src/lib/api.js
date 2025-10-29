import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// injeta Authorization: Bearer <token>
api.interceptors.request.use(
  (config) => {
    // --- LOGS ADICIONADOS ---
    console.log(`[API Interceptor] Interceptando request para: ${config.url}`);
    const token = localStorage.getItem('token');
    console.log(`[API Interceptor] Token lido do localStorage: ${token ? 'ENCONTRADO' : 'NÃO ENCONTRADO'}`);
    // -------------------------

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      console.log('[API Interceptor] Header Authorization DEFINIDO.'); // Log de sucesso
    } else {
      console.warn('[API Interceptor] Header Authorization NÃO definido (token ausente).'); // Log de aviso
    }
    return config;
  },
  (error) => Promise.reject(error),
);

export default api;