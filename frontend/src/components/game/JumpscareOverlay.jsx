// src/components/game/JumpscareOverlay.jsx
import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Ghost } from 'lucide-react'; // Importe o ícone se for usar

// --- Componente Jumpscare Overlay ---
// (Movido de GameScreen.jsx)
function JumpscareOverlay({ imageUrl, soundUrl, onEnd }) {
  useEffect(() => {
    // Toca o som (se houver)
    let audio = null;
    if (soundUrl) {
      audio = new Audio(soundUrl);
      audio.play().catch(e => console.error("Erro ao tocar som do jumpscare:", e));
    }

    // Define um timer para esconder o jumpscare
    const timer = setTimeout(onEnd, 1500); // Mostra por 1.5 segundos

    // Limpeza ao desmontar
    return () => {
      clearTimeout(timer);
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
    };
  }, [soundUrl, onEnd]);

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 overflow-hidden pointer-events-none"
      initial={{ scale: 0.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 1.5, opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Idealmente, usar uma imagem de props ou uma padrão */}
      <motion.img
        // src={imageUrl || '/path/to/default/jumpscare.png'}
        src="https://www.showmetech.com.br/wp-content/uploads//2020/07/original-1920x1080-1.png" // URL de Exemplo - SUBSTITUA!
        alt="JUMPSCARE!"
        className="max-w-[80vw] max-h-[80vh] object-contain"
        initial={{ scale: 1 }}
        animate={{ scale: [1, 1.2, 1, 1.1, 1] }} // Efeito de tremor/zoom rápido
        transition={{ duration: 0.5, times: [0, 0.1, 0.3, 0.4, 0.5] }}
      />
       {/* Alternativa com Ícone: <Ghost className="w-64 h-64 text-red-500 animate-ping" /> */}
    </motion.div>
  );
}

export default JumpscareOverlay;