// src/hooks/usePowerUps.js
import { useState, useEffect } from 'react';
import api from '../lib/api';
import socket from '../lib/socket';

export function usePowerUps(rodadaId, isLocked) {
  const [inventario, setInventario] = useState([]);
  const [loadingInventory, setLoadingInventory] = useState(false);

  // Função para buscar o inventário do jogador na API
  const fetchInventory = async () => {
    console.log("Tentando buscar inventário...");
    setLoadingInventory(true);
    try {
      const { data } = await api.get('/shop/inventory');
      setInventario(data?.inventario || []);
      console.log("Inventário buscado com sucesso:", data?.inventario || []);
    } catch (error) {
      console.error("Erro detalhado ao buscar inventário:", error.response?.data || error.message || error);
    } finally {
      setLoadingInventory(false);
    }
  };

  // Efeito para buscar inventário ao carregar e ouvir atualizações
  useEffect(() => {
    fetchInventory(); // Busca inicial

    const onInventoryUpdate = () => {
        console.log("inventory:updated recebido");
        fetchInventory(); // Rebusca o inventário
    };

    socket.on('inventory:updated', onInventoryUpdate);

    return () => {
      socket.off('inventory:updated', onInventoryUpdate);
    };
  }, []); // Roda apenas uma vez na montagem

  // --- FUNÇÃO PARA USAR POWER-UP ---
  const handleUsePowerUp = (powerUp) => {
    if (!rodadaId || isLocked) {
      alert("Aguarde a rodada estar ativa.");
      return;
    }

    let targetPlayerId = null;
    let confirmUse = true;

    // Lógica específica por power-up antes de emitir
    if (powerUp.code === 'BLUR_OPPONENT_SCREEN_5S') {
        confirmUse = window.confirm(`Usar "${powerUp.nome}" para assustar os oponentes?`);
    } else if (powerUp.code === 'SKIP_OWN_CATEGORY') {
        // A verificação de 'activeSkipPowerUpId' será feita no componente
        confirmUse = window.confirm(`Ativar o power-up "${powerUp.nome}"? Você poderá pular UMA categoria.`);
    } else if (powerUp.code === 'REVEAL_OPPONENT_ANSWER') {
        // A verificação de 'revealPending' será feita no componente
         confirmUse = window.confirm(`Usar "${powerUp.nome}"? A resposta será mostrada no final da rodada.`);
    }

    if (!confirmUse) return;

    // Emitir evento para o backend processar o uso
    socket.emit('powerup:use', {
      powerUpId: powerUp.power_up_id,
      targetPlayerId: targetPlayerId
    });
    console.log(`Comando 'powerup:use' emitido para ${powerUp.code}`);
  };

  return {
    inventario,
    loadingInventory,
    handleUsePowerUp,
    fetchInventory // Exporta para o MatchEndScreen poder rebuscar moedas
  };
}