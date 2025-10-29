// frontend/src/pages/GameScreen.jsx
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../lib/api'
import socket, { joinRoom } from '../lib/socket'
import CategoryRow from '../components/CategoryRow'

export default function GameScreen() {
  const { salaId } = useParams()
  const meuJogadorId = Number(
    localStorage.getItem('meuJogadorId') ||
    sessionStorage.getItem('meuJogadorId') ||
    '0'
  )

  const [rodadaId, setRodadaId] = useState(null)
  const [letra, setLetra] = useState('')
  const [temas, setTemas] = useState([]) // [{id,nome}]
  const [timeLeft, setTimeLeft] = useState(null)
  const [answers, setAnswers] = useState({}) // temaId -> texto

  const [placarRodada, setPlacarRodada] = useState({})
  const [totais, setTotais] = useState({})
  const [finalizado, setFinalizado] = useState(false)
  const [vencedor, setVencedor] = useState(null)
  const [isLocked, setIsLocked] = useState(false)

  // mapa de timers por temaId para debounce
  const debounceTimers = useRef(new Map())

  useEffect(() => {
    joinRoom(salaId)

    const onReady = (data) => {
      setRodadaId(data.rodada_id)
      setLetra(data.letra)
      setTemas(data.temas) // [{id,nome}]
      setAnswers({})
      setTimeLeft(null)
      setIsLocked(false)
      // limpa qualquer debounce pendente
      for (const t of debounceTimers.current.values()) clearTimeout(t)
      debounceTimers.current.clear()
    }

    const onStarted = ({ duration }) => {
      setTimeLeft(duration)
      setPlacarRodada({})
      setIsLocked(false)
    }

    const onTick = (t) => setTimeLeft(t)

    const onStopping = async ({ roundId }) => {
      setIsLocked(true)
      try {
        await enviarRespostas(roundId) // envio final
      } catch (e) {
        console.error('auto-send on stopping failed', e)
      }
    }

    const onEnd = ({ roundId, roundScore, totais }) => {
      setPlacarRodada(roundScore || {})
      setTotais(totais || {})
      setTimeLeft(null)
      setIsLocked(true)
    }

    const onMatchEnd = ({ totais, vencedor }) => {
      setFinalizado(true)
      setTotais(totais || {})
      setVencedor(vencedor)
      setIsLocked(true)
    }

    socket.on('round:ready', onReady)
    socket.on('round:started', onStarted)
    socket.on('round:tick', onTick)
    socket.on('round:stopping', onStopping)
    socket.on('round:end', onEnd)
    socket.on('match:end', onMatchEnd)

    return () => {
      socket.off('round:ready', onReady)
      socket.off('round:started', onStarted)
      socket.off('round:tick', onTick)
      socket.off('round:stopping', onStopping)
      socket.off('round:end', onEnd)
      socket.off('match:end', onMatchEnd)
      for (const t of debounceTimers.current.values()) clearTimeout(t)
      debounceTimers.current.clear()
    }
  }, [salaId])

  const iniciarPartida = async () => {
    await api.post('/matches/start', { sala_id: Number(salaId), duration: 20 })
  }

  // ---- AUTOSAVE (debounced) ----
  async function autosaveAnswer(temaId, texto) {
    // ignora se não temos rodada ou está travado
    if (!rodadaId || isLocked) return
    const key = String(temaId)

    // limpa debounce anterior
    const prev = debounceTimers.current.get(key)
    if (prev) clearTimeout(prev)

    // agenda envio em 250ms
    const t = setTimeout(async () => {
      try {
        await api.post('/answers', {
          rodada_id: Number(rodadaId),
          tema_id: Number(temaId),
          texto: String(texto || '')
        })
      } catch (e) {
        console.error('autosave fail', { rodadaId, temaId }, e?.response?.data || e)
      } finally {
        debounceTimers.current.delete(key)
      }
    }, 250)

    debounceTimers.current.set(key, t)
  }

  const updateAnswer = (temaId, texto) => {
    if (isLocked) return
    setAnswers(prev => ({ ...prev, [temaId]: texto }))
    autosaveAnswer(temaId, texto)
  }

  // envio final (quando STOP ou round:stopping)
  const enviarRespostas = async (roundIdSnapshot) => {
    const rid = Number(roundIdSnapshot || rodadaId)
    if (!rid) return

    // drena debounces pendentes primeiro
    for (const t of debounceTimers.current.values()) clearTimeout(t)
    debounceTimers.current.clear()

    const payloads = Object.entries(answers)
      .filter(([, texto]) => typeof texto === 'string')
      .map(([temaId, texto]) => ({
        rodada_id: rid,
        tema_id: Number(temaId),
        texto: String(texto || '')
      }))

    if (!payloads.length) return
    const results = await Promise.allSettled(payloads.map(p => api.post('/answers', p)))
    const fails = results.filter(r => r.status === 'rejected')
    if (fails.length) {
      console.error('Falhas no envio final:', fails.map(f => f.reason?.response?.data || f.reason))
    }
  }

  const onStop = async () => {
    const rid = Number(rodadaId)
    if (!rid) return
    setIsLocked(true)

    try { await enviarRespostas(rid) } catch (e) { console.error(e) }

    socket.emit('round:stop', {
      salaId: Number(salaId),
      roundId: rid,
      by: meuJogadorId
    })
  }

  if (finalizado) {
    const isEmpate = vencedor?.empate
    return (
      <div className="max-w-xl mx-auto text-white">
        <h2 className="text-2xl font-bold">Partida encerrada</h2>

        {isEmpate ? (
          <p>
            <b>Empate!</b> Jogadores {Array.isArray(vencedor?.jogadores) ? vencedor.jogadores.join(' & ') : '-'}
            {' '}com {vencedor?.total ?? 0} pts.
          </p>
        ) : (
          <p>
            Vencedor: <b>{vencedor?.jogador_id ?? '-'}</b> ({vencedor?.total ?? 0} pts)
          </p>
        )}

        <h3 className="mt-3 font-medium">Totais</h3>
        <pre className="bg-gray-800 p-3 rounded mt-1 text-sm">
          {JSON.stringify(totais, null, 2)}
        </pre>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto text-white space-y-4">
      <header className="flex items-center justify-between">
        <div>Sala #{salaId} • Você: {meuJogadorId}</div>
        <div className="font-mono">⏱ {timeLeft ?? '--'}</div>
      </header>

      {!rodadaId ? (
        <button
          className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded"
          onClick={iniciarPartida}
        >
          Iniciar Partida
        </button>
      ) : (
        <>
          <h2 className="text-xl font-semibold">
            Letra: <span className="font-mono">{letra}</span>
          </h2>

          <div className="space-y-3">
            {(temas || []).map(t => (
              <CategoryRow
                key={t.id}
                categoryName={t.nome}
                value={answers[t.id] || ''}
                onChange={e => updateAnswer(t.id, e.target.value)}
                isDisabled={isLocked || timeLeft === 0}
              />
            ))}
          </div>

          <div className="flex gap-2">
            <button
              className="bg-red-600 px-4 py-2 rounded hover:bg-red-700"
              onClick={onStop}
              disabled={!rodadaId || isLocked}
            >
              STOP
            </button>
          </div>

          {(Object.keys(placarRodada).length > 0 || Object.keys(totais).length > 0) && (
            <div className="bg-gray-800 p-3 rounded">
              <h3 className="font-medium">Placar da rodada</h3>
              <pre className="text-sm">{JSON.stringify(placarRodada, null, 2)}</pre>
              <h3 className="font-medium mt-2">Totais</h3>
              <pre className="text-sm">{JSON.stringify(totais, null, 2)}</pre>
            </div>
          )}
        </>
      )}
    </div>
  )
}

