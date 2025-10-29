// src/pages/GameScreen.jsx
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect } from 'react'; // <-- IMPORTAR useEffect

// Nossos novos Hooks
import { useGameSocket } from '../hooks/useGameSocket';
import { useGameInput } from '../hooks/useGameInput';
import { usePowerUps } from '../hooks/usePowerUps';

// Nossos novos Componentes de UI
import JumpscareOverlay from '../components/game/JumpscareOverlay';
import MatchEndScreen from '../components/game/MatchEndScreen';
import WaitingForRound from '../components/game/WaitingForRound';
import ActiveRound from '../components/game/ActiveRound';

export default function GameScreen() {
  const { salaId } = useParams();
  const meuJogadorId = Number(
    localStorage.getItem('meuJogadorId') ||
    sessionStorage.getItem('meuJogadorId') ||
    '0'
  );

  // --- HOOKS DE LÓGICA ---
  
  // 1. Hook de Socket: Gerencia o estado principal do jogo (CHAMADO PRIMEIRO)
  const { 
    socket, 
    gameState, 
    effectsState 
  } = useGameSocket(salaId); // Não precisa mais da callback
  
  // Desestrutura o estado para passar para os outros hooks
  const { rodadaId, isLocked, finalizado, totais, vencedor } = gameState;
  const { activeSkipPowerUpId, setActiveSkipPowerUpId } = effectsState;

  // 2. Hook de Input: Passa o gameState para ele
  const { 
    answers, 
    updateAnswer, 
    skippedCategories, 
    setSkippedCategories,
    onStop, 
    handleSkipCategory,
    enviarRespostas // Pega a função para o novo useEffect
  } = useGameInput(
    gameState, // Passa o objeto de estado inteiro
    salaId, 
    meuJogadorId
  );

  // 3. Hook de Power-ups:
  const { 
    inventario, 
    loadingInventory, 
    handleUsePowerUp,
    fetchInventory 
  } = usePowerUps(
    rodadaId, 
    isLocked
  );

  // 4. NOVO EFFECT: Lida com o 'round:stopping'
  // Este effect observa a mudança em 'isLocked'. 
  // Quando 'isLocked' fica 'true' E uma rodada estava ativa (rodadaId existe),
  // ele dispara o 'enviarRespostas' que foi acionado pelo 'round:stopping'.
  useEffect(() => {
    // Só roda se 'isLocked' for true, e se uma rodada estava em andamento
    if (isLocked && rodadaId && !finalizado) {
      console.log("GameScreen detectou 'isLocked=true' (parada de rodada), enviando respostas...");
      // Envia as respostas da rodada atual, ignorando as puladas
      enviarRespostas(rodadaId, skippedCategories);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLocked, rodadaId, finalizado]); // Depende de isLocked e rodadaId


  // --- LÓGICA DE INTERLIGAÇÃO (Mesma de antes) ---

  const onSkipCategory = (temaId) => {
    handleSkipCategory(temaId); // Do hook de input
    setActiveSkipPowerUpId(null); // Do hook de socket/effects
  };
  
  const onUsePowerUp = (powerUp) => {
    if (powerUp.code === 'SKIP_OWN_CATEGORY' && activeSkipPowerUpId) {
      alert("Pular Categoria já está ativo!"); return;
    }
    if (powerUp.code === 'REVEAL_OPPONENT_ANSWER' && effectsState.revealPending) {
      alert("Você já ativou a revelação para esta rodada."); return;
    }
    handleUsePowerUp(powerUp); // Do hook de power-ups
  };


  // --- RENDERIZAÇÃO (Mesma de antes) ---
  return (
    <>
      {/* 1. Overlay de Jumpscare */}
      <AnimatePresence>
        {effectsState.showJumpscare && (
          <JumpscareOverlay
            imageUrl={effectsState.jumpscareData.image}
            soundUrl={effectsState.jumpscareData.sound}
            onEnd={() => effectsState.setShowJumpscare(false)}
          />
        )}
      </AnimatePresence>

      {/* 2. Conteúdo Principal da Página */}
      {finalizado ? (
        // Tela de Fim de Jogo
        <MatchEndScreen
          totais={totais}
          vencedor={vencedor}
          meuJogadorId={meuJogadorId}
          onReFetchInventory={fetchInventory} // Passa a função para rebuscar moedas
        />
      ) : !rodadaId ? (
        // Tela de "Aguardando"
        <WaitingForRound salaId={salaId} />
      ) : (
        // Tela de "Jogo Ativo"
        <ActiveRound
          salaId={salaId}
          meuJogadorId={meuJogadorId}
          gameState={gameState}
          effectsState={{...effectsState, activeSkipPowerUpId, setActiveSkipPowerUpId}}
          inputState={{ answers, updateAnswer, onStop, skippedCategories, handleSkipCategory: onSkipCategory }}
          powerUpState={{ inventario, loadingInventory, handleUsePowerUp: onUsePowerUp }}
        />
      )}
    </>
  );
}