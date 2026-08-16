import React, { useState, useEffect } from 'react';
import AttendantPanel from './components/AttendantPanel';
import TvPanel from './components/TvPanel';
import TotemTablet from './components/TotemTablet';
import DoctorPanel from './components/DoctorPanel';
import ReceptionPanel from './components/ReceptionPanel';
import AdminPanel from './components/AdminPanel';
import LoginModal from './components/LoginModal';

export default function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('cmip_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const handlePopState = () => setCurrentPath(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
    try {
      localStorage.setItem('cmip_user', JSON.stringify(user));
    } catch {}
  };

  const handleLogout = () => {
    setCurrentUser(null);
    try {
      localStorage.removeItem('cmip_user');
    } catch {}
  };

  const navigateTo = (newPath) => {
    window.history.pushState({}, '', newPath);
    setCurrentPath(newPath);
  };

  const path = currentPath.toLowerCase();
  const search = typeof window !== 'undefined' ? window.location.search.toLowerCase() : '';

  // 1. Rota: TV DA RECEPÇÃO (Apenas Senhas / Guichês)
  const isTvRecepcao = path === '/tv-recepcao' || path === '/tv_recepcao' || search.includes('tv=recepcao') || search.includes('channel=recepcao');

  // 2. Rota: TV CONSULTÓRIOS 01 (Térreo / Ala A)
  const isTv1 = path === '/tv1' || path === '/tv-medica-1' || path === '/tv-1' || search.includes('tv=1') || search.includes('channel=1') || search.includes('tvid=1');

  // 3. Rota: TV CONSULTÓRIOS 02 (1º Andar / Ala B)
  const isTv2 = path === '/tv2' || path === '/tv-medica-2' || path === '/tv-2' || search.includes('tv=2') || search.includes('channel=2') || search.includes('tvid=2');

  // 4. Rota: TV GERAL
  const isTvGeral = path === '/tv' || path === '/tv-geral' || search.includes('tv=true') || search.includes('tv=all');

  // 5. Visão do Totem (Tablet de Autoatendimento da Recepção)
  const isTotemView = path === '/tablet' || path === '/totem' || search.includes('tablet=true') || search.includes('totem=true');

  if (isTvRecepcao) {
    return <TvPanel initialTvId="recepcao" />;
  }

  if (isTv1) {
    return <TvPanel initialTvId="1" />;
  }

  if (isTv2) {
    return <TvPanel initialTvId="2" />;
  }

  if (isTvGeral) {
    return <TvPanel initialTvId="all" />;
  }

  if (isTotemView) {
    return <TotemTablet />;
  }

  // 6. Rota Explícita de Login
  if (path === '/login') {
    return <LoginModal onLoginSuccess={handleLoginSuccess} />;
  }

  // 7. Rotas com Usuário Autenticado
  if (currentUser) {
    if (currentUser.role === 'doctor') {
      return (
        <DoctorPanel 
          user={currentUser} 
          onLogout={handleLogout} 
          onNavigateTv={() => navigateTo('/tv1')} 
        />
      );
    }

    if (currentUser.role === 'admin') {
      return (
        <AdminPanel 
          user={currentUser} 
          onLogout={handleLogout} 
          onNavigateTv={() => navigateTo('/tv')} 
        />
      );
    }

    if (currentUser.role === 'receptionist') {
      return (
        <ReceptionPanel 
          user={currentUser} 
          onLogout={handleLogout} 
          onNavigateTv={() => navigateTo('/tv-recepcao')} 
        />
      );
    }
  }

  // 8. Rotas Diretas por URL (se não estiver logado, exibe tela de login)
  if (path === '/medico' || path === '/doctor') {
    return currentUser?.role === 'doctor' ? (
      <DoctorPanel 
        user={currentUser} 
        onLogout={handleLogout} 
        onNavigateTv={() => navigateTo('/tv1')} 
      />
    ) : (
      <LoginModal onLoginSuccess={handleLoginSuccess} />
    );
  }

  if (path === '/recepcao' || path === '/cadastro') {
    return currentUser?.role === 'receptionist' ? (
      <ReceptionPanel 
        user={currentUser} 
        onLogout={handleLogout} 
        onNavigateTv={() => navigateTo('/tv-recepcao')} 
      />
    ) : (
      <LoginModal onLoginSuccess={handleLoginSuccess} />
    );
  }

  if (path === '/admin') {
    return currentUser?.role === 'admin' ? (
      <AdminPanel 
        user={currentUser} 
        onLogout={handleLogout} 
        onNavigateTv={() => navigateTo('/tv')} 
      />
    ) : (
      <LoginModal onLoginSuccess={handleLoginSuccess} />
    );
  }

  // 9. Padrão: Painel Tradicional do Atendente de Guichê
  return (
    <AttendantPanel 
      onNavigateLogin={() => navigateTo('/login')} 
      onNavigateReception={() => navigateTo('/recepcao')}
      onNavigateDoctor={() => navigateTo('/medico')}
      onNavigateAdmin={() => navigateTo('/admin')}
    />
  );
}

