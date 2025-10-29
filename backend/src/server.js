// backend/src/server.js
import 'dotenv/config'
import http from 'http'
import express from 'express'
import cors from 'cors'
import morgan from 'morgan'

import authRouter from '../routes/auth.js'
import roomsRouter from '../routes/rooms.js'
import answersRouter from '../routes/answers.js'
import matchesRouter from '../routes/matches.js'
import shopRouter from '../routes/shop.js'; 

import { initSockets } from './sockets.js'

const app = express()
app.use(cors({ origin: '*' }))
app.use(express.json())
app.use(morgan('dev'))

// Rotas REST
app.use('/auth', authRouter)
app.use('/rooms', roomsRouter)
app.use('/answers', answersRouter)
app.use('/matches', matchesRouter)
app.use('/shop', shopRouter);

// Healthcheck
app.get('/health', (req, res) => res.json({ ok: true }))

// HTTP + Socket.IO
const server = http.createServer(app)
initSockets(server)

const PORT = Number(process.env.PORT || 3001)
server.listen(PORT, () => {
  console.log(`API rodando em http://localhost:${PORT}`)
})
