// src/pages/WaitingRoomScreen.jsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api'; // Usa a instância axios configurada
import socket from '../lib/socket'; // Importar instância do socket
import { ArrowLeft, Loader2, Play, ClipboardCopy, Users } from 'lucide-react'; // Ícones atualizados

function WaitingRoomScreen() {
    const { salaId } = useParams(); // Pega o ID da sala da URL
    const navigate = useNavigate(); //
    const [sala, setSala] = useState(null); //
    const [loading, setLoading] = useState(true); //
    const [error, setError] = useState(''); //
    const [copySuccess, setCopySuccess] = useState(''); // Estado para feedback de cópia
    const [leaving, setLeaving] = useState(false); // Estado para indicar que está saindo

    // Função para copiar o ID da sala para a área de transferência
    const copyToClipboard = async () => { //
        try { //
            await navigator.clipboard.writeText(salaId); //
            setCopySuccess('ID copiado!'); //
            setTimeout(() => setCopySuccess(''), 2000); //
        } catch (err) { //
            setCopySuccess('Falha ao copiar'); //
            console.error('Falha ao copiar ID da sala: ', err); //
            setTimeout(() => setCopySuccess(''), 2000); //
        }
    };

    // Função para chamar o endpoint de início de partida
    const handleStartGame = async () => { //
        setLoading(true); //
        setError(''); //
        try { //
            // Chama API para iniciar partida
            await api.post(`/matches/start`, { sala_id: Number(salaId) });
            // A navegação será tratada pelo useEffect ao detectar mudança de status
        } catch (err) { //
            console.error('Erro ao iniciar partida:', err); //
            setError(err.response?.data?.error || err.message || 'Falha ao iniciar a partida.'); //
            setLoading(false); // Remove loading se deu erro
        }
    };

    // Função para sair da sala - AGORA CHAMA A API
    const handleLeaveRoom = async () => { //
      setLeaving(true);
      setError('');
      try {
          await api.post(`/rooms/${salaId}/leave`); // Chama a nova rota
          navigate('/'); // Volta para o Lobby após sair com sucesso
      } catch (error) {
          console.error("Erro ao sair da sala:", error);
          setError(error.response?.data?.error || error.message || 'Falha ao sair da sala.');
          // Limpa o erro após um tempo
          setTimeout(() => setError(''), 3000);
          setLeaving(false); // Permite tentar novamente após erro
      }
    };

    // Efeito para buscar o estado da sala periodicamente E OUVIR SOCKETS
    useEffect(() => { //
        let isMounted = true; //
        let intervalId = null; //
        let initialLoadAttempted = false; //

        const fetchSalaState = async (isInitial = false) => {
            if (!isMounted) return; //
             if (isInitial) setLoading(true);

            try { //
                const response = await api.get(`/rooms/${salaId}`); //
                const salaData = response.data; //

                if (isMounted) { //
                    setSala(salaData); //
                    setError(''); //

                    // Navega se o jogo começou (MOVEMOS ISSO PARA O SOCKET)

                     // Se a sala foi terminada ou abandonada enquanto esperava, volta ao lobby
                     if (salaData.status === 'terminada' || salaData.status === 'abandonada') {
                         console.log(`Sala ${salaId} com status ${salaData.status}, voltando ao lobby.`);
                         alert(`A sala foi ${salaData.status}.`);
                         navigate('/');
                     }
                }

            } catch (err) { //
                console.error('Erro ao buscar estado da sala:', err); //
                 if (isMounted) { //
                    // Se receber 410 (Gone) ou 404 (Not Found)...
                    if (err.response?.status === 404 || err.response?.status === 410) { //
                        
                         // --- MODIFICAÇÃO CHAVE AQUI ---
                         // Se a falha (404/410) ocorreu na *primeira tentativa* de carregamento...
                        if (!initialLoadAttempted) {
                            // ... é provável que seja a race condition. Não navegue.
                            // Apenas exiba um erro temporário e deixe o polling tentar de novo.
                            console.warn("Falha na busca inicial da sala (404/410). Provável race condition. Tentando novamente via polling...");
                            setError('Conectando à sala... (tentativa 1 falhou, tentando de novo...)');
                        } else {
                            // Se a falha (404/410) ocorreu DEPOIS da carga inicial (no polling)...
                            // ...aí sim a sala realmente foi abandonada ou não existe.
                            alert(err.response?.data?.error || 'Sala não encontrada ou abandonada. A redirecionar para o lobby.'); //
                            navigate('/'); //
                        }
                        // --- FIM DA MODIFICAÇÃO ---

                    } else { //
                        // Outros erros (ex: 500)
                        if (initialLoadAttempted) { //
                           setError('Não foi possível atualizar o estado da sala. Tentando novamente...'); //
                        } else { //
                           setError('Falha ao carregar dados da sala. Verifique o ID ou tente novamente.');
                           console.warn("Falha na busca inicial da sala (outro erro)."); //
                        }
                    }
                 }
           } finally { //
               // Garante que setLoading(false) só roda uma vez após a primeira tentativa
               if (isMounted && !initialLoadAttempted) { //
                   initialLoadAttempted = true; //
                   setLoading(false); //
               } else if (isMounted && isInitial) {
                    setLoading(false); // Garante que tira o loading inicial mesmo se falhar
               }
           }
        };

       // --- LISTENERS DO SOCKET.IO ---
       const handlePlayersUpdate = ({ jogadores }) => {
           console.log('Recebido room:players_updated', jogadores);
           if (isMounted) {
               // Atualiza a lista de jogadores no estado local da sala
               setSala(currentSala => {
                   if (!currentSala) return null; // Se sala ainda não carregou, ignora
                   // Retorna um NOVO objeto sala com a lista de jogadores atualizada
                   return { ...currentSala, jogadores: jogadores };
               });
           }
       };

       const handleRoomAbandoned = ({ message }) => {
           console.log('Recebido room:abandoned', message);
           if (isMounted) {
               alert(message || 'O criador abandonou a sala. Voltando ao lobby.');
               navigate('/');
           }
       };
       
       const handleGameStarted = (data) => {
            console.log("Recebido 'round:ready' ou 'round:started'. Navegando para o jogo...", data);
            if (isMounted) {
                // Remove listeners específicos desta tela ANTES de navegar
                socket.off('room:players_updated', handlePlayersUpdate);
                socket.off('room:abandoned', handleRoomAbandoned);
                socket.off('round:ready', handleGameStarted); // Desregistra este listener
                socket.off('round:started', handleGameStarted); // E este também

                navigate(`/game/${salaId}`); // Navega para a tela do jogo
            }
       };

       // Registra os listeners
       socket.on('room:players_updated', handlePlayersUpdate);
       socket.on('room:abandoned', handleRoomAbandoned);
       socket.on('round:ready', handleGameStarted); // Ouve 'round:ready'
       socket.on('round:started', handleGameStarted); // Ouve 'round:started' também por segurança
       
       // Entra na sala do socket (caso não tenha entrado antes ou reconectou)
       socket.emit('join-room', String(salaId)); //
       console.log(`Socket join-room emitido para sala ${salaId}`);

        fetchSalaState(true); // Busca inicial
        intervalId = setInterval(fetchSalaState, 5000); // Polling como fallback (aumentado para 5s)

        // Função de Limpeza
        return () => { //
            console.log("Limpando WaitingRoomScreen"); //
            isMounted = false; //
            if (intervalId) clearInterval(intervalId); //
           // Desregistra os listeners
           socket.off('room:players_updated', handlePlayersUpdate);
           socket.off('room:abandoned', handleRoomAbandoned);
           socket.off('round:ready', handleGameStarted); // Garante desregistro
           socket.off('round:started', handleGameStarted); // Garante desregistro
        };
    }, [salaId, navigate]); //

    // Estado de Carregamento Inicial
    if (loading || !sala) { //
        return ( //
             <div className="text-white text-center p-10 flex flex-col items-center justify-center gap-4"> {/* */}
               <Loader2 className="animate-spin h-10 w-10 text-blue-400" /> {/* */}
               <p>A entrar na sala #{salaId}...</p> {/* */}
               {/* Exibe o erro de "tentando de novo" aqui */}
               {error && <p className="text-yellow-400 mt-2">{error}</p>} {/* */}
             </div>
        );
    }

    // --- Renderização Principal (sem alteração) ---
    return ( //
        <div className="p-4 md:p-8 text-white max-w-2xl mx-auto relative"> {/* */}
            {/* Botão Sair */}
            <button
                onClick={handleLeaveRoom} //
                disabled={leaving} // Desabilita enquanto está saindo
                className="absolute top-4 left-4 md:top-6 md:left-6 text-gray-400 hover:text-white transition-colors flex items-center gap-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed" //
                title="Sair da sala" //
            >
                {leaving ? <Loader2 size={16} className="animate-spin" /> : <ArrowLeft size={16} />} {/* */}
                {leaving ? 'Saindo...' : 'Voltar ao Lobby'} {/* */}
            </button>

            {/* Cabeçalho da Sala */}
             <div className="text-center mb-8 pt-8 md:pt-4"> {/* */}
                <h1 className="text-3xl md:text-4xl font-bold mb-2">Sala: {sala.nome_sala}</h1> {/* */}

                {/* ID da Sala para compartilhar */}
                <div className="flex items-center justify-center gap-2 mt-3 mb-2"> {/* */}
                    <span className="text-gray-400">ID da Sala:</span> {/* */}
                    <span className="text-2xl font-mono text-cyan-400 bg-gray-700 px-3 py-1 rounded"> {/* */}
                        {salaId} {/* */}
                    </span>
                    <button onClick={copyToClipboard} title="Copiar ID" className="text-gray-400 hover:text-cyan-300 transition-colors p-1"> {/* */}
                        <ClipboardCopy size={20}/> {/* */}
                    </button>
                </div>
                {copySuccess && <p className="text-xs text-green-400 h-4">{copySuccess}</p>} {/* */}


                <p className="text-gray-400 mt-2 text-sm">Criada por: {sala.jogador?.nome_de_usuario || 'Desconhecido'}</p> {/* */}
                {/* EXIBE OS NOVOS STATUS */}
                 <p className={`mt-1 text-sm font-semibold ${
                      sala.status === 'waiting' ? 'text-yellow-400'
                    : sala.status === 'in_progress' ? 'text-green-400'
                    : sala.status === 'terminada' ? 'text-blue-400'
                    : sala.status === 'abandonada' ? 'text-red-500'
                    : 'text-gray-400' // Outros status
                 }`}> {/* */}
                    Status: {
                        sala.status === 'waiting' ? 'Aguardando Jogadores...'
                      : sala.status === 'in_progress' ? 'Em Jogo'
                      : sala.status === 'terminada' ? 'Partida Terminada'
                      : sala.status === 'abandonada' ? 'Sala Abandonada'
                      : sala.status // Mostra o status literal se for outro
                    } {/* */}
                 </p>
                 {/* Exibe o erro do polling (se houver) */}
                 {error && <p className="text-red-400 mt-2 text-sm">{error}</p>} {/* */}
            </div>

            {/* Lista de Jogadores (agora ocupa a largura total) */}
            <div className="bg-gray-800 p-4 md:p-6 rounded-lg shadow-md mb-8"> {/* */}
                <h2 className="text-xl md:text-2xl font-semibold mb-4 flex items-center gap-2"> {/* */}
                   <Users size={24} /> Jogadores na Sala ({sala.jogadores?.length || 0}) {/* */}
                </h2>
                <ul className="space-y-2 max-h-60 overflow-y-auto pr-2"> {/* */}
                    {(sala.jogadores || []).map((nome, index) => ( //
                       <li key={index} className="text-base md:text-lg bg-gray-700/50 px-3 py-1.5 rounded flex items-center gap-2"> {/* */}
                          <span className={`h-2 w-2 rounded-full ${index === 0 ? 'bg-yellow-400' : 'bg-blue-400'}`}></span> {/* */}
                          {nome} {/* */}
                          {index === 0 && <span className="text-xs text-yellow-400 font-semibold ml-auto">(Criador)</span>} {/* */}
                       </li>
                    ))}
                     {/* Mensagem se não houver jogadores */}
                     {sala.jogadores?.length === 0 && !loading && <li className="text-gray-500 italic">Nenhum jogador ainda.</li>} {/* */}
                </ul>
            </div>

            {/* Botão de Iniciar Partida ou Mensagem de Espera */}
            {/* Só mostra botões/mensagens se a sala estiver 'waiting' */}
            {sala.status === 'waiting' && ( //
                <div className="mt-8 md:mt-6 text-center"> {/* */}
                    {/* Botão Iniciar para o criador */}
                    {sala.is_creator && ( //
                        <button
                            onClick={handleStartGame} //
                            disabled={loading || sala.jogadores?.length < 2} // Desabilita se carregando OU se tiver menos de 2 jogadores
                            className="px-8 py-3 md:px-10 md:py-4 bg-green-600 rounded-lg font-bold text-lg md:text-xl hover:bg-green-700 disabled:bg-gray-500 disabled:cursor-not-allowed transition-transform hover:scale-105 flex items-center justify-center gap-2 mx-auto" //
                            title={sala.jogadores?.length < 2 ? "Precisa de pelo menos 2 jogadores para iniciar" : "Iniciar a partida"} //
                        >
                            {loading && !leaving ? <Loader2 className="animate-spin" /> : <Play />} {/* Garante que não mostra loading se estiver saindo */} {/* */}
                            {loading && !leaving ? 'A Iniciar...' : 'Iniciar Partida'} {/* */}
                        </button>
                    )}
                    {/* Mensagem de espera para não criadores */}
                    {!sala.is_creator && ( //
                        <p className="text-base md:text-lg text-gray-400 flex items-center justify-center gap-2"> {/* */}
                           <Loader2 className="animate-spin h-5 w-5"/> A aguardar que o líder <span className="font-semibold text-yellow-400">{sala.jogador?.nome_de_usuario || ''}</span> inicie a partida... {/* */}
                        </p>
                    )}
                     {/* Mensagem para o criador quando não há jogadores suficientes */}
                    {sala.is_creator && sala.jogadores?.length < 2 && ( //
                           <p className="text-sm text-yellow-500 mt-2">É necessário pelo menos 2 jogadores para iniciar a partida.</p> //
                    )}
                </div>
            )}
             {/* Mensagem se a partida já começou (caso raro, pois deveria ter navegado) */}
             {sala.status !== 'waiting' && !loading && sala.status !== 'abandonada' && sala.status !== 'terminada' &&( //
                  <p className="text-base md:text-lg text-blue-400 text-center">Partida em andamento ou finalizada...</p> //
             )}
             {/* Mensagem para sala abandonada/terminada */}
              {(sala.status === 'abandonada' || sala.status === 'terminada') && !loading && (
                    <p className={`text-base md:text-lg text-center font-semibold ${sala.status === 'abandonada' ? 'text-red-500' : 'text-blue-400'}`}>
                       Esta sala foi {sala.status}.
                    </p>
              )}
        </div>
    );
}

export default WaitingRoomScreen;