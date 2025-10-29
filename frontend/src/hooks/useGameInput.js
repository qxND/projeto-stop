// src/hooks/useGameInput.js
import { useState, useRef, useEffect } from 'react';
import api from '../lib/api'; // <-- Corrija para '../../lib/api'
import socket from '../lib/socket'; // <-- Corrija para '../../lib/socket'

// 1. Mude os parâmetros
export function useGameInput(gameState, salaId, meuJogadorId) {
  // 2. Desestruture o estado AQUI DENTRO
  const { rodadaId, isLocked } = gameState;

  const [answers, setAnswers] = useState({});
  const [skippedCategories, setSkippedCategories] = useState(new Set());
  const debounceTimers = useRef(new Map());

  // Limpa respostas quando a rodadaId muda (agora depende do rodadaId vindo do gameState)
  useEffect(() => {
    setAnswers({});
    setSkippedCategories(new Set());
    
    for (const t of debounceTimers.current.values()) clearTimeout(t);
    debounceTimers.current.clear();

  }, [rodadaId]);

  // ---- AUTOSAVE (debounced) ----
  async function autosaveAnswer(temaId, texto) {
    if (!rodadaId || isLocked) return; // Agora usa o rodadaId e isLocked do estado
    const key = String(temaId);

    const prev = debounceTimers.current.get(key);
    if (prev) clearTimeout(prev);

    const t = setTimeout(async () => {
      try {
        console.log(`Autosave: T:${temaId} V:'${texto}' R:${rodadaId}`);
        await api.post('/answers', {
          rodada_id: Number(rodadaId),
          tema_id: Number(temaId),
          texto: String(texto || '')
        });
      } catch (e) {
        console.error('Autosave fail', { rodadaId, temaId }, e?.response?.data || e);
      } finally {
        debounceTimers.current.delete(key);
      }
    }, 350);

    debounceTimers.current.set(key, t);
  }

  // Atualiza o estado local 'answers' e agenda o auto-save
  const updateAnswer = (temaId, texto) => {
    if (isLocked) return; // Usa o isLocked do estado
    if (skippedCategories.has(temaId)) return;
    setAnswers(prev => ({ ...prev, [temaId]: texto }));
    autosaveAnswer(temaId, texto);
  };

  // Envia todas as respostas pendentes
  const enviarRespostas = async (roundIdSnapshot, categoriasIgnoradas = new Set()) => {
    // Usa o rodadaId do snapshot (do effect) ou o rodadaId atual do estado
    const rid = Number(roundIdSnapshot || rodadaId);
    if (!rid) return;

    console.log(`Enviando respostas finais para rodada ${rid} (ignorando ${categoriasIgnoradas.size} categorias)...`);
    for (const t of debounceTimers.current.values()) clearTimeout(t);
    debounceTimers.current.clear();

    const payloads = Object.entries(answers)
      .filter(([temaId]) => !categoriasIgnoradas.has(Number(temaId)))
      .filter(([, texto]) => typeof texto === 'string')
      .map(([temaId, texto]) => ({
        rodada_id: rid,
        tema_id: Number(temaId),
        texto: String(texto || '').trim()
      }));

    if (!payloads.length) {
        console.log("Nenhuma resposta válida para envio final.");
        return;
    }

    console.log("Payloads para envio final:", payloads);
    const results = await Promise.allSettled(payloads.map(p => api.post('/answers', p)));

    const fails = results.filter(r => r.status === 'rejected');
    if (fails.length) {
      console.error('Falhas no envio final:', fails.map(f => f.reason?.response?.data || f.reason?.message || f.reason));
    } else {
        console.log("Envio final concluído com sucesso.");
    }
  };

  // Função chamada ao clicar no botão STOP
  const onStop = async () => {
    const rid = Number(rodadaId);
    if (!rid || isLocked) return; // Usa o isLocked do estado
    console.log(`Botão STOP pressionado por ${meuJogadorId} para rodada ${rid}`);
    
    // O 'isLocked' será setado pelo hook de socket
    
    try {
        await enviarRespostas(rid, skippedCategories);
    } catch (e) { console.error("Erro no envio final ao clicar STOP:", e) }

    socket.emit('round:stop', {
      salaId: Number(salaId),
      roundId: rid,
      by: meuJogadorId
    });
  };

  // --- Função para PULAR uma categoria ---
  const handleSkipCategory = (temaId) => {
      console.log(`Jogador ${meuJogadorId} pulou a categoria ${temaId}`);
      updateAnswer(temaId, ''); // Limpa a resposta
      setSkippedCategories(prev => new Set(prev).add(temaId));
  };

  return {
    answers,
    updateAnswer,
    skippedCategories,
    setSkippedCategories,
    onStop,
    handleSkipCategory,
    enviarRespostas 
  };
}