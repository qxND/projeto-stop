// src/components/game/WaitingForRound.jsx
import { useState } from 'react';
import api from '../../lib/api';
import { Loader2, Star } from 'lucide-react';

export default function WaitingForRound({ salaId }) {
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState('');

  const iniciarPartida = async () => {
    setIsStarting(true);
    setError('');
    try {
        console.log(`Tentando iniciar partida na sala ${salaId}`);
        await api.post('/matches/start', { sala_id: Number(salaId), duration: 20 });
        // Não faz nada aqui, espera o 'round:started'
    } catch (error) {
        console.error("Erro ao iniciar partida:", error.response?.data?.error || error.message);
        setError(`Erro ao iniciar: ${error.response?.data?.error || error.message}`);
        setIsStarting(false);
    }
  };

  return (
    <div className="text-center p-10 bg-gray-800 rounded-lg shadow">
        <p className="mb-4 text-xl text-gray-300">Aguardando início da partida...</p>
        <button
          className="bg-green-600 hover:bg-green-700 px-6 py-3 rounded text-lg font-bold disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center gap-2 mx-auto transition-transform hover:scale-105"
          onClick={iniciarPartida}
          disabled={isStarting}
        >
          {isStarting ? <Loader2 className="animate-spin" /> : <Star />}
          Iniciar Partida (Fallback)
        </button>
         <p className="text-xs text-gray-500 mt-2">(Normalmente iniciado na tela anterior)</p>
         {error && <p className="text-red-400 mt-2">{error}</p>}
    </div>
  );
}