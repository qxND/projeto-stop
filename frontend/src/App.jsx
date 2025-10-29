// frontend/src/App.jsx (Atualizado)
import { Outlet, Link } from 'react-router-dom'
import { Home, LogOut } from 'lucide-react' // Ajustar ícones

export default function App() {
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('meuJogadorId');
    sessionStorage.removeItem('meuJogadorId'); // Limpa ambos
    location.href='/login'; // Redireciona para login (força recarregamento)
  };

  return (
    <div className="bg-gray-900 min-h-screen text-white">
      <nav className="bg-gray-800 p-4 flex justify-between items-center shadow-lg sticky top-0 z-20">
        {/* Links removidos, pode adicionar um link para Home se desejar */}
        <Link to="/" className="hover:text-blue-400 flex items-center gap-1 font-semibold text-lg">
           <Home size={18}/> Stop Online {/* Ou apenas "Home" */}
        </Link>
        
        {/* Botão Sair mantido aqui */}
        <button
          onClick={handleLogout}
          className="bg-red-600 px-3 py-1 rounded hover:bg-red-700 text-sm flex items-center gap-1"
        >
          <LogOut size={16} /> Sair
        </button>
      </nav>
      {/* Container com padding para o conteúdo */}
      <main className="p-4 md:p-8 max-w-7xl mx-auto">
        <Outlet /> {/* As rotas filhas (HomeScreen, Lobby, Game, Shop) serão renderizadas aqui */}
      </main>
    </div>
  )
}