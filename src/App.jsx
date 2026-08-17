import React, { useState, useEffect } from 'react';
import AttendantPanel from './components/AttendantPanel';
import TvPanel from './components/TvPanel';
import TotemTablet from './components/TotemTablet';
import DoctorPanel from './components/DoctorPanel';
import ReceptionPanel from './components/ReceptionPanel';
import AdminPanel from './components/AdminPanel';
import LoginModal from './components/LoginModal';
import { verifySession, clearAuthSession, getAuthToken } from './utils/socket';
import { ShieldAlert, ArrowLeft, LogOut, Lock } from 'lucide-react';

function ForbiddenView({ user, requestedPath, onNavigateHome, onLogout }) {
  const roleNameMap = {
    doctor: 'Médico',
    receptionist: 'Recepcionista',
    admin: 'Administrador'
  };

  return (
    <div className="min-h-screen bg-cmip-950 text-slate-100 flex items-center justify-center p-4 font-['Montserrat',sans-serif] cmip-plus-pattern relative">
      <div className="max-w-md w-full bg-cmip-900/90 border border-rose-600/40 p-8 rounded-3xl shadow-2xl backdrop-blur-xl text-center space-y-6 relative z-10 animate-fade-in">
        <div className="w-16 h-16 bg-rose-500/20 text-rose-400 rounded-3xl mx-auto flex items-center justify-center border border-rose-500/30 shadow-lg">
          <ShieldAlert className="w-9 h-9" />
        </div>

        <div>
          <span className="px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-black uppercase tracking-wider">
            Erro 403 - Acesso Proibido
          </span>
          <h1 className="text-xl md:text-2xl font-black text-white uppercase tracking-tight mt-3">
            Módulo Não Autorizado
          </h1>
          <p className="text-xs text-cmip-100/70 mt-2 leading-relaxed">
            Seu perfil atual de <strong className="text-rose-300">{roleNameMap[user?.role] || user?.role}</strong> não tem permissão para acessar a rota <code className="bg-cmip-950 px-1.5 py-0.5 rounded text-rose-400 font-mono">{requestedPath}</code>.
          </p>
        </div>

        <div className="pt-2 flex flex-col gap-2.5">
          <button
            onClick={onNavigateHome}
            className="w-full py-3 bg-gradient-to-r from-cmip-500 to-cmip-600 hover:from-cmip-400 hover:to-cmip-500 text-cmip-950 font-black rounded-xl text-xs shadow-lg flex items-center justify-center gap-2 transition-transform active:scale-95"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar ao Meu Painel Autorizado</span>
          </button>

          <button
            onClick={onLogout}
            className="w-full py-2.5 bg-cmip-950 hover:bg-rose-950/80 text-rose-300 hover:text-rose-200 border border-cmip-600/40 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Encerrar Sessão / Trocar de Usuário</span>
          </button>
        </div>
      </div>
    </div>
  );
}

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

  // Validação de Sessão Viva contra o Backend
  useEffect(() => {
    const token = getAuthToken();
    if (token && currentUser) {
      verifySession().then(res => {
        if (!res?.success) {
          handleLogout();
        }
      }).catch(() => {});
    }
  }, []);

  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
    try {
      localStorage.setItem('cmip_user', JSON.stringify(user));
    } catch {}
  };

  const handleLogout = () => {
    setCurrentUser(null);
    clearAuthSession();
    navigateTo('/login');
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

  // 6. Guarda de Rotas: SE NÃO ESTIVER AUTENTICADO, EXIBE OBRIGATORIAMENTE A TELA DE LOGIN
  if (!currentUser) {
    return <LoginModal onLoginSuccess={handleLoginSuccess} />;
  }

  // 7. Controle de Acesso Baseado em Papéis (RBAC) para Usuários Autenticados
  // ------------------------------------------------------------------------

  // A) PERFIL MÉDICO (doctor): Acesso exclusivo ao seu consultório e fila
  if (currentUser.role === 'doctor') {
    // Se tentar acessar /admin ou /recepcao, bloqueia com 403
    if (path === '/admin' || path === '/recepcao' || path === '/cadastro' || path === '/atendente') {
      return (
        <ForbiddenView 
          user={currentUser}
          requestedPath={path}
          onNavigateHome={() => navigateTo('/medico')}
          onLogout={handleLogout}
        />
      );
    }

    return (
      <DoctorPanel 
        user={currentUser} 
        onLogout={handleLogout} 
        onNavigateTv={() => navigateTo('/tv1')} 
      />
    );
  }

  // B) PERFIL RECEPCIONISTA (receptionist): Acesso ao Atendimento de Senhas e Cadastro de Pacientes
  if (currentUser.role === 'receptionist') {
    // Se tentar acessar /admin ou /medico, bloqueia com 403
    if (path === '/admin' || path === '/medico' || path === '/doctor') {
      return (
        <ForbiddenView 
          user={currentUser}
          requestedPath={path}
          onNavigateHome={() => navigateTo('/recepcao')}
          onLogout={handleLogout}
        />
      );
    }

    // Se estiver explicitamente na página completa de cadastro
    if (path === '/cadastro') {
      return (
        <ReceptionPanel 
          user={currentUser} 
          onLogout={handleLogout} 
          onNavigateTv={() => navigateTo('/tv-recepcao')}
          onNavigateAttendant={() => navigateTo('/recepcao')}
        />
      );
    }

    // Padrão do Recepcionista: Painel de Atendimento de Senhas (com Botão e Modal de Cadastro de Pacientes)
    return (
      <AttendantPanel 
        user={currentUser}
        onLogout={handleLogout}
        onNavigateReception={() => navigateTo('/cadastro')}
        onNavigateLogin={() => navigateTo('/login')}
      />
    );
  }

  // C) PERFIL ADMINISTRADOR (admin): Acesso irrestrito a todas as áreas
  if (currentUser.role === 'admin') {
    if (path === '/cadastro') {
      return (
        <ReceptionPanel 
          user={currentUser} 
          onLogout={handleLogout} 
          onNavigateTv={() => navigateTo('/tv-recepcao')}
          onNavigateAdmin={() => navigateTo('/admin')}
          onNavigateAttendant={() => navigateTo('/recepcao')}
        />
      );
    }

    if (path === '/medico' || path === '/doctor') {
      return (
        <DoctorPanel 
          user={currentUser} 
          onLogout={handleLogout} 
          onNavigateTv={() => navigateTo('/tv1')} 
        />
      );
    }

    if (path === '/recepcao' || path === '/atendente' || path === '/guiche' || path === '/senhas') {
      return (
        <AttendantPanel 
          user={currentUser}
          onLogout={handleLogout}
          onNavigateReception={() => navigateTo('/cadastro')}
          onNavigateAdmin={() => navigateTo('/admin')}
        />
      );
    }

    // Padrão do Admin: Painel Administrativo Geral
    return (
      <AdminPanel 
        user={currentUser} 
        onLogout={handleLogout} 
        onNavigateTv={() => navigateTo('/tv')} 
      />
    );
  }

  // Fallback de segurança: se role não for reconhecido, força login
  return <LoginModal onLoginSuccess={handleLoginSuccess} />;
}

