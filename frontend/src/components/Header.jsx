// frontend/src/components/Header.jsx
import { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Gem, User, LogOut, Volume2, VolumeX } from 'lucide-react';
import avatarList from '../lib/avatarList';
import api from '../lib/api';
import socket from '../lib/socket';
import { stopAudio } from '../lib/audio';
import { useExitConfirmation } from '../hooks/useExitConfirmation';
import ExitConfirmationModal from './ExitConfirmationModal';
import { useUserData } from '../hooks/useUserData';


export default function Header({ volume, onVolumeChange }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: userLoading } = useUserData();
  const [moedas, setMoedas] = useState(0);

  // Detecta rota de sala/jogo
  const isWaitingRoom = location.pathname.startsWith('/waiting/');
  const isGameScreen = location.pathname.startsWith('/game/');
  let salaId = null;
  if (isWaitingRoom || isGameScreen) {
    const match = location.pathname.match(/\/(?:waiting|game)\/(\d+)/);
    salaId = match ? match[1] : null;
  }
  const matchStarted = isGameScreen;

  const {
    showModal,
    confirmExit,
    cancelExit,
    handleExitClick
  } = useExitConfirmation(salaId, matchStarted);

  // --- fetchMoedas agora disponível no escopo do componente ---
  const fetchMoedas = async () => {
    try {
      const { data } = await api.get('/shop/inventory');
      setMoedas(data?.moedas || 0);
    } catch (err) {
      console.error('Header: Erro ao buscar saldo de moedas:', err);
      setMoedas(0);
    }
  };

  // --- Sincronização de moedas: API, socket, CustomEvent and localStorage fallback ---
  useEffect(() => {
    let mounted = true;

    // inicial
    fetchMoedas();

    // Handler para CustomEvent dispatched pela ShopScreen:
    const onUpdateCoinsEvent = (ev) => {
      try {
        const detail = ev?.detail;
        if (detail && typeof detail.moedas === 'number') {
          setMoedas(detail.moedas);
        } else {
          fetchMoedas();
        }
      } catch (err) {
        console.error('Header: erro ao processar updateCoins event', err);
        fetchMoedas();
      }
    };

    // Handler para socket event name 'inventory:updated' (payload pode conter moedas)
    const onInventoryUpdateSocket = (payload) => {
      try {
        if (payload && typeof payload.moedas === 'number') {
          setMoedas(payload.moedas);
        } else {
          fetchMoedas();
        }
      } catch (err) {
        console.error('Header: erro no socket inventory:updated handler', err);
        fetchMoedas();
      }
    };

    // Handler para localStorage (útil para múltiplas abas). Note: storage só dispara em outras abas.
    const onStorage = (ev) => {
      try {
        if (ev.key === 'userCoins' && ev.newValue != null) {
          const n = Number(ev.newValue);
          if (!Number.isNaN(n)) {
            setMoedas(n);
          } else {
            fetchMoedas();
          }
        }
      } catch (err) {
        console.error('Header: erro onStorage', err);
        fetchMoedas();
      }
    };

    window.addEventListener('updateCoins', onUpdateCoinsEvent);
    window.addEventListener('storage', onStorage);
    socket.on('inventory:updated', onInventoryUpdateSocket);

    return () => {
      mounted = false;
      window.removeEventListener('updateCoins', onUpdateCoinsEvent);
      window.removeEventListener('storage', onStorage);
      socket.off('inventory:updated', onInventoryUpdateSocket);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // monta apenas uma vez

  // --- NOVO: sempre que a rota mudar para a Home ('/'), revalida o saldo ---
  useEffect(() => {
    // quando navegar *para* a home queremos garantir saldo atualizado
    if (location.pathname === '/') {
      fetchMoedas();
    }
    // se quiser que qualquer mudança de rota revalide, mude a condição acima
  }, [location.pathname]); // roda sempre que a rota muda

  // Logout (com interceptação se o usuário estiver em sala/partida)
  const performLogout = () => {
    stopAudio(); // Para a música imediatamente
    try {
      if (socket && socket.connected) socket.disconnect();
    } catch (err) {
      console.warn('Erro ao desconectar socket:', err);
    }

    localStorage.removeItem('token');
    localStorage.removeItem('meuJogadorId');
    sessionStorage.removeItem('meuJogadorId');
    delete api.defaults.headers.common?.Authorization;

    navigate('/login', { replace: true });
  };

  const handleLogout = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (salaId) {
      handleExitClick(() => performLogout());
    }
    else {
      performLogout();
    }
  };

  const handleConfirmExit = async () => {
    await confirmExit();
  };

  // Loading do usuário
  if (userLoading) {
    return (
      <header className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between p-4 bg-black/30 backdrop-blur-sm border-b border-primary/20">
        <Link to="/" className="text-2xl font-bold text-primary hover:text-accent transition-colors font-cyber" title="Voltar à Tela Inicial">
          CYBER-STOP
        </Link>
        {/* enquanto carrega, não mostra o bloco direito */}
      </header>
    );
  }

  // se não está logado, não renderiza header
  if (!user) return null;

  const userAvatar = avatarList.find(a => a.nome === user?.avatar_nome) || avatarList.find(a => a.nome === 'default');

  // Ocultar moedas se estiver na rota /shop ou suas subrotas
  const isOnShopScreen = location.pathname.startsWith('/shop');

  return (
    <>
      {salaId && (
        <ExitConfirmationModal
          isOpen={showModal}
          onConfirm={handleConfirmExit}
          onCancel={cancelExit}
        />
      )}

      <header className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between p-4 bg-black/30 backdrop-blur-sm border-b border-primary/20">
        {/* Logo / nome do jogo */}
        <Link
          to="/"
          className="text-2xl font-bold text-primary hover:text-accent transition-colors font-cyber cursor-target"
          title="Voltar à Tela Inicial"
        >
          CYBER-STOP
        </Link>

        {/* Right side: moedas, avatar e logout */}
        <div className="flex items-center gap-4">
          {/* Saldo de Moedas: escondido em /shop */}
          {!isOnShopScreen && (
            <div
              className="bg-bg-secondary border border-warning/50 rounded px-3 py-1.5 flex items-center gap-2 cursor-target"
              title="Seu Saldo"
              onClick={() => navigate('/shop')}
            >
              <span className="text-lg font-semibold text-warning tabular-nums">
                {moedas.toLocaleString('pt-BR')}
              </span>
              <Gem size={18} className="text-warning" />
            </div>
          )}

          {/* Perfil do Usuário */}
          <div className="flex items-center gap-2">
            <img
              src={userAvatar.url}
              alt="Avatar"
              className="h-10 w-10 rounded-full border-2 border-primary/50 object-cover"
            />
            <div className="hidden md:flex flex-col text-left">
              <span className="text-sm font-semibold text-white">{user?.nome_de_usuario || 'Jogador'}</span>
              <div className="flex gap-2">
                <Link to="/profile" className="text-xs text-text-muted hover:text-primary cursor-target">Ver Perfil</Link>
                <span className="text-xs text-text-muted">|</span>
                <Link to="/about" className="text-xs text-text-muted hover:text-primary cursor-target">Sobre Nós</Link>
                {user?.role === 'admin' && (
                  <>
                    <span className="text-xs text-text-muted">|</span>
                    <Link to="/feedback" className="text-xs text-yellow-400 hover:text-yellow-300 cursor-target">Admin</Link>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Controle de Volume */}
          <div className="flex items-center gap-2 bg-primary/20 p-2 rounded-lg">
            <Volume2 size={20} className="text-white" />
            <input
              type="range"
              min="0"
              max="0.2" // Volume máximo mais baixo para não ser muito alto
              step="0.01"
              value={volume}
              onChange={(e) => onVolumeChange(e.target.value)}
              className="w-24 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-primary"
              title="Volume"
            />
          </div>

          {/* Botão de Logout */}
          <button
            onClick={handleLogout}
            className="bg-red-600/50 hover:bg-red-500/80 text-white p-2 rounded-lg transition-colors cursor-target"
            title="Sair"
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>
    </>
  );
}
