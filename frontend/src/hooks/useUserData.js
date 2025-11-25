// frontend/src/hooks/useUserData.js
import { useState, useEffect } from 'react';
import api from '../lib/api';

export function useUserData() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      setLoading(true);
      try {
        const { data } = await api.get('/auth/me');
        setUser(data.jogador);
      } catch (error) {
        console.error('Erro ao buscar dados do usuário:', error);
        setUser(null); // Clear user on error
      } finally {
        setLoading(false);
      }
    };

    if (localStorage.getItem('token')) {
      fetchUser();
    } else {
      setLoading(false);
      setUser(null);
    }

    const handleUserUpdate = (event) => {
      if (event.detail) {
        setUser(event.detail);
      }
    };

    window.addEventListener('userUpdated', handleUserUpdate);

    return () => {
      window.removeEventListener('userUpdated', handleUserUpdate);
    };
  }, []);

  return { user, loading };
}
