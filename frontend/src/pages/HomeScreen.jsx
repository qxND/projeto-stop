// src/pages/HomeScreen.jsx
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Store, LogOut, Trophy, Info } from 'lucide-react'; // Ícones
import CyberLogo from '../components/CyberLogo'; // Importa o componente 3D
import GlitchText from '../components/GlitchText'; // Importa o componente de texto com glitch
import PixelBlast from '../components/PixelBlast';
import TargetCursor from '../components/TargetCursor'; // 1. Importe o TargetCursor
import { playAudio } from '../lib/audio';

export default function HomeScreen() {
  const navigate = useNavigate();

  // Inicia a música de fundo quando o componente é montado
  useEffect(() => {
    playAudio();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('meuJogadorId');
    sessionStorage.removeItem('meuJogadorId'); 
    navigate('/login'); 
  };

  return (
    <div className="relative flex flex-col items-center justify-center min-h-[calc(100vh-120px)] text-white font-cyber [perspective:1000px]">
      <PixelBlast className="absolute inset-0 w-full h-full z-0" />
      <div className="absolute z-10 max-w-md mx-auto flex flex-col items-center justify-center w-full">
        <div className="w-full max-w-xs h-48 ">
          <CyberLogo />
        </div>

        <GlitchText text="C://STOP_" fontSize={3} color="rgb(57, 255, 20)" fontWeight="bold" textAlign="center" font="https://fonts.gstatic.com/s/orbitron/v35/yMJMMIlzdpvBhQQL_SC3X9yhF25-T1ny_Cmxpg.ttf" />

        <div className="space-y-6 w-full max-w-xs [transform-style:preserve-3d]">
          <button
            onClick={() => navigate('/lobby')} 
            className="w-full bg-accent text-black font-bold py-4 px-6 text-xl flex items-center justify-center gap-3 
                       transition-all duration-300 
                       [transform:translateZ(0px)]
                       hover:scale-105 hover:[transform:translateZ(20px)] 
                       shadow-lg shadow-accent/20
                       cursor-target
                       relative z-10" 
            data-augmented-ui="tl-clip tr-clip br-clip bl-clip border"
          >
            <Play size={24} />
            Jogar
          </button>
          <button
            onClick={() => navigate('/shop')}
            className="w-full bg-primary text-black font-bold py-4 px-6 text-xl flex items-center justify-center gap-3 
                       transition-all duration-300 
                       [transform:translateZ(0px)]
                       hover:scale-105 hover:[transform:translateZ(20px)] 
                       shadow-lg shadow-primary/20
                       cursor-target
                       relative z-10"
            data-augmented-ui="tl-clip tr-clip br-clip bl-clip border"
          >
            <Store size={24} />
            Loja
          </button>
          <button
            onClick={() => navigate('/ranking')}
            className="w-full bg-secondary text-black font-bold py-4 px-6 text-xl flex items-center justify-center gap-3 
                       transition-transform duration-300 hover:scale-105 hover:[transform:translateZ(20px)] 
                       shadow-lg shadow-secondary/20
                       cursor-target"
            data-augmented-ui="tl-clip tr-clip br-clip bl-clip border"
          >
            <Trophy size={24} />
            Ranking
          </button>
          <button
            onClick={() => navigate('/about-us')}
            className="w-full bg-gray-500 text-black font-bold py-4 px-6 text-xl flex items-center justify-center gap-3
                       transition-transform duration-300 hover:scale-105 hover:[transform:translateZ(20px)]
                       shadow-lg shadow-gray-500/20
                       cursor-target"
            data-augmented-ui="tl-clip tr-clip br-clip bl-clip border"
          >
            <Info size={24} />
            Sobre Nós
          </button>
        </div>
      </div>
    </div>
  );
}