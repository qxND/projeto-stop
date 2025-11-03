// frontend/src/lib/api.js
import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// REQUEST: injeta Authorization
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

let isRefreshing = false
let pending = []

function onRefreshed(newToken) {
  pending.forEach(cb => cb(newToken))
  pending = []
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original.__isRetryRequest) {
      const refresh = localStorage.getItem('refresh_token')
      if (!refresh) return Promise.reject(error)

      if (isRefreshing) {
        // aguarda refresh em andamento
        return new Promise((resolve) => {
          pending.push((newToken) => {
            original.headers.Authorization = `Bearer ${newToken}`
            resolve(api(original))
          })
        })
      }

      try {
        isRefreshing = true
        const { data } = await api.post('/auth/refresh', { refresh_token: refresh })
        const newToken = data.access_token
        const newRefresh = data.refresh_token

        if (newToken) localStorage.setItem('token', newToken)
        if (newRefresh) localStorage.setItem('refresh_token', newRefresh)

        isRefreshing = false
        onRefreshed(newToken)

        original.__isRetryRequest = true
        original.headers.Authorization = `Bearer ${newToken}`
        return api(original)
      } catch (e) {
        isRefreshing = false
        // logout básico
        localStorage.removeItem('token')
        localStorage.removeItem('refresh_token')
        localStorage.removeItem('meuJogadorId')
        return Promise.reject(e)
      }
    }
    return Promise.reject(error)
  }
)

export default api
