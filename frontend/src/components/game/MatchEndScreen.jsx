// src/components/game/MatchEndScreen.jsx
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function MatchEndScreen({ totais, vencedor, meuJogadorId, onReFetchInventory }) {
  const navigate = useNavigate();

  // Rebusca o inventário (para moedas) quando esta tela aparece
  useEffect(() => {
    if(onReFetchInventory) {
      onReFetchInventory();
    }
  }, [onReFetchInventory]);

  const isEmpate = vencedor?.empate;
  const myScore = totais[meuJogadorId] || 0;
  const isWinner = !isEmpate && vencedor?.jogador_id === meuJogadorId;
  const isLoser = !isEmpate && vencedor?.jogador_id !== meuJogadorId;
  const isTieParticipant = isEmpate && vencedor?.jogadores?.includes(meuJogadorId);

  return (
    <div className="max-w-xl mx-auto text-white p-6 bg-gray-800 rounded-lg shadow-xl text-center">
      <h2 className="text-3xl font-bold mb-4">Partida encerrada!</h2>

      {/* Mensagem de Resultado */}
      {isWinner && <p className="text-2xl text-yellow-400 font-semibold mb-3">🎉 Você Venceu! 🎉</p>}
      {isLoser && <p className="text-2xl text-gray-400 font-semibold mb-3">😢 Você não venceu desta vez.</p>}
      {isTieParticipant && <p className="text-2xl text-blue-400 font-semibold mb-3">🤝 Empate! 🤝</p>}
      {isEmpate && !isTieParticipant && <p className="text-2xl text-gray-400 font-semibold mb-3">🤝 Empate entre outros jogadores.</p>}

      {/* Detalhes do Vencedor/Empate */}
      {isEmpate ? (
        <p className="mb-2">
          <b>Empate</b> entre Jogadores <b className="text-blue-300">{Array.isArray(vencedor?.jogadores) ? vencedor.jogadores.join(' e ') : '-'}</b>
          {' '}com <b className="text-yellow-300">{vencedor?.total ?? 0} pontos</b> cada.
        </p>
      ) : (
        <p className="mb-2">
          Vencedor: Jogador <b className="text-yellow-300">{vencedor?.jogador_id ?? '-'}</b> com <b className="text-yellow-300">{vencedor?.total ?? 0} pontos</b>.
        </p>
      )}
       <p className="mb-4">Sua pontuação final: <b className="text-xl text-cyan-400">{myScore}</b></p>

      {/* Placar Final Detalhado */}
      <h3 className="mt-5 mb-2 font-medium text-lg">Placar Final Detalhado</h3>
      <pre className="bg-gray-900 p-3 rounded mt-1 text-sm text-left overflow-x-auto max-h-40">
        {JSON.stringify(totais, null, 2)}
      </pre>
      {/* Botão para voltar ao Lobby */}
      <button
          onClick={() => navigate('/')}
          className="mt-6 bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded text-lg font-semibold transition-transform hover:scale-105"
      >
          Voltar ao Lobby
      </button>
    </div>
  );
}