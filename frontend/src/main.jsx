// frontend/src/main.jsx (Atualizado)
import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'

import App from './App'
import HomeScreen from './pages/Homescreen'
import LobbyScreen from './pages/LobbyScreen'
import GameScreen from './pages/GameScreen'
import ShopScreen from './pages/ShopScreen'
import WaitingRoomScreen from './pages/WaitingRoomScreen'
import Login from './pages/Login'
import './index.css'

function RequireAuth({ children }) {
  const token = localStorage.getItem('token')
  if (!token) return <Navigate to="/login" replace />
  return children
}

const router = createBrowserRouter([
  {
    path: '/login',
    element: <Login />
  },
  {
    path: '/',
    element: <RequireAuth><App /></RequireAuth>,
    children: [
      {
        index: true, // <-- MUDANÇA 1: Index agora é HomeScreen
        element: <HomeScreen />
      },
      {
        path: 'lobby', // <-- MUDANÇA 2: Rota específica para o Lobby
        element: <LobbyScreen />
      },
      {
        path: 'waiting/:salaId',
        element: <WaitingRoomScreen />
      },
      {
        path: 'game/:salaId',
        element: <GameScreen />
      },
      {
        path: 'shop',
        element: <ShopScreen />
      },
    ],
  },
])

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
)