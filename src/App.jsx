import React, { useState, useEffect } from 'react';
import AttendantPanel from './components/AttendantPanel';
import TvPanel from './components/TvPanel';
import DoctorPanel from './components/DoctorPanel';
import ReceptionPanel from './components/ReceptionPanel';
import AdminPanel from './components/AdminPanel';
import ReceptionChatPanel from './components/ReceptionChatPanel';
import AgendaCalendar from './components/AgendaCalendar';
import MedicalRecordForm from './components/MedicalRecordForm';
import FinancialSplitPanel from './components/FinancialSplitPanel';
import LoginModal from './components/LoginModal';
import { verifySession, clearAuthSession, getAuthToken } from './utils/socket';
import { ShieldAlert, ArrowLeft, LogOut, Lock } from 'lucide-react';

function ForbiddenView({ user, requestedPath, onNavigateHome, onLogout }) {
  const roleNameMap = {
    doctor: 'Medico',
    receptionist: 'Recepcionista',
    admin: 'Administrador',
    financial: 'Financeiro'
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
            Modulo Nao Autorizado
          </h1>
          <p className="text-xs text-cmip-100/70 mt-2 leading-relaxed">
            Seu perfil atual de <strong className="text-rose-300">{roleNameMap[user?.role] || user?.role}</strong> nao tem permissao para acessar a rota <code className="bg-cmip-950 px-1.5 py-0.5 rounded text-rose-400 font-mono">{requestedPath}</code>.
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
            <span>Encerrar Sessao / Trocar de Usuario</span>
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

  const isTvRecepcao = path === '/tv-recepcao' || path === '/tv_recepcao' || search.includes('tv=recepcao') || search.includes('channel=recepcao');
  const isTv1 = path === '/tv1' || path === '/tv-medica-1' || path === '/tv-1' || search.includes('tv=1') || search.includes('channel=1') || search.includes('tvid=1');
  const isTv2 = path === '/tv2' || path === '/tv-medica-2' || path === '/tv-2' || search.includes('tv=2') || search.includes('channel=2') || search.includes('tvid=2');
  const isTvGeral = path === '/tv' || path === '/tv-geral' || search.includes('tv=true') || search.includes('tv=all');
  if (isTvRecepcao) return <TvPanel initialTvId="recepcao" />;
  if (isTv1) return <TvPanel initialTvId="1" />;
  if (isTv2) return <TvPanel initialTvId="2" />;
  if (isTvGeral) return <TvPanel initialTvId="all" />;

  // Guarda de Rotas: SE NÃO ESTIVER AUTENTICADO, EXIBE OBRIGATORIAMENTE A TELA DE LOGIN
  if (!currentUser) {
    return <LoginModal onLoginSuccess={handleLoginSuccess} />;
  }

  if (path === '/chat' || path === '/whatsapp' || path === '/atendimento') {
    if (currentUser.role !== 'receptionist' && currentUser.role !== 'admin') {
      return (
        <ForbiddenView
          user={currentUser}
          requestedPath={path}
          onNavigateHome={() => navigateTo(currentUser.role === 'doctor' ? '/medico' : '/admin')}
          onLogout={handleLogout}
        />
      );
    }
    return (
      <ReceptionChatPanel
        user={currentUser}
        onLogout={handleLogout}
        onNavigateAgenda={() => navigateTo('/agenda')}
        onNavigateTv={() => navigateTo('/tv-recepcao')}
      />
    );
  }

  if (path === '/agenda' || path === '/agendamento' || path === '/calendario') {
    return (
      <AgendaCalendar
        user={currentUser}
        onLogout={handleLogout}
        onNavigateChat={() => navigateTo('/chat')}
        onNavigateTv={() => navigateTo('/tv-recepcao')}
      />
    );
  }

  if (path === '/prontuario' || path === '/pep') {
    if (currentUser.role !== 'doctor' && currentUser.role !== 'admin') {
      return (
        <ForbiddenView
          user={currentUser}
          requestedPath={path}
          onNavigateHome={() => navigateTo('/recepcao')}
          onLogout={handleLogout}
        />
      );
    }
    return (
      <MedicalRecordForm
        user={currentUser}
        onLogout={handleLogout}
        onBack={() => navigateTo('/medico')}
      />
    );
  }

  if (path === '/financeiro' || path === '/split' || path === '/dre') {
    if (currentUser.role !== 'financial' && currentUser.role !== 'admin') {
      return (
        <ForbiddenView
          user={currentUser}
          requestedPath={path}
          onNavigateHome={() => navigateTo(currentUser.role === 'doctor' ? '/medico' : '/recepcao')}
          onLogout={handleLogout}
        />
      );
    }
    return (
      <FinancialSplitPanel
        user={currentUser}
        onLogout={handleLogout}
        onBack={() => navigateTo('/admin')}
      />
    );
  }

  if (currentUser.role === 'doctor') {
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

  if (currentUser.role === 'receptionist') {
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

    return (
      <AttendantPanel
        user={currentUser}
        onLogout={handleLogout}
        onNavigateReception={() => navigateTo('/cadastro')}
        onNavigateLogin={() => navigateTo('/login')}
        onNavigateChat={() => navigateTo('/chat')}
        onNavigateAgenda={() => navigateTo('/agenda')}
      />
    );
  }

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
          onNavigateChat={() => navigateTo('/chat')}
          onNavigateAgenda={() => navigateTo('/agenda')}
        />
      );
    }

    return (
      <AdminPanel
        user={currentUser}
        onLogout={handleLogout}
        onNavigateTv={() => navigateTo('/tv')}
        onNavigateChat={() => navigateTo('/chat')}
        onNavigateAgenda={() => navigateTo('/agenda')}
        onNavigateFinancial={() => navigateTo('/financeiro')}
      />
    );
  }

  return <LoginModal onLoginSuccess={handleLoginSuccess} />;
}