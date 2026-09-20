import React, { useState } from 'react';
import {
  MessageSquare,
  Calendar,
  Ticket,
  UserPlus,
  Stethoscope,
  DollarSign,
  Tv,
  LogOut,
  ChevronDown,
  ExternalLink,
  Shield,
  User,
  Building2
} from 'lucide-react';

export default function NavigationHeader({ user, activeModule, onLogout }) {
  const [showTvMenu, setShowTvMenu] = useState(false);

  const navigate = (path) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const openTv = (path) => {
    window.open(path, '_blank');
    setShowTvMenu(false);
  };

  const role = user?.role || 'receptionist';
  const isAdmin = role === 'admin';
  const isReception = role === 'receptionist' || isAdmin;
  const isDoctor = role === 'doctor' || isAdmin;
  const isFinancial = role === 'financial' || isAdmin;

  return (
    <header className="bg-cmip-900/95 border-b border-cmip-800/80 px-4 md:px-6 py-3 flex flex-wrap items-center justify-between gap-4 backdrop-blur-md sticky top-0 z-30 shadow-xl font-['Montserrat',sans-serif]">
      <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate(isAdmin ? '/admin' : isDoctor ? '/medico' : '/recepcao')}>
        <div className="bg-white px-2.5 py-1.5 rounded-xl shadow-md border border-cmip-100 flex items-center justify-center max-w-[140px]">
          <img src="/logo.png" alt="CMIP Logo" className="h-7 object-contain" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-black tracking-tight text-white uppercase">CMIP <span className="text-cyan-400">CLINIC ERP</span></span>
            <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">v2.0</span>
          </div>
          <p className="text-[10px] text-cmip-100/60 font-medium">Ecossistema Medico Integrado</p>
        </div>
      </div>

      <nav className="flex items-center gap-1.5 bg-cmip-950/80 p-1.5 rounded-2xl border border-cmip-800/80 text-xs font-bold">
        {isReception && (
          <button
            onClick={() => navigate('/chat')}
            className={`px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all ${
              activeModule === 'chat' ? 'bg-emerald-600 text-white shadow-lg' : 'text-cmip-100/70 hover:bg-cmip-800 hover:text-white'
            }`}
            title="Central de Atendimento WhatsApp Live"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>WhatsApp</span>
          </button>
        )}

        {(isReception || isDoctor) && (
          <button
            onClick={() => navigate('/agenda')}
            className={`px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all ${
              activeModule === 'agenda' ? 'bg-cyan-600 text-white shadow-lg' : 'text-cmip-100/70 hover:bg-cmip-800 hover:text-white'
            }`}
            title="Grade de Agendamentos & Check-in"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Agenda</span>
          </button>
        )}

        {isReception && (
          <button
            onClick={() => navigate('/recepcao')}
            className={`px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all ${
              activeModule === 'senhas' || activeModule === 'recepcao' ? 'bg-cmip-600 text-white shadow-lg' : 'text-cmip-100/70 hover:bg-cmip-800 hover:text-white'
            }`}
            title="Painel de Atendimento de Senhas e Guiches"
          >
            <Ticket className="w-3.5 h-3.5" />
            <span>Senhas</span>
          </button>
        )}

        {isDoctor && (
          <button
            onClick={() => navigate('/medico')}
            className={`px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all ${
              activeModule === 'medico' ? 'bg-purple-600 text-white shadow-lg' : 'text-cmip-100/70 hover:bg-cmip-800 hover:text-white'
            }`}
            title="Painel do Medico & Fila de Consultorio"
          >
            <Stethoscope className="w-3.5 h-3.5" />
            <span>Consultorio</span>
          </button>
        )}

        {isFinancial && (
          <button
            onClick={() => navigate('/financeiro')}
            className={`px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all ${
              activeModule === 'financeiro' ? 'bg-amber-600 text-white shadow-lg' : 'text-cmip-100/70 hover:bg-cmip-800 hover:text-white'
            }`}
            title="Gestao Financeira & Split de Repasses"
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>Split & DRE</span>
          </button>
        )}

        {isAdmin && (
          <button
            onClick={() => navigate('/admin')}
            className={`px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all ${
              activeModule === 'admin' ? 'bg-cmip-500 text-cmip-950 shadow-lg font-black' : 'text-cmip-100/70 hover:bg-cmip-800 hover:text-white'
            }`}
            title="Administracao Geral"
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Admin</span>
          </button>
        )}
      </nav>

      <div className="flex items-center gap-2.5 relative">
        <div className="relative">
          <button
            onClick={() => setShowTvMenu(!showTvMenu)}
            className="px-3 py-2 bg-cmip-950 hover:bg-cmip-800 text-emerald-300 border border-emerald-600/40 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-md"
          >
            <Tv className="w-3.5 h-3.5 text-emerald-400" />
            <span>3 TVs</span>
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>

          {showTvMenu && (
            <div className="absolute right-0 top-12 w-64 bg-cmip-900 border border-cmip-700 rounded-2xl p-2 shadow-2xl z-50 animate-fade-in space-y-1">
              <div className="px-3 py-1.5 text-[10px] font-black text-cmip-200 uppercase tracking-wider border-b border-cmip-800">
                Canais de TV CMIP
              </div>
              <button
                onClick={() => openTv('/tv-recepcao')}
                className="w-full p-2 rounded-xl text-left hover:bg-cmip-800 flex items-center justify-between text-xs text-white transition-colors"
              >
                <span>📺 TV Recepcao (Guiches)</span>
                <ExternalLink className="w-3 h-3 opacity-50" />
              </button>
              <button
                onClick={() => openTv('/tv1')}
                className="w-full p-2 rounded-xl text-left hover:bg-cmip-800 flex items-center justify-between text-xs text-cyan-300 transition-colors"
              >
                <span>📺 TV 01 (Terreo / Ala A)</span>
                <ExternalLink className="w-3 h-3 opacity-50" />
              </button>
              <button
                onClick={() => openTv('/tv2')}
                className="w-full p-2 rounded-xl text-left hover:bg-cmip-800 flex items-center justify-between text-xs text-purple-300 transition-colors"
              >
                <span>📺 TV 02 (1º Andar / Ala B)</span>
                <ExternalLink className="w-3 h-3 opacity-50" />
              </button>
            </div>
          )}
        </div>

        {user && (
          <div className="px-3 py-1.5 bg-cmip-950 rounded-xl border border-cmip-700/60 text-xs font-bold text-cmip-100 hidden sm:flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>{user.name || user.username}</span>
          </div>
        )}

        <button
          onClick={onLogout}
          className="px-3 py-2 bg-rose-950/80 hover:bg-rose-900 text-rose-300 font-bold text-xs rounded-xl border border-rose-800/40 flex items-center gap-1.5 transition-colors shadow"
          title="Encerrar Sessao"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Sair</span>
        </button>
      </div>
    </header>
  );
}