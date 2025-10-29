// src/pages/HomeScreen.jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Store, LogOut } from 'lucide-react'; // Ícones

export default function HomeScreen() {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('meuJogadorId');
    sessionStorage.removeItem('meuJogadorId'); // Limpa ambos
    navigate('/login'); // Redireciona para login
    // Poderia usar location.href='/login' para forçar recarregamento se necessário
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-120px)] text-white p-4"> {/* Ajusta altura para descontar nav */}
      <h1 className="text-4xl md:text-5xl font-bold mb-12 text-center">
        Bem-vindo ao Stop Online!
      </h1>

      <div className="space-y-6 w-full max-w-xs">
        {/* Botão Jogar */}
        <button
          onClick={() => navigate('/lobby')} // Navega para a rota do Lobby
          className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-6 rounded-lg text-xl flex items-center justify-center gap-3 transition-transform hover:scale-105 shadow-lg"
        >
          <Play size={24} />
          Jogar
        </button>

        {/* Botão Loja */}
        <button
          onClick={() => navigate('/shop')} // Navega para a rota da Loja
          className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-4 px-6 rounded-lg text-xl flex items-center justify-center gap-3 transition-transform hover:scale-105 shadow-lg"
        >
          <Store size={24} />
          Loja
        </button>
      </div>

       {/* Botão Sair (opcional, pode manter na nav principal se preferir) */}
       <button
          onClick={handleLogout}
          className="mt-12 text-gray-400 hover:text-red-500 flex items-center gap-2 transition-colors"
        >
           <LogOut size={18} />
           Sair
       </button>
    </div>
  );
}