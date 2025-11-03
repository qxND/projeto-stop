// frontend/src/lib/socket.js
import { io } from 'socket.io-client'

const BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'

// Cria socket SEM autoconectar
let socket = io(BASE, {
  autoConnect: false,
  transports: ['websocket'],
  auth: { token: null }
})

export function connectSocket(token) {
  try {
    socket.auth = { token: token || null }
    if (socket.connected) socket.disconnect()
    socket.connect()
  } catch (e) {
    console.warn('Erro ao conectar socket:', e.message)
  }
}

export function joinRoom(salaId) {
  socket.emit('join-room', String(salaId))
}

export { socket }
export default socket
