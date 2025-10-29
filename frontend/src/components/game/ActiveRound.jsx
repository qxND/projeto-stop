// src/components/game/ActiveRound.jsx
import CategoryRow from '../CategoryRow';
import { Zap, Loader2, Star, SkipForward, Eye, Ghost } from 'lucide-react';

export default function ActiveRound({
  salaId,
  meuJogadorId,
  gameState,
  effectsState,
  inputState,
  powerUpState,
}) {
  // --- CORREÇÃO AQUI ---
  // Nós esquecemo-nos de adicionar 'finalizado' a esta lista
  const { 
    letra, 
    temas, 
    timeLeft, 
    placarRodada, 
    totais, 
    rodadaId, 
    isLocked, 
    finalizado // <-- ADICIONADO AQUI
  } = gameState;
  // --- FIM DA CORREÇÃO ---

  const { activeSkipPowerUpId, setActiveSkipPowerUpId, revealPending, revealedAnswer } = effectsState;
  const { answers, updateAnswer, onStop, skippedCategories, handleSkipCategory } = inputState;
  const { inventario, loadingInventory, handleUsePowerUp } = powerUpState;

  const onSkip = (temaId) => {
    if (!activeSkipPowerUpId || isLocked) return;
    handleSkipCategory(temaId);
    setActiveSkipPowerUpId(null); // Consome o power-up
  }
  
  const onUsePowerUp = (powerUp) => {
    if (powerUp.code === 'SKIP_OWN_CATEGORY' && activeSkipPowerUpId) {
      alert("Pular Categoria já está ativo!"); return;
    }
    if (powerUp.code === 'REVEAL_OPPONENT_ANSWER' && revealPending) {
      alert("Você já ativou a revelação para esta rodada."); return;
    }
    handleUsePowerUp(powerUp);
  }

  return (
    <div className="max-w-3xl mx-auto text-white space-y-4 p-4 relative">
      {/* Cabeçalho com informações da sala e timer */}
      <header className="flex items-center justify-between bg-gray-800 p-3 rounded-lg shadow sticky top-[72px] z-10">
        <div className="text-sm">
            Sala <b className="font-mono text-cyan-400">#{salaId}</b> | Você: <b className="font-mono text-lime-400">{meuJogadorId}</b>
        </div>
        {/* Timer */}
        <div className={`font-mono text-2xl font-bold tabular-nums ${timeLeft !== null && timeLeft <= 10 ? 'text-red-500 animate-pulse' : 'text-yellow-400'}`}>
           ⏱ {timeLeft !== null ? `${String(Math.floor(timeLeft / 60)).padStart(2, '0')}:${String(timeLeft % 60).padStart(2, '0')}` : '--:--'}
        </div>
      </header>

      <>
        {/* Mostra a Letra da Rodada */}
        <div className="text-center bg-gray-800 p-3 rounded-lg shadow">
          <h2 className="text-2xl font-semibold">
            Letra da Rodada: <span className="font-mono text-4xl text-lime-400 ml-2">{letra || '?'}</span>
          </h2>
        </div>

        {/* Linhas de Categoria com Botão Skip */}
        <div className="space-y-3">
          {(temas || []).map(t => {
            const isSkipped = skippedCategories.has(t.id);
            return (
              <div key={t.id} className="flex items-center gap-2">
                 <CategoryRow
                    categoryName={t.nome}
                    value={isSkipped ? '--- PULADO ---' : (answers[t.id] || '')}
                    onChange={e => updateAnswer(t.id, e.target.value)}
                    isDisabled={isLocked || timeLeft === 0 || isSkipped}
                    inputClassName={isSkipped ? 'text-gray-500 italic bg-gray-800' : ''}
                  />
                  {/* Botão de Pular */}
                  {activeSkipPowerUpId && !isSkipped && (
                       <button
                          onClick={() => onSkip(t.id)}
                          disabled={isLocked || timeLeft === 0}
                          className="bg-yellow-600 hover:bg-yellow-700 text-white p-2 rounded-lg disabled:opacity-50 transition-transform hover:scale-110"
                          title="Pular esta categoria (usará o power-up)"
                        >
                           <SkipForward size={20}/>
                       </button>
                  )}
              </div>
             );
           })}
        </div>

        {/* Botões de Ação: STOP e Power-ups */}
        <div className="flex flex-wrap items-center justify-between gap-4 mt-6">
          <button
            className="bg-red-600 px-8 py-3 rounded-lg text-xl font-bold hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed flex-grow md:flex-grow-0 transition-transform hover:scale-105"
            onClick={onStop}
            disabled={!rodadaId || isLocked || timeLeft === 0}
          >
            STOP!
          </button>

          {/* Seção de Power-ups disponíveis */}
          <div className="flex items-center gap-2 flex-wrap justify-center md:justify-end flex-grow">
             <h3 className="text-sm font-semibold mr-2 text-cyan-300 w-full md:w-auto text-center md:text-right hidden sm:block">Power-ups:</h3>
              {loadingInventory && <Loader2 className="animate-spin text-cyan-400" />}
              {!loadingInventory && inventario.length === 0 && <span className="text-xs text-gray-500 italic">Nenhum</span>}
              {!loadingInventory && inventario.map(p => (
                  <button
                      key={p.power_up_id}
                      onClick={() => onUsePowerUp(p)} // Chama a nova função
                      disabled={isLocked || timeLeft === 0}
                      className="bg-gradient-to-br from-purple-600 to-indigo-700 hover:from-purple-700 hover:to-indigo-800 text-white px-3 py-1 rounded-full text-xs font-semibold shadow disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 transition-transform hover:scale-105"
                      title={`${p.nome} - ${p.descricao} (x${p.quantidade})`}
                  >
                      <Zap size={12} /> {p.nome} <span className="bg-indigo-900 text-cyan-200 text-[10px] px-1.5 py-0.5 rounded-full ml-1">{p.quantidade}</span>
                  </button>
              ))}
          </div>
        </div>

        {/* Área de Resultados da Rodada / Revelação / Totais */}
        {(Object.keys(placarRodada).length > 0 || revealedAnswer || revealPending) && (
          <div className="mt-6 bg-gray-800 p-4 rounded-lg shadow space-y-4">

            {/* Seção para Resposta Revelada */}
            {revealedAnswer && (
               <div className="p-3 bg-indigo-900/50 rounded border border-indigo-700">
                   <h4 className="font-semibold text-md text-cyan-300 flex items-center gap-1"><Eye size={16}/> Resposta Revelada!</h4>
                   <p className="text-xs text-gray-400">(Resposta do Jogador {revealedAnswer.oponenteId})</p>
                   <p className="mt-1">
                       <span className="text-gray-400">{revealedAnswer.temaNome}:</span>{' '}
                       <b className="text-lg text-white font-mono break-words">{revealedAnswer.resposta || '(Vazio)'}</b>
                   </p>
               </div>
            )}
            {/* Mensagem enquanto espera a revelação */}
            {revealPending && !revealedAnswer && (
                <div className="p-3 bg-indigo-900/50 rounded border border-indigo-700 text-center">
                   <p className="text-cyan-300 flex items-center justify-center gap-1"><Loader2 size={16} className="animate-spin"/> Aguardando revelação da resposta...</p>
                </div>
            )}

            {/* Placar da Rodada (mostrado apenas se disponível) */}
            {Object.keys(placarRodada).length > 0 && (
              <div>
                <h3 className="font-semibold text-lg mb-2 text-yellow-300">⭐ Placar da Rodada {rodadaId} ⭐</h3>
                <div className="space-y-1 text-sm">
                  {Object.entries(placarRodada).map(([tema, scores]) => (
                      <div key={tema} className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-gray-700/50 px-2 py-1 rounded gap-1 sm:gap-3">
                        <span className="text-gray-300 font-medium">{tema}:</span>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-xs sm:text-sm">
                            {Object.entries(scores).map(([jId, pts]) => (
                              <span key={jId} className={Number(jId) === meuJogadorId ? 'text-lime-400' : 'text-cyan-400'}>
                                Jgdr {jId}: <b className={`font-bold ${pts > 0 ? (pts === 10 ? 'text-yellow-400' : 'text-orange-400') : 'text-gray-500'}`}>{pts}pts</b>
                              </span>
                            ))}
                        </div>
                      </div>
                  ))}
                </div>
              </div>
            )}

             {/* Totais Acumulados (mostrado apenas se disponível) */}
             {Object.keys(totais).length > 0 && (
               <div>
                  <h3 className="font-semibold text-lg mt-4 mb-1 text-yellow-300">📊 Totais Acumulados</h3>
                   <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-sm">
                     {Object.entries(totais).map(([jId, pts]) => (
                       <span key={jId} className={Number(jId) === meuJogadorId ? 'text-lime-400' : 'text-cyan-400'}>
                          Jogador {jId}: <b className="text-xl">{pts}pts</b>
                       </span>
                     ))}
                  </div>
               </div>
             )}

            {/* Mensagem "Aguardando próxima rodada" (só aparece se o placar já foi exibido) */}
            {Object.keys(placarRodada).length > 0 && (
               <p className="text-center mt-4 text-gray-400 text-sm italic">Aguardando próxima rodada...</p>
            )}
          </div>
        )}

        {/* Mostra Totais mesmo se placarRodada ainda não chegou */}
        {/* A linha 178 (agora 187) que estava a falhar */}
        {(Object.keys(placarRodada).length === 0 && !revealedAnswer && !revealPending && Object.keys(totais).length > 0 && !finalizado && rodadaId) && (
           <div className="mt-6 bg-gray-800 p-4 rounded-lg shadow">
               <h3 className="font-semibold text-lg mb-1 text-yellow-300">📊 Totais Acumulados</h3>
               <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-sm">
                  {Object.entries(totais).map(([jId, pts]) => (
                      <span key={jId} className={Number(jId) === meuJogadorId ? 'text-lime-400' : 'text-cyan-400'}>
                      Jogador {jId}: <b className="text-xl">{pts}pts</b>
                      </span>
                  ))}
               </div>
           </div>
        )}
      </>
    </div>
  )
}