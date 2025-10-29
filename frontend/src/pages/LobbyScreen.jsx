// frontend/src/pages/LobbyScreen.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api'; //

export default function LobbyScreen() {
  const nav = useNavigate(); //
  const [roomIdToJoin, setRoomIdToJoin] = useState(''); //
  const [roomName, setRoomName] = useState(''); //
  const [creating, setCreating] = useState(false); //
  const [joining, setJoining] = useState(false); //

  const createRoom = async () => {
    setCreating(true); //
    try {
      // Chama a API para criar a sala
      const { data } = await api.post('/rooms', { nome_sala: roomName || 'Sala do Jogador' }); //

      // LOG ADICIONADO: Verificar a resposta da API
      console.log("API /rooms response:", data);

      // guarda o ID do jogador criador (host)
      // CUIDADO: Verifica se 'host_user' existe na resposta antes de usar
      if (data && data.host_user) {
        sessionStorage.setItem('meuJogadorId', String(data.host_user)); //
      } else {
         console.warn("API /rooms não retornou host_user. ID do jogador pode não ter sido salvo.");
      }

      // Navega para a tela de espera da sala criada
      if (data && data.sala_id) { // VERIFICAÇÃO ADICIONADA
        console.log(`Navegando para /waiting/${data.sala_id}`);
        nav(`/waiting/${data.sala_id}`); //
      } else {
        console.error("Erro: sala_id não encontrado na resposta da API /rooms");
        alert("Erro ao criar sala: ID da sala não recebido.");
      }
    } catch (e) {
      // LOG ADICIONADO: Verificar o erro
      console.error("Erro ao criar sala (API /rooms):", e.response?.data || e.message || e);
      alert(e.response?.data?.error || e.message || "Ocorreu um erro desconhecido ao criar a sala."); // Mensagem de fallback
    } finally {
      setCreating(false); //
    }
  };

  const joinExisting = async () => {
    // Verifica se um ID de sala foi inserido
    if (!roomIdToJoin.trim()) {
      alert('Informe o ID da sala'); //
      return;
    }
    setJoining(true); //
    try {
      // Chama a API para entrar numa sala existente
      const { data } = await api.post('/rooms/join', { sala_id: Number(roomIdToJoin) }); //

      // LOG ADICIONADO: Verificar a resposta da API
      console.log("API /rooms/join response:", data);

      // guarda o ID do jogador que entrou (guest)
      // CUIDADO: Verifica se 'guest_user' existe na resposta antes de usar
      if (data && data.guest_user) {
        sessionStorage.setItem('meuJogadorId', String(data.guest_user)); //
      } else {
         console.warn("API /rooms/join não retornou guest_user. ID do jogador pode não ter sido salvo.");
      }

      // Navega para a tela de espera da sala que entrou
      if (data && data.sala_id) { // VERIFICAÇÃO ADICIONADA
        console.log(`Navegando para /waiting/${data.sala_id}`);
        nav(`/waiting/${data.sala_id}`); //
      } else {
        console.error("Erro: sala_id não encontrado na resposta da API /rooms/join");
        alert("Erro ao entrar na sala: ID da sala não recebido.");
      }
    } catch (e) {
      // LOG ADICIONADO: Verificar o erro
      console.error("Erro ao entrar na sala (API /rooms/join):", e.response?.data || e.message || e);
      alert(e.response?.data?.error || e.message || "Ocorreu um erro desconhecido ao entrar na sala."); // Mensagem de fallback
    } finally {
      setJoining(false); //
    }
  };

  // --- Renderização do Componente ---
  return (
    <div className="max-w-md mx-auto space-y-4 text-white p-4"> {/* Adicionado text-white e padding */}
      <h1 className="text-3xl font-bold text-center mb-6">Stop Online • Lobby</h1> {/* Centralizado e com margem */}

      {/* Seção para Criar Sala */}
      <div className="bg-gray-800 p-6 rounded-lg shadow-md space-y-4">
        <h2 className="text-xl font-semibold mb-3">Criar Nova Sala</h2> {/* */}
        <input
          className="w-full border border-gray-700 bg-gray-700 p-3 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Nome da sala (opcional)"
          value={roomName}
          onChange={(e) => setRoomName(e.target.value)} //
        />
        <button
          className="w-full bg-green-600 hover:bg-green-700 py-3 rounded font-bold transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed"
          onClick={createRoom} //
          disabled={creating} //
        >
          {creating ? 'Criando...' : 'Criar Sala'} {/* */}
        </button>
      </div>

      {/* Divisor Visual */}
      <div className="relative flex py-5 items-center">
        <div className="flex-grow border-t border-gray-600"></div> {/* */}
        <span className="flex-shrink mx-4 text-gray-400">OU</span> {/* */}
        <div className="flex-grow border-t border-gray-600"></div> {/* */}
      </div>

      {/* Seção para Entrar em Sala Existente */}
      <div className="bg-gray-800 p-6 rounded-lg shadow-md space-y-4">
         <h2 className="text-xl font-semibold mb-3">Entrar em Sala Existente</h2> {/* */}
        <div className="flex gap-2">
          <input
            className="flex-1 border border-gray-700 bg-gray-700 p-3 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="ID da sala"
            value={roomIdToJoin}
            onChange={(e) => setRoomIdToJoin(e.target.value)} //
            type="number" // Garante que apenas números sejam inseridos (embora a validação final seja string)
          />
          <button
            className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded font-bold transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed" // Aumentado padding
            onClick={joinExisting} //
            disabled={joining} //
          >
             {joining ? 'Entrando...' : 'Entrar'} {/* */}
          </button>
        </div>
      </div>
    </div>
  );
}