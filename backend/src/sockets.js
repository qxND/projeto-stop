// backend/src/sockets.js
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { supa } from '../services/supabase.js'; //
import { endRoundAndScore, getNextRoundForSala, getJogadoresDaSala, getRoundResults } from '../services/game.js'; //
import { saveRanking } from '../services/ranking.js'; //

const JWT_SECRET = process.env.JWT_SECRET || 'developer_secret_key'; //

const sleep = (ms) => new Promise(r => setTimeout(r, ms)); //
const GRACE_MS = 3000; //

const MOEDAS_VITORIA = 50; //
const MOEDAS_EMPATE = 25; //
const MOEDAS_PARTICIPACAO = 5; //

let io; //

// ===== Armazenamento em Memória para Power-ups Ativos na Rodada =====
// Guarda quem ativou a revelação em qual rodada. Formato: Map<salaId, Map<roundId, Set<jogadorId>>>
const activeRevealRequests = new Map(); //

function addRevealRequest(salaId, roundId, jogadorId) { //
    if (!activeRevealRequests.has(salaId)) { //
        activeRevealRequests.set(salaId, new Map()); //
    }
    const salaMap = activeRevealRequests.get(salaId); //
    if (!salaMap.has(roundId)) { //
        salaMap.set(roundId, new Set()); //
    }
    salaMap.get(roundId).add(jogadorId); //
    console.log(`[REVEAL] Jogador ${jogadorId} ativou revelação para sala ${salaId}, rodada ${roundId}`); //
}

function getAndClearRevealRequests(salaId, roundId) { //
    const salaMap = activeRevealRequests.get(salaId); //
    if (!salaMap || !salaMap.has(roundId)) { //
        return new Set(); // Nenhum pedido para esta rodada/sala
    }
    const requests = salaMap.get(roundId); //
    salaMap.delete(roundId); // Limpa após obter
    if (salaMap.size === 0) { //
        activeRevealRequests.delete(salaId); // Limpa o mapa da sala se vazio
    }
    return requests || new Set(); //
}

// ===== Armazenamento para palavras puladas (SKIP_WORD) =====
// Formato: Map<salaId, Map<roundId, Set<string>>> onde string = "jogadorId-temaNome"
const skippedWords = new Map(); //

function addSkippedWord(salaId, roundId, jogadorId, temaNome) { //
    const key = `${salaId}-${roundId}`; //
    if (!skippedWords.has(key)) { //
        skippedWords.set(key, new Set()); //
    }
    skippedWords.get(key).add(`${jogadorId}-${temaNome}`); //
    console.log(`[SKIP_WORD] Jogador ${jogadorId} pulou palavra ${temaNome} na rodada ${roundId}`); //
}

function getSkippedWords(salaId, roundId) { //
    const key = `${salaId}-${roundId}`; //
    const words = skippedWords.get(key); //
    return words || new Set(); //
}

function clearSkippedWords(salaId, roundId) { //
    const key = `${salaId}-${roundId}`; //
    skippedWords.delete(key); //
}

function isWordSkipped(salaId, roundId, jogadorId, temaNome) { //
    const key = `${salaId}-${roundId}`; //
    const words = skippedWords.get(key); //
    if (!words) return false; //
    return words.has(`${jogadorId}-${temaNome}`); //
}
// ======================================================================

// ===== Armazenamento para palavras desconsideradas do oponente (DISREGARD_OPPONENT_WORD) =====
// Formato: Map<salaId, Map<roundId, Set<string>>> onde string = "jogadorId-temaNome"
// Diferente de SKIP_WORD, aqui o jogador NÃO ganha pontos pela palavra desconsiderada
const disregardedOpponentWords = new Map(); //

function addDisregardedOpponentWord(salaId, roundId, targetJogadorId, temaNome) { //
    const key = `${salaId}-${roundId}`; //
    if (!disregardedOpponentWords.has(key)) { //
        disregardedOpponentWords.set(key, new Set()); //
    }
    disregardedOpponentWords.get(key).add(`${targetJogadorId}-${temaNome}`); //
    console.log(`[DISREGARD_OPPONENT_WORD] Palavra "${temaNome}" do jogador ${targetJogadorId} foi desconsiderada na rodada ${roundId}`); //
}

function getDisregardedOpponentWords(salaId, roundId) { //
    const key = `${salaId}-${roundId}`; //
    const words = disregardedOpponentWords.get(key); //
    return words || new Set(); //
}

function clearDisregardedOpponentWords(salaId, roundId) { //
    const key = `${salaId}-${roundId}`; //
    disregardedOpponentWords.delete(key); //
}

function isOpponentWordDisregarded(salaId, roundId, jogadorId, temaNome) { //
    const key = `${salaId}-${roundId}`; //
    const words = disregardedOpponentWords.get(key); //
    if (!words) return false; //
    return words.has(`${jogadorId}-${temaNome}`); //
}
// ======================================================================

// Map para guardar informações dos timers ativos por sala
const roomTimers = new Map(); //

// Função para limpar/cancelar um timer existente para uma sala
function clearTimerForSala(salaId) {
    salaId = String(salaId); //
    if (roomTimers.has(salaId)) {
        const { interval } = roomTimers.get(salaId); //
        clearInterval(interval); //
        roomTimers.delete(salaId); //
        console.log(`[TIMER] Timer for sala ${salaId} cleared.`);
    }
}

// Função para calcular o tempo restante de uma rodada em andamento
export function getTimeLeftForSala(salaId, defaultDuration = 20) {
    salaId = String(salaId); //
    const timer = roomTimers.get(salaId); //
    if (timer && timer.endsAt) {
        const now = Date.now(); //
        const left = Math.max(0, Math.ceil((timer.endsAt - now) / 1000)); //
        console.log(`[TIMER] Tempo restante calculado para sala ${salaId}: ${left}s`);
        return left; //
    }
    // Se não há timer ativo, retorna a duração padrão (rodada ainda não começou)
    return defaultDuration; //
}

// Set para guardar rodadas já pontuadas (evitar pontuação dupla)
const scoredRounds = new Set(); //

// Função para verificar se uma rodada já foi pontuada
function alreadyScored(salaId, roundId) {
    const key = `${salaId}-${roundId}`; //
    if (scoredRounds.has(key)) { //
        console.warn(`[SCORE CHECK] Rodada ${roundId} da sala ${salaId} já foi pontuada.`);
        return true; //
    }
    scoredRounds.add(key); // Marca como pontuada
     // Limpa a marcação após um tempo para permitir jogar novamente (se aplicável)
    setTimeout(() => scoredRounds.delete(key), 5 * 60 * 1000); // Limpa após 5 minutos
    return false; //
}

// Função para adicionar moedas a um jogador
// Moedas são armazenadas na tabela 'inventario' com item_id: 11 (item MOEDA)
async function adicionarMoedas(jogadorId, quantidade) {
    if (!jogadorId || quantidade <= 0) return;
    try {
      console.log(`[MOEDAS] Adicionando ${quantidade} moedas para jogador ${jogadorId}...`);

      // Primeiro, tenta buscar o saldo atual de moedas
      const { data: inventarioAtual, error: selectError } = await supa
        .from('inventario')
        .select('qtde')
        .eq('jogador_id', jogadorId)
        .eq('item_id', 11)
        .single();

      if (selectError && selectError.code !== 'PGRST116') throw selectError; // PGRST116 = não encontrado

      // Calcula o novo saldo (se não existe, começa com 0)
      const saldoAtual = inventarioAtual?.qtde || 0;
      const novoSaldo = saldoAtual + quantidade;

      // Agora faz o upsert com o novo saldo
      const { error: upsertError } = await supa
        .from('inventario')
        .upsert({
          jogador_id: jogadorId,
          item_id: 11, // item_id da MOEDA
          qtde: novoSaldo,
          data_hora_ultima_atualizacao: new Date().toISOString()
        }, {
          onConflict: 'jogador_id,item_id'
        });

      if (upsertError) throw upsertError;
      console.log(`[MOEDAS] ${quantidade} moedas adicionadas para jogador ${jogadorId}. Novo saldo: ${novoSaldo}`);

      // Opcional: Notificar o jogador sobre o ganho de moedas via socket
      // const socketId = await getSocketIdByPlayerId(jogadorId);
      // if (socketId) io.to(socketId).emit('player:coins_updated', { novo_saldo: novoSaldo });

    } catch(e) {
        console.error(`[MOEDAS] Erro ao adicionar ${quantidade} moedas para jogador ${jogadorId}:`, e.message);
    }
}

// Função auxiliar para obter ID de socket por jogador_id
async function getSocketIdByPlayerId(targetPlayerId) { //
    if (!io) return null; // Garante que io existe
    const sockets = await io.fetchSockets(); //
    for (const socket of sockets) { //
        // Comparar como números para evitar problemas de tipo
        if (Number(socket.data.jogador_id) === Number(targetPlayerId)) { //
            return socket.id; //
        }
    }
    return null; //
}


export function scheduleRoundCountdown({ salaId, roundId, duration = 20 }) { //
  salaId = String(salaId); //
  roundId = Number(roundId); //
  // Limpa timer anterior ANTES de setar novo
  clearTimerForSala(salaId); //
  console.log(`[TIMER] Scheduling countdown for sala ${salaId}, round ${roundId}, duration ${duration}s`);

  const endsAt = Date.now() + duration * 1000; //
  const interval = setInterval(async () => { //
    // Verifica se este timer ainda é o ativo para esta sala/rodada
    const currentTimer = roomTimers.get(salaId);
    if (!currentTimer || currentTimer.roundId !== roundId || currentTimer.interval !== interval) {
        console.warn(`[TIMER] Stale timer detected for sala ${salaId}, round ${roundId}. Clearing.`);
        clearInterval(interval);
        return;
    }

    const now = Date.now(); //
    const left = Math.max(0, Math.ceil((endsAt - now) / 1000)); //

    io.to(salaId).emit('round:tick', left); //

    if (left <= 0) { //
      // Limpa o timer ANTES de processar o fim da rodada
      clearTimerForSala(salaId); //
      try {
        // Verifica se já foi pontuado (importante por causa do sleep)
        if (alreadyScored(salaId, roundId)) { return; } //

        console.log(`[TIMER->STOP] sala=${salaId} round=${roundId}`); //
        io.to(salaId).emit('round:stopping', { roundId }); //
        await sleep(GRACE_MS); //

        // --- CORREÇÃO APLICADA ---
        // O bloco 'if (scoredRounds.has(...))' que estava aqui foi REMOVIDO.
        // Ele fazia o timer se auto-bloquear.
        // --- FIM DA CORREÇÃO ---

        // *** MODIFICADO PELO PASSO 4: `endRoundAndScore` agora retorna `roundDetails` ***
        const payload = await endRoundAndScore({ 
          salaId, 
          roundId, 
          skippedWordsSet: getSkippedWords(salaId, roundId),
          disregardedOpponentWordsSet: getDisregardedOpponentWords(salaId, roundId)
        }); //

        // Limpa as palavras puladas após pontuar
        clearSkippedWords(salaId, roundId);
        // Limpa as palavras desconsideradas do oponente após pontuar
        clearDisregardedOpponentWords(salaId, roundId);

        // --- LÓGICA DE REVELAÇÃO (APÓS PONTUAÇÃO) ---
        const revealRequesters = getAndClearRevealRequests(salaId, roundId); //
        if (revealRequesters.size > 0) { //
             const { data: respostasFinais, error: errRespostas } = await supa //
                .from('participacao_rodada') //
                .select('jogador_id, tema_nome, resposta') //
                .eq('rodada_id', roundId); //

             if (errRespostas) { //
                 console.error("[REVEAL ERRO] Falha ao buscar respostas finais:", errRespostas); //
             } else { //
                 const todosJogadoresSala = await getJogadoresDaSala(salaId); //

                 for (const requesterId of revealRequesters) { //
                     const oponentesIds = todosJogadoresSala.filter(id => id !== requesterId); //
                     if (oponentesIds.length > 0 && respostasFinais && respostasFinais.length > 0) { //
                         const oponenteAlvoId = oponentesIds[Math.floor(Math.random() * oponentesIds.length)]; //
                         const respostasOponente = respostasFinais.filter(r => r.jogador_id === oponenteAlvoId && r.resposta && r.resposta.trim() !== ''); //

                         if (respostasOponente.length > 0) { //
                             const respostaRevelada = respostasOponente[Math.floor(Math.random() * respostasOponente.length)]; //
                             const requesterSocketId = await getSocketIdByPlayerId(requesterId); //
                             if (requesterSocketId) { //
                                 io.to(requesterSocketId).emit('effect:answer_revealed', { //
                                     temaNome: respostaRevelada.tema_nome, //
                                     resposta: respostaRevelada.resposta, //
                                     oponenteId: oponenteAlvoId //
                                 });
                                 console.log(`[REVEAL] Resposta enviada para jogador ${requesterId} (socket ${requesterSocketId})`); //
                             } else { //
                                  console.warn(`[REVEAL] Socket não encontrado para jogador ${requesterId}`); //
                             }
                         } else { //
                              console.log(`[REVEAL] Oponente ${oponenteAlvoId} não teve respostas válidas para revelar.`); //
                               const requesterSocketId = await getSocketIdByPlayerId(requesterId); //
                                if (requesterSocketId) io.to(requesterSocketId).emit('powerup:info', { message: 'Nenhuma resposta válida do oponente para revelar.'}); //
                         }
                     } else { //
                          console.log(`[REVEAL] Não há oponentes ou respostas para revelar para jogador ${requesterId}.`); //
                     }
                 }
             }
        }
        // --- FIM LÓGICA REVELAÇÃO ---

        // *** O 'payload' agora contém 'roundDetails' ***
        io.to(salaId).emit('round:end', payload); // Emite o resultado NORMALMENTE

        const next = await getNextRoundForSala({ salaId, afterRoundId: roundId }); //
        if (next) { //
            // Aguarda 10 segundos antes de iniciar a próxima rodada
            console.log(`[TIMER->NEXT_ROUND] Aguardando 10 segundos antes de iniciar próxima rodada ${next.rodada_id} para sala ${salaId}`);
            setTimeout(async () => {
                // Verifica se ainda existe próxima rodada (pode ter mudado durante o delay)
                const nextCheck = await getNextRoundForSala({ salaId, afterRoundId: roundId });
                if (!nextCheck || nextCheck.rodada_id !== next.rodada_id) {
                    console.log(`[TIMER->NEXT_ROUND] Próxima rodada mudou durante o delay, abortando.`);
                    return;
                }
                // Código para iniciar a próxima rodada
                console.log(`[TIMER->NEXT_ROUND] Iniciando próxima rodada ${next.rodada_id} para sala ${salaId}`);
                // Atualiza status da próxima rodada para 'in_progress'
                await supa.from('rodada').update({ status: 'in_progress' }).eq('rodada_id', next.rodada_id); //
                // Emite eventos múltiplas vezes para garantir que todos recebam
                setTimeout(() => {
                  const timeLeft = getTimeLeftForSala(salaId, duration);
                  io.to(salaId).emit('round:ready', next); //
                  io.to(salaId).emit('round:started', { roundId: next.rodada_id, duration: duration, timeLeft: timeLeft }); // Usar a mesma duração
                }, 100);
                setTimeout(() => {
                  const timeLeft = getTimeLeftForSala(salaId, duration);
                  io.to(salaId).emit('round:ready', next); //
                  io.to(salaId).emit('round:started', { roundId: next.rodada_id, duration: duration, timeLeft: timeLeft }); // Usar a mesma duração
                }, 500);
                scheduleRoundCountdown({ salaId: salaId, roundId: next.rodada_id, duration: duration }); //
            }, 10000); // Delay de 10 segundos (10000ms)
        } else { //
          // --- LÓGICA DE FIM DE PARTIDA E MOEDAS (TIMER) ---
          const winnerInfo = computeWinner(payload.totais); //
          const todosJogadoresIds = Object.keys(payload.totais || {}).map(Number); //

          // Adicionar Moedas pela participação/vitória/empate
          for (const jId of todosJogadoresIds) {
              let moedasGanhas = MOEDAS_PARTICIPACAO; //
              if (winnerInfo?.empate && winnerInfo.jogadores.includes(jId)) { //
                  moedasGanhas += MOEDAS_EMPATE; //
              } else if (!winnerInfo?.empate && winnerInfo?.jogador_id === jId) { //
                  moedasGanhas += MOEDAS_VITORIA; //
              }
              await adicionarMoedas(jId, moedasGanhas); //
          }

          // ATUALIZA STATUS DA SALA PARA 'terminada'
          console.log(`[TIMER->MATCH_END] Atualizando sala ${salaId} para 'terminada'`);
          const { error: updateSalaError } = await supa
            .from('sala') //
            .update({ status: 'terminada' }) // Novo status
            .eq('sala_id', salaId); //
          if (updateSalaError) {
              console.error(`[TIMER] Erro ao atualizar status da sala ${salaId} para terminada:`, updateSalaError);
          }

          // Salva ranking da partida
          try {
              await saveRanking({ salaId, totais: payload.totais, winnerInfo });
          } catch (rankingError) {
              console.error(`[TIMER->MATCH_END] Erro ao salvar ranking para sala ${salaId}:`, rankingError);
          }

          io.to(salaId).emit('match:end', { //
                totais: payload.totais, // Envia totais
                vencedor: winnerInfo // Envia info do vencedor
          });
          console.log(`[TIMER->MATCH_END] Fim de partida para sala ${salaId}`); // Log de fim de partida
          // ----------------------------------------------------
        }
      } catch (e) {
         console.error(`[TIMER ${salaId} ${roundId}] Error during countdown end:`, e);
         io.to(salaId).emit('app:error', { context: 'timer-end', message: e.message }); //
      }
    }
  }, 1000); //

  // Armazena o timer atual
  roomTimers.set(salaId, { interval, endsAt, roundId }); //
}


export function initSockets(httpServer) { //
  io = new Server(httpServer, { cors: { origin: '*' } }); //

  // Middleware de Autenticação Socket.IO (pega token da handshake)
  io.use((socket, next) => { //
    const token = socket.handshake.auth.token; // Pega token da propriedade 'auth'
    if (!token) { //
      console.warn("Socket connection attempt without token");
      return next(new Error('Authentication error: Token missing'));
    }
    try {
      const payload = jwt.verify(token, JWT_SECRET); //
      // Adiciona jogador_id aos dados do socket para uso posterior
      socket.data.jogador_id = payload.sub; //
      console.log(`Socket authenticated for jogador_id: ${socket.data.jogador_id}`);
      next();
    } catch (err) { //
      console.warn(`Socket connection attempt with invalid token: ${err.message}`);
      return next(new Error('Authentication error: Invalid token')); //
    }
  });

  io.on('connection', (socket) => { //
    console.log('a user connected:', socket.id, 'jogador_id:', socket.data.jogador_id); //

    socket.on('join-room', (salaId) => { //
        salaId = String(salaId); // Garante que é string
        console.log(`Socket ${socket.id} (jogador ${socket.data.jogador_id}) joining room ${salaId}`);
        socket.join(salaId); //
        // Guarda a sala no socket data para referência futura (ex: disconnect)
        socket.data.salaId = salaId; //
        // Confirma que entrou (opcional)
        socket.emit('joined', { salaId }); //

          // === REAÇÕES DE EMOJI NO FIM DA RODADA ===
  socket.on('player:react', ({ salaId, emojiId }) => {
    try {
      const fromPlayerId = socket.data.jogador_id;
      const roomId = String(salaId || socket.data.salaId);

      if (!roomId || !fromPlayerId || !emojiId) {
        console.warn('[player:react] Dados incompletos:', { roomId, fromPlayerId, emojiId });
        return;
      }

      console.log(`[player:react] jogador ${fromPlayerId} reagiu com "${emojiId}" na sala ${roomId}`);

      // Broadcast para todo mundo na sala (inclusive quem reagiu)
      io.to(roomId).emit('player:reacted', {
        fromPlayerId,
        emojiId,
      });
    } catch (e) {
      console.error('[player:react] Erro ao processar reação:', e);
    }
  });
  // === FIM REAÇÕES DE EMOJI ===

    });

    socket.on('round:stop', async ({ salaId, roundId, by }) => {
  try {
    salaId = String(salaId || socket.data.salaId);
    roundId = Number(roundId);
    const stoppedBy = by || socket.data.jogador_id;

    if (!salaId || !roundId) return;

    // --- Função auxiliar: o que acontece depois que já temos o payload (placar da rodada) ---
    const processAfterScoring = async (payload, sourceLabel = 'STOP') => {
      // payload: { roundId, roundDetails, totais }

      // 1) Enviar resultado da rodada
      io.to(salaId).emit('round:end', payload);

      // 2) Ver se existe próxima rodada
      const next = await getNextRoundForSala({ salaId, afterRoundId: roundId });

      if (next) {
        console.log(
          `[${sourceLabel}->NEXT_ROUND] Aguardando 10 segundos antes de iniciar próxima rodada ${next.rodada_id} para sala ${salaId}`
        );
        setTimeout(async () => {
          const nextCheck = await getNextRoundForSala({ salaId, afterRoundId: roundId });
          if (!nextCheck || nextCheck.rodada_id !== next.rodada_id) {
            console.log(
              `[${sourceLabel}->NEXT_ROUND] Próxima rodada mudou durante o delay, abortando.`
            );
            return;
          }

          console.log(
            `[${sourceLabel}->NEXT_ROUND] Iniciando próxima rodada ${next.rodada_id} para sala ${salaId}`
          );

          // Marca próxima rodada como em progresso
          await supa.from('rodada').update({ status: 'in_progress' }).eq('rodada_id', next.rodada_id);

          // Busca duração da rodada anterior (ou default)
          const qTempo = await supa
            .from('rodada')
            .select('tempo:tempo_id(valor)')
            .eq('rodada_id', roundId)
            .single();
          const duration = qTempo.data?.tempo?.valor || 20;

          // Emite eventos de início de rodada (duas vezes, como antes)
          setTimeout(() => {
            const timeLeft = getTimeLeftForSala(salaId, duration);
            io.to(salaId).emit('round:ready', next);
            io.to(salaId).emit('round:started', {
              roundId: next.rodada_id,
              duration,
              timeLeft
            });
          }, 100);

          setTimeout(() => {
            const timeLeft = getTimeLeftForSala(salaId, duration);
            io.to(salaId).emit('round:ready', next);
            io.to(salaId).emit('round:started', {
              roundId: next.rodada_id,
              duration,
              timeLeft
            });
          }, 500);

          // Inicia countdown da próxima rodada
          scheduleRoundCountdown({ salaId, roundId: next.rodada_id, duration });
        }, 10000);
      } else {
        // 3) Não há próxima rodada → FIM DE PARTIDA
        const winnerInfo = computeWinner(payload.totais);
        const todosJogadoresIds = Object.keys(payload.totais || {}).map(Number);

        // Distribui moedas
        for (const jId of todosJogadoresIds) {
          let moedasGanhas = MOEDAS_PARTICIPACAO;
          if (winnerInfo?.empate && winnerInfo.jogadores.includes(jId)) {
            moedasGanhas += MOEDAS_EMPATE;
          } else if (!winnerInfo?.empate && winnerInfo?.jogador_id === jId) {
            moedasGanhas += MOEDAS_VITORIA;
          }
          await adicionarMoedas(jId, moedasGanhas);
        }

        console.log(`[${sourceLabel}->MATCH_END] Atualizando sala ${salaId} para 'terminada'`);
        const { error: updateSalaError } = await supa
          .from('sala')
          .update({ status: 'terminada' })
          .eq('sala_id', salaId);
        if (updateSalaError) {
          console.error(
            `[${sourceLabel}] Erro ao atualizar status da sala ${salaId} para terminada:`,
            updateSalaError
          );
        }

        // Salva ranking da partida
        try {
          await saveRanking({ salaId, totais: payload.totais, winnerInfo });
        } catch (rankingError) {
          console.error(`[${sourceLabel}->MATCH_END] Erro ao salvar ranking para sala ${salaId}:`, rankingError);
        }

        // Emite evento de fim de partida
        io.to(salaId).emit('match:end', {
          totais: payload.totais,
          vencedor: winnerInfo
        });
        console.log(`[${sourceLabel}->MATCH_END] Fim de partida para sala ${salaId}`);
      }
    };
    // --- Fim da função auxiliar ---

    

    // 2) STOP "normal": esta chamada é quem realmente vai pontuar
    console.log(`[CLICK STOP] sala=${salaId} round=${roundId} by=${stoppedBy}`);
    io.to(salaId).emit('round:stopping', { roundId, by: stoppedBy });

    // Para o timer para evitar concorrência
    clearTimerForSala(salaId);
    await sleep(GRACE_MS);

    // Se durante o GRACE_MS alguém já pontuou, reaproveita os resultados
    const scoreKey = `${salaId}-${roundId}`;

    // Se DURANTE o GRACE_MS o TIMER ou outro STOP já pontuou essa rodada
    if (scoredRounds.has(scoreKey)) {
      console.warn(
        `[STOP] Rodada ${roundId} já foi pontuada (timer ou outro STOP). Buscando resultados existentes.`
      );
      const payload = await getRoundResults({ salaId, roundId });
      await processAfterScoring(payload, 'STOP');
      return;
    }

    // Se chegou aqui, ESTE STOP é quem vai pontuar primeiro
    scoredRounds.add(scoreKey);
    // Remove a trava depois de 5 minutos, igual ao alreadyScored
    setTimeout(() => scoredRounds.delete(scoreKey), 5 * 60 * 1000);


    // 3) Pontua de fato a rodada
    const payload = await endRoundAndScore({
      salaId,
      roundId,
      skippedWordsSet: getSkippedWords(salaId, roundId),
      disregardedOpponentWordsSet: getDisregardedOpponentWords(salaId, roundId)
    });

    // Limpa SKIPs da rodada
    clearSkippedWords(salaId, roundId);
    clearDisregardedOpponentWords(salaId, roundId);

    // envia resultado da rodada para TODOS da sala
    io.to(salaId).emit('round:end', payload);

    // --- LÓGICA DE REVELAÇÃO (mantida igual) ---
    const revealRequesters = getAndClearRevealRequests(salaId, roundId);
    if (revealRequesters.size > 0) {
      const { data: respostasFinais, error: errRespostas } = await supa
        .from('participacao_rodada')
        .select('jogador_id, tema_nome, resposta')
        .eq('rodada_id', roundId);

      if (errRespostas) {
        console.error('[REVEAL ERRO] Falha ao buscar respostas finais:', errRespostas);
      } else {
        const todosJogadoresSala = await getJogadoresDaSala(salaId);

        for (const requesterId of revealRequesters) {
          const oponentesIds = todosJogadoresSala.filter(id => id !== requesterId);
          if (oponentesIds.length > 0 && respostasFinais && respostasFinais.length > 0) {
            const oponenteAlvoId =
              oponentesIds[Math.floor(Math.random() * oponentesIds.length)];
            const respostasOponente = respostasFinais.filter(
              r =>
                r.jogador_id === oponenteAlvoId &&
                r.resposta &&
                r.resposta.trim() !== ''
            );

            if (respostasOponente.length > 0) {
              const respostaRevelada =
                respostasOponente[Math.floor(Math.random() * respostasOponente.length)];
              const requesterSocketId = await getSocketIdByPlayerId(requesterId);
              if (requesterSocketId) {
                io.to(requesterSocketId).emit('effect:answer_revealed', {
                  temaNome: respostaRevelada.tema_nome,
                  resposta: respostaRevelada.resposta,
                  oponenteId: oponenteAlvoId
                });
                console.log(
                  `[REVEAL] Resposta enviada para jogador ${requesterId} (socket ${requesterSocketId})`
                );
              } else {
                console.warn(`[REVEAL] Socket não encontrado para jogador ${requesterId}`);
              }
            } else {
              console.log(
                `[REVEAL] Oponente ${oponenteAlvoId} não teve respostas válidas para revelar.`
              );
              const requesterSocketId = await getSocketIdByPlayerId(requesterId);
              if (requesterSocketId)
                io.to(requesterSocketId).emit('powerup:info', {
                  message: 'Nenhuma resposta válida do oponente para revelar.'
                });
            }
          } else {
            console.log(
              `[REVEAL] Não há oponentes ou respostas para revelar para jogador ${requesterId}.`
            );
          }
        }
      }
    }
    // --- FIM LÓGICA REVELAÇÃO ---

    // 4) Depois de pontuar + aplicar efeitos, processa próxima rodada / fim da partida
    await processAfterScoring(payload, 'STOP');
  } catch (e) {
    console.error(`[STOP ${salaId} ${roundId}] Error during stop handling:`, e);
    io.to(salaId).emit('app:error', { context: 'stop-handler', message: e.message });
  }
});


    socket.on('powerup:use', async ({ powerUpId, targetPlayerId = null, targetTemaNome = null }) => {
    const salaId = socket.data.salaId;
    const usuarioJogadorId = socket.data.jogador_id;
    const currentRoundId = roomTimers.get(salaId)?.roundId;

    if (!usuarioJogadorId || !salaId || !powerUpId) {
        socket.emit('powerup:error', { message: 'Faltando parâmetros para usar power-up.' });
        return;
    }
    if (!currentRoundId) {
        socket.emit('powerup:error', { message: 'Não é possível usar power-ups fora de uma rodada ativa.' });
        return;
    }

    try {
        // --- INÍCIO DA CORREÇÃO ---
        // Busca o item na tabela 'inventario' e faz join com 'item' para pegar o código
        const { data: itemInventario, error: checkError } = await supa
            .from('inventario') // <-- CORREÇÃO: Tabela 'inventario'
            .select(`
                inventario_id,  // <-- CORREÇÃO: PK da tabela 'inventario'
                qtde,           // <-- CORREÇÃO: Coluna 'qtde'
                item ( codigo_identificador ) // <-- CORREÇÃO: Join na tabela 'item'
            `)
            .eq('jogador_id', usuarioJogadorId)
            .eq('item_id', powerUpId) // <-- CORREÇÃO: 'powerUpId' (do frontend) é o 'item_id' (do DB)
            .maybeSingle(); // Mantém o maybeSingle

        if (checkError && checkError.code !== 'PGRST116') { throw checkError; }

        if (!itemInventario || itemInventario.qtde <= 0) {
            socket.emit('powerup:error', { message: 'Você não possui este power-up ou quantidade insuficiente.' });
            return;
        }

        const novaQuantidade = itemInventario.qtde - 1;
        const { error: decrementError } = await supa
            .from('inventario') // <-- CORREÇÃO: Tabela 'inventario'
            .update({ qtde: novaQuantidade }) // <-- CORREÇÃO: Coluna 'qtde'
            .eq('inventario_id', itemInventario.inventario_id); // <-- CORREÇÃO: PK correta

        if (decrementError) { throw decrementError; }

        socket.emit('inventory:updated');
        // --- FIM DA VERIFICAÇÃO/DECREMENTO ---

        // Validação de segurança para o 'efeito'
        if (!itemInventario.item || !itemInventario.item.codigo_identificador) {
            console.error(`[powerup:use] Falha crítica: Item ${powerUpId} não tem um 'codigo_identificador' na tabela 'item'.`);
            socket.emit('powerup:error', { message: `Item ${powerUpId} não está configurado corretamente no DB.` });
            return;
        }

        const efeito = itemInventario.item.codigo_identificador; // <-- CORREÇÃO: Caminho do objeto
        // --- FIM DA CORREÇÃO ---

        console.log(`[powerup:use] Sucesso: Jogador ${usuarioJogadorId} usou ${efeito} na sala ${salaId}, rodada ${currentRoundId}`);

        switch (efeito) {
            case 'BLUR_OPPONENT_SCREEN_5S':
            case 'JUMPSCARE':
                socket.to(salaId).emit('effect:jumpscare', { attackerId: usuarioJogadorId, duration: 3 });
                socket.emit('powerup:ack', { codigo: efeito, message: 'Jumpscare enviado! Oponente ficará bloqueado por 3s' });
                break;
            case 'SKIP_OWN_CATEGORY':
                socket.emit('effect:enable_skip', { powerUpId: powerUpId });
                break;
            case 'REVEAL_OPPONENT_ANSWER':
                addRevealRequest(salaId, currentRoundId, usuarioJogadorId);
                socket.emit('powerup:ack', { codigo: efeito, message: 'Revelação de resposta ativada para o final desta rodada.' });
                break;
            case 'BLOCK_OPPONENT_TYPE_5S':
                try {
                    const todosJogadores = await getJogadoresDaSala(salaId);
                    const oponentesIds = todosJogadores.filter(id => id !== usuarioJogadorId);

                    if (oponentesIds.length === 0) {
                        socket.emit('powerup:error', { message: 'Não há oponentes na sala para bloquear.' });
                        return;
                    }
                    let targetId = targetPlayerId ? Number(targetPlayerId) : oponentesIds[Math.floor(Math.random() * oponentesIds.length)];
                    if (!oponentesIds.includes(targetId)) {
                        targetId = oponentesIds[0];
                    }

                    const targetSocketId = await getSocketIdByPlayerId(targetId);
                    if (targetSocketId) {
                        io.to(targetSocketId).emit('effect:block_typing', { duration: 5, attackerId: usuarioJogadorId });
                        socket.emit('powerup:ack', { codigo: efeito, message: `Digitação do adversário bloqueada por 5 segundos!` });
                        console.log(`[BLOCK_TYPE] Jogador ${usuarioJogadorId} bloqueou digitação de ${targetId} por 5s`);
                    } else {
                        socket.emit('powerup:error', { message: 'Oponente não está conectado.' });
                    }
                } catch (err) {
                    console.error('[BLOCK_TYPE] Erro:', err);
                    socket.emit('powerup:error', { message: 'Erro ao aplicar bloqueio de digitação.' });
                }
                break;
            case 'CLEAR_OPPONENT_ANSWERS':
                try {
                    const todosJogadores = await getJogadoresDaSala(salaId);
                    const oponentesIds = todosJogadores.filter(id => id !== usuarioJogadorId);

                    if (oponentesIds.length === 0) {
                        socket.emit('powerup:error', { message: 'Não há oponentes na sala para afetar.' });
                        return;
                    }
                    let targetId = targetPlayerId ? Number(targetPlayerId) : oponentesIds[Math.floor(Math.random() * oponentesIds.length)];
                    if (!oponentesIds.includes(targetId)) {
                        targetId = oponentesIds[0];
                    }
                    
                    const { error: clearError } = await supa
                        .from('participacao_rodada')
                        .update({ resposta: '' })
                        .eq('rodada_id', currentRoundId)
                        .eq('jogador_id', targetId);

                    if (clearError) {
                        console.error('[CLEAR_ANSWERS] Erro ao limpar respostas:', clearError);
                        socket.emit('powerup:error', { message: 'Erro ao apagar respostas do adversário.' });
                        return;
                    }

                    const targetSocketId = await getSocketIdByPlayerId(targetId);
                    if (targetSocketId) {
                        io.to(targetSocketId).emit('effect:clear_answers', { attackerId: usuarioJogadorId });
                        socket.emit('powerup:ack', { codigo: efeito, message: `Campos do adversário foram apagados!` });
                        console.log(`[CLEAR_ANSWERS] Jogador ${usuarioJogadorId} apagou respostas de ${targetId}`);
                    } else {
                        socket.emit('powerup:ack', { codigo: efeito, message: `Campos do adversário foram apagados!` });
                        console.log(`[CLEAR_ANSWERS] Respostas de ${targetId} apagadas (jogador offline)`);
                    }
                } catch (err) {
                    console.error('[CLEAR_ANSWERS] Erro:', err);
                    socket.emit('powerup:error', { message: 'Erro ao apagar campos do adversário.' });
                }
                break;
            case 'SKIP_WORD':
                try {
                    if (!targetTemaNome) {
                        socket.emit('powerup:error', { message: 'É necessário especificar qual palavra pular.' });
                        return;
                    }
                    const { data: temasRodada, error: temasError } = await supa
                        .from('rodada_tema')
                        .select('tema:tema_id(tema_nome)')
                        .eq('rodada_id', currentRoundId);
                    if (temasError) throw temasError;
                    const temasValidos = (temasRodada || []).map(t => t.tema.tema_nome);
                    if (!temasValidos.includes(targetTemaNome)) {
                        socket.emit('powerup:error', { message: 'Tema inválido para esta rodada.' });
                        return;
                    }
                    addSkippedWord(salaId, currentRoundId, usuarioJogadorId, targetTemaNome);
                    socket.emit('powerup:ack', { codigo: efeito, message: `Palavra "${targetTemaNome}" foi pulada! Você ganhará pontos automaticamente.` });
                    console.log(`[SKIP_WORD] Jogador ${usuarioJogadorId} pulou palavra ${targetTemaNome} na rodada ${currentRoundId}`);
                } catch (err) {
                    console.error('[SKIP_WORD] Erro:', err);
                    socket.emit('powerup:error', { message: 'Erro ao pular palavra.' });
                }
                break;
            case 'DISREGARD_OPPONENT_WORD':
            case 'SKIP_OPPONENT_CATEGORY':
                try {
                    const todosJogadores = await getJogadoresDaSala(salaId);
                    const oponentesIds = todosJogadores.filter(id => id !== usuarioJogadorId);

                    if (oponentesIds.length === 0) {
                        socket.emit('powerup:error', { message: 'Não há oponentes na sala para afetar.' });
                        return;
                    }
                    if (targetTemaNome) {
                        let targetId = targetPlayerId ? Number(targetPlayerId) : oponentesIds[Math.floor(Math.random() * oponentesIds.length)];
                        if (!oponentesIds.includes(targetId)) {
                            targetId = oponentesIds[0];
                        }
                        const { data: temasRodada, error: temasError } = await supa
                            .from('rodada_tema')
                            .select('tema:tema_id(tema_nome)')
                            .eq('rodada_id', currentRoundId);
                        if (temasError) throw temasError;
                        const temasValidos = (temasRodada || []).map(t => t.tema.tema_nome);
                        if (!temasValidos.includes(targetTemaNome)) {
                            socket.emit('powerup:error', { message: 'Tema inválido para esta rodada.' });
                            return;
                        }
                        addDisregardedOpponentWord(salaId, currentRoundId, targetId, targetTemaNome);

                        const targetSocketId = await getSocketIdByPlayerId(targetId);
                        if (targetSocketId) {
                            const { data: temasRodadaFull, error: temasErrFull } = await supa
                                .from('rodada_tema')
                                .select('tema_id, tema:tema_id(tema_nome)')
                                .eq('rodada_id', currentRoundId);

                            let temaId = null;
                            if (!temasErrFull && temasRodadaFull) {
                                const temaFound = temasRodadaFull.find(t => t.tema?.tema_nome === targetTemaNome);
                                if (temaFound) temaId = temaFound.tema_id;
                            }

                            if (temaId) {
                                io.to(targetSocketId).emit('effect:category_disregarded', {
                                    temaId: temaId,
                                    temaNome: targetTemaNome,
                                    attackerId: usuarioJogadorId
                                });
                            }
                        }

                        socket.emit('powerup:ack', { codigo: efeito, message: `Palavra "${targetTemaNome}" do oponente foi desconsiderada! Ele não ganhará pontos por ela.` });
                        console.log(`[DISREGARD_OPPONENT_WORD] Jogador ${usuarioJogadorId} desconsiderou palavra "${targetTemaNome}" do jogador ${targetId} na rodada ${currentRoundId}`);
                    } else {
                        socket.emit('effect:enable_skip_opponent', { powerUpId: powerUpId });
                    }
                } catch (err) {
                    console.error('[DISREGARD_OPPONENT_WORD] Erro:', err);
                    socket.emit('powerup:error', { message: 'Erro ao ativar desconsideração de palavra do oponente.' });
                }
                break;
            default:
                console.warn(`[powerup:use] Efeito desconhecido: ${efeito}`);
                socket.emit('powerup:error', { message: `Efeito não implementado: ${efeito}` });
        }
    } catch (e) {
        console.error(`[powerup:use ${usuarioJogadorId} ${powerUpId}] Error:`, e);
        socket.emit('powerup:error', { message: e.message || 'Erro ao processar power-up.' });
    }
});
    // *** FIM DA MODIFICAÇÃO DO PASSO 5 ***

    socket.on('disconnect', (reason) => { //
        console.log('user disconnected:', socket.id, 'jogador_id:', socket.data.jogador_id, 'reason:', reason); //
        // Lógica para remover jogador da sala no disconnect (simplificado)
        const salaId = socket.data.salaId; //
        const jogadorId = socket.data.jogador_id; //
        if (salaId && jogadorId) {
           console.log(`[DISCONNECT] Removendo jogador ${jogadorId} da sala ${salaId} (se existir)...`);
           supa.from('jogador_sala').delete().match({ sala_id: salaId, jogador_id: jogadorId })
             .then(({ error }) => {
                 if (error) {
                     console.error(`[DISCONNECT] Erro ao remover jogador ${jogadorId} da sala ${salaId}:`, error);
                 } else {
                     console.log(`[DISCONNECT] Jogador ${jogadorId} removido da sala ${salaId} (ou já não estava).`);
                     // Emitir atualização de jogadores para a sala
                     const io = getIO();
                     if (io) {
                        supa.from('jogador_sala')
                            .select('jogador:jogador_id(nome_de_usuario)')
                            .eq('sala_id', salaId)
                            .then(({ data: playersData, error: playersError }) => {
                                if (!playersError) {
                                    const playerNames = (playersData || []).map(p => p.jogador?.nome_de_usuario || 'Desconhecido');
                                    console.log(`[DISCONNECT] Emitindo players_updated para sala ${salaId}:`, playerNames);
                                    io.to(salaId).emit('room:players_updated', { jogadores: playerNames });
                                }
                            });
                     }
                 }
             });
        }
    });

  });

  return io; //
}

export function getIO() { return io; } //


function computeWinner(totaisObj = {}) { //
     const entries = Object.entries(totaisObj).map(([id, total]) => [Number(id), Number(total || 0)]); //
  if (!entries.length) return null; //

  entries.sort((a, b) => b[1] - a[1]); //
  const topScore = entries[0][1]; //

  const empatados = entries.filter(([, total]) => total === topScore).map(([id]) => id); //

  if (empatados.length > 1) { //
    return { //
      empate: true, //
      jogadores: empatados, //
      total: topScore //
    };
  }

  return { //
    empate: false, //
    jogador_id: entries[0][0], //
    total: topScore //
  };
}