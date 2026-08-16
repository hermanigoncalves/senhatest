import React, { useState, useEffect } from 'react';
import { 
  socket, fetchVercelState, setInitialTicketVercel, callNextVercel, 
  callCustomVercel, repeatCallVercel, resetQueueVercel, callWaitingTicketVercel 
} from '../utils/socket';
import { 
  Play, RotateCcw, Hash, Users, Trash2, ShieldAlert, Plus, SlidersHorizontal, 
  Check, Tv, Tablet, Star, Bell, Clock, AlertCircle, ArrowRight, LogIn, Stethoscope, LogOut
} from 'lucide-react';

export default function AttendantPanel({ 
  user,
  onLogout,
  onNavigateLogin, 
  onNavigateReception, 
  onNavigateDoctor, 
  onNavigateAdmin 
}) {
  const [queueState, setQueueState] = useState({
    counter: 0,
    currentTicket: null,
    history: [],
    waitingQueue: [],
    desks: ['Guichê 01', 'Guichê 02', 'Guichê 03', 'Guichê 04', 'Recepção CMIP']
  });

  // Lembra e persiste o Guichê deste computador no localStorage
  const [selectedDesk, setSelectedDesk] = useState(() => {
    try {
      return localStorage.getItem('cmip_attendant_desk') || 'Guichê 01';
    } catch {
      return 'Guichê 01';
    }
  });

  const handleDeskChange = (newDesk) => {
    setSelectedDesk(newDesk);
    try {
      localStorage.setItem('cmip_attendant_desk', newDesk);
    } catch {}
  };

  const [customNumber, setCustomNumber] = useState('');
  const [initialNumber, setInitialNumber] = useState('');
  const [initialSaved, setInitialSaved] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [isCalling, setIsCalling] = useState(false);

  const updateState = (state) => {
    if (state) setQueueState(state);
  };

  useEffect(() => {
    fetch('/api/info')
      .then(res => res.json())
      .then(data => {
        if (data?.state) updateState(data.state);
      })
      .catch(() => {});

    function onStateUpdate(state) {
      updateState(state);
    }

    socket.on('state-update', onStateUpdate);
    if (socket.connected) socket.emit('get-state');

    // Polling inteligente e aliviado a cada 2s
    const interval = setInterval(async () => {
      const state = await fetchVercelState();
      if (state) {
        if (state.state) updateState(state.state);
        else if (state.currentTicket || state.counter !== undefined || state.waitingQueue) updateState(state);
      }
    }, 2000);

    return () => {
      socket.off('state-update', onStateUpdate);
      clearInterval(interval);
    };
  }, []);

  const handleSetInitialNumber = async (e) => {
    e.preventDefault();
    const num = parseInt(initialNumber, 10);
    if (isNaN(num) || num < 1 || num > 9999) return;

    const res = await setInitialTicketVercel(num);
    if (res?.state) updateState(res.state);
    if (socket.connected) socket.emit('set-initial-ticket', { number: num, initialNumber: num });

    setInitialSaved(true);
    setTimeout(() => setInitialSaved(false), 2500);
    setInitialNumber('');
  };

  // Chama a próxima senha (grava atomicamente no Supabase e emite broadcast)
  const handleCallNext = async () => {
    if (isCalling) return;
    setIsCalling(true);

    try {
      const res = await callNextVercel(selectedDesk);
      if (res?.state) updateState(res.state);
      if (socket.connected) socket.emit('call-next', { desk: selectedDesk });
    } finally {
      setTimeout(() => setIsCalling(false), 1000);
    }
  };

  // Chama uma senha específica da fila de espera do Totem
  const handleCallWaitingTicket = async (ticket) => {
    if (isCalling || !ticket) return;
    setIsCalling(true);

    try {
      const res = await callWaitingTicketVercel(ticket.id, selectedDesk);
      if (res?.state) updateState(res.state);
      if (socket.connected) socket.emit('call-waiting-ticket', { ticketId: ticket.id, desk: selectedDesk });
    } finally {
      setTimeout(() => setIsCalling(false), 1000);
    }
  };

  const handleRepeatCall = async () => {
    if (!queueState.currentTicket || isCalling) return;
    setIsCalling(true);

    try {
      const res = await repeatCallVercel(queueState.currentTicket, selectedDesk);
      if (res?.state) updateState(res.state);
      if (socket.connected) socket.emit('repeat-call', { desk: selectedDesk });
    } finally {
      setTimeout(() => setIsCalling(false), 1000);
    }
  };

  const handleCallCustom = async (e) => {
    e?.preventDefault();
    if (!customNumber.trim() || isCalling) return;
    setIsCalling(true);

    try {
      const res = await callCustomVercel(customNumber.trim(), selectedDesk);
      if (res?.state) updateState(res.state);
      if (socket.connected) socket.emit('call-custom', { number: customNumber.trim(), desk: selectedDesk });
      setCustomNumber('');
    } finally {
      setTimeout(() => setIsCalling(false), 1000);
    }
  };

  const handleResetQueue = async () => {
    updateState({ counter: 0, currentTicket: null, history: [], waitingQueue: [], desks: queueState.desks });
    const res = await resetQueueVercel();
    if (res?.state) updateState(res.state);
    if (socket.connected) socket.emit('reset-queue');
    setShowResetModal(false);
  };

  const waitingList = queueState.waitingQueue || [];
  const normalWaiting = waitingList.filter(t => t.type !== 'Preferencial');
  const prefWaiting = waitingList.filter(t => t.type === 'Preferencial');
  const nextTicketFromQueue = prefWaiting.length > 0 ? prefWaiting[0] : (waitingList.length > 0 ? waitingList[0] : null);

  const nextNumberToCall = nextTicketFromQueue 
    ? nextTicketFromQueue.number 
    : (queueState.counter >= 1000 ? 1 : queueState.counter + 1);

  return (
    <div className="min-h-screen bg-cmip-950 text-slate-100 font-['Montserrat',sans-serif] p-4 md:p-8 cmip-plus-pattern relative">
      
      {/* PADRÃO DE CRUZES DECORATIVAS CMIP */}
      <div className="absolute top-6 left-6 grid grid-cols-4 gap-2 opacity-20 pointer-events-none">
        {[...Array(12)].map((_, i) => (
          <Plus key={i} className="w-5 h-5 text-cmip-400" />
        ))}
      </div>

      <div className="max-w-7xl mx-auto space-y-8 relative z-10">
        
        {/* CABEÇALHO CMIP COM ATALHOS */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 p-6 bg-cmip-900/90 border border-cmip-600/30 rounded-3xl shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-5">
            <div className="bg-white p-3 rounded-2xl shadow-lg border border-cmip-100 max-w-[200px]">
              <img src="/logo.png" alt="CMIP Logo" className="h-12 object-contain" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black tracking-tight text-white uppercase flex items-center gap-2">
                <span className="text-cmip-400">CMIP</span> Atendimento de Senhas
              </h1>
              <p className="text-xs text-cmip-100 font-semibold tracking-wider uppercase">Centro Médico Integrado Piratininga</p>
            </div>
          </div>

          {/* ATALHOS RÁPIDOS (TOTEM, TV, RECEPÇÃO E LOGOUT) */}
          <div className="flex flex-wrap items-center gap-3">
            {onNavigateReception && (
              <button
                onClick={onNavigateReception}
                className="px-4 py-2.5 bg-emerald-950 hover:bg-emerald-900 text-emerald-300 font-bold text-xs rounded-xl border border-emerald-600/40 flex items-center gap-2 transition-colors shadow-md"
                title="Ir para o Cadastro de Pacientes"
              >
                <Users className="w-4 h-4 text-emerald-400" />
                <span>Cadastro de Pacientes</span>
              </button>
            )}

            <a
              href="/tablet"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2.5 bg-gradient-to-r from-cmip-500 to-cmip-600 hover:from-cmip-400 hover:to-cmip-500 text-cmip-950 font-black text-xs rounded-xl shadow-lg flex items-center gap-2 transition-transform active:scale-95"
            >
              <Tablet className="w-4 h-4" />
              <span>Totem (Tablet)</span>
            </a>

            <a
              href="/tv"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2.5 bg-cmip-950 hover:bg-cmip-800 text-cmip-400 font-bold text-xs rounded-xl border border-cmip-600/40 flex items-center gap-2 transition-colors shadow-md"
            >
              <Tv className="w-4 h-4" />
              <span>Painel de TV</span>
            </a>

            {user && (
              <div className="px-3.5 py-2 bg-cmip-950 rounded-xl border border-cmip-600/30 text-xs font-bold text-cmip-100 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>{user.name || user.username}</span>
              </div>
            )}

            {onLogout && (
              <button
                onClick={onLogout}
                className="px-3.5 py-2 bg-rose-950/80 hover:bg-rose-900 text-rose-300 font-bold text-xs rounded-xl border border-rose-800/40 flex items-center gap-1.5 transition-colors shadow"
                title="Encerrar Sessão"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sair</span>
              </button>
            )}
          </div>
        </header>

        {/* SEÇÃO DA FILA DO TOTEM (AGUARDANDO ATENDIMENTO) */}
        <div className="p-6 bg-cmip-900/80 border border-cmip-600/40 rounded-3xl glass-panel space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-cmip-600/30 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-500/20 text-amber-300 rounded-xl">
                <Tablet className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2">
                  Fila de Espera do Totem (Aguardando Chamada)
                </h2>
                <p className="text-xs text-cmip-100/70">
                  Senhas retiradas no tablet. Só aparecem na TV após você clicar em "Chamar".
                </p>
              </div>
            </div>

            {/* Badges com contagem */}
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-amber-400 text-slate-950 text-xs font-black rounded-lg shadow flex items-center gap-1">
                <Star className="w-3.5 h-3.5 fill-current" />
                {prefWaiting.length} Preferenciais
              </span>

              <span className="px-3 py-1 bg-cmip-800 text-cmip-300 border border-cmip-500/30 text-xs font-black rounded-lg shadow flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                {normalWaiting.length} Normais
              </span>
            </div>
          </div>

          {/* LISTA DE SENHAS AGUARDANDO */}
          {waitingList.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {waitingList.map((ticket, idx) => {
                const isPref = ticket.type === 'Preferencial';
                return (
                  <div
                    key={ticket.id || idx}
                    className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-2 shadow-md ${
                      isPref 
                        ? 'bg-amber-950/60 border-amber-500/50 hover:border-amber-400' 
                        : 'bg-cmip-950/90 border-cmip-600/40 hover:border-cmip-500/60'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-black text-white">{ticket.number}</span>
                        {isPref ? (
                          <span className="px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 text-[9px] font-black uppercase">
                            Pref
                          </span>
                        ) : null}
                      </div>
                      <div className="text-[11px] text-cmip-100/60 font-semibold flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3" />
                        <span>{ticket.timestamp || 'Hoje'}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleCallWaitingTicket(ticket)}
                      disabled={isCalling}
                      className="px-3 py-2 bg-gradient-to-r from-cmip-500 to-cmip-600 hover:from-cmip-400 hover:to-cmip-500 text-cmip-950 font-black text-xs rounded-xl shadow transition-transform active:scale-95 flex items-center gap-1"
                    >
                      <Bell className="w-3.5 h-3.5" />
                      <span>Chamar</span>
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-4 text-center text-cmip-100/50 text-xs font-semibold flex items-center justify-center gap-2">
              <Check className="w-4 h-4 text-emerald-400" />
              <span>Nenhuma senha aguardando na fila do Totem no momento.</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* CONTROLE DO ATENDENTE */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* SELEÇÃO DE GUICHÊ & CAMPO SENHA INICIAL */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Seleção de Guichê */}
              <div className="p-6 bg-cmip-900/70 border border-cmip-600/30 rounded-3xl glass-panel space-y-3">
                <h2 className="text-sm font-bold text-cmip-100 uppercase tracking-wider flex items-center gap-2">
                  <Users className="w-4 h-4 text-cmip-400" />
                  Guichê / Local
                </h2>
                <select 
                  value={selectedDesk}
                  onChange={(e) => handleDeskChange(e.target.value)}
                  className="w-full bg-cmip-950 border border-cmip-500/50 text-white rounded-xl px-4 py-3 font-bold text-sm focus:outline-none focus:border-cmip-400"
                >
                  {(queueState.desks || ['Guichê 01', 'Guichê 02', 'Guichê 03', 'Guichê 04', 'Recepção CMIP']).map(desk => (
                    <option key={desk} value={desk}>{desk}</option>
                  ))}
                </select>
              </div>

              {/* DEFINIR SENHA INICIAL DA FILA */}
              <div className="p-6 bg-cmip-900/70 border border-cmip-600/30 rounded-3xl glass-panel space-y-3">
                <h2 className="text-sm font-bold text-cmip-100 uppercase tracking-wider flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-cmip-400" />
                  Definir Senha Inicial
                </h2>
                <form onSubmit={handleSetInitialNumber} className="flex gap-2">
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    placeholder="Ex: 50 ou 100"
                    value={initialNumber}
                    onChange={(e) => setInitialNumber(e.target.value)}
                    className="flex-1 bg-cmip-950 border border-cmip-500/50 text-white rounded-xl px-3.5 py-2.5 font-bold text-sm focus:outline-none focus:border-cmip-400 placeholder:text-cmip-100/40"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2.5 bg-cmip-500 hover:bg-cmip-400 text-cmip-950 font-black text-xs rounded-xl shadow-md transition-colors shrink-0 flex items-center gap-1.5"
                  >
                    {initialSaved ? <Check className="w-4 h-4" /> : null}
                    <span>{initialSaved ? 'Definido!' : 'Definir'}</span>
                  </button>
                </form>
              </div>

            </div>

            {/* BOTÃO PRINCIPAL CHAMAR PRÓXIMA */}
            <div className="p-8 bg-gradient-to-br from-cmip-800/80 via-cmip-900/90 to-cmip-950 border border-cmip-500/40 rounded-3xl glass-panel text-center space-y-6 relative overflow-hidden">
              
              <div className="absolute -bottom-10 -right-10 w-48 h-48 bg-cmip-500/10 rounded-full blur-2xl pointer-events-none" />

              <div>
                <span className="text-xs font-bold tracking-widest text-cmip-400 uppercase">
                  Próxima Senha a Ser Chamada: <strong className="text-white text-sm bg-cmip-950 px-3 py-1 rounded-lg border border-cmip-500/30">
                    {typeof nextNumberToCall === 'string' ? nextNumberToCall : String(nextNumberToCall).padStart(4, '0')}
                  </strong>
                </span>
                <h3 className="text-3xl font-black text-white mt-3">Chamar Próximo Paciente</h3>
                <p className="text-xs text-cmip-100/80 mt-1">
                  {nextTicketFromQueue 
                    ? `Chamando próximo da fila (${nextTicketFromQueue.type}) para o ${selectedDesk}` 
                    : 'Avança a sequência tradicional de atendimento'}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 relative z-10">
                <button
                  onClick={handleCallNext}
                  disabled={isCalling}
                  className="w-full sm:w-auto px-10 py-5 bg-gradient-to-r from-cmip-500 to-cmip-600 hover:from-cmip-400 hover:to-cmip-500 text-cmip-950 rounded-2xl font-black text-xl shadow-xl shadow-cmip-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  <Play className="w-7 h-7 fill-cmip-950" />
                  <span>{isCalling ? 'CHAMANDO NA TV...' : 'CHAMAR PRÓXIMA'}</span>
                </button>

                <button
                  onClick={handleRepeatCall}
                  disabled={!queueState.currentTicket || isCalling}
                  className="w-full sm:w-auto px-6 py-5 bg-cmip-red hover:bg-cmip-red-hover disabled:opacity-40 disabled:hover:bg-cmip-red text-white rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-all shadow-lg"
                >
                  <RotateCcw className="w-5 h-5" />
                  <span>RECHAMAR</span>
                </button>
              </div>
            </div>

            {/* CHAMAR ESPECÍFICA */}
            <div className="p-6 bg-cmip-900/70 border border-cmip-600/30 rounded-3xl glass-panel">
              <h3 className="text-sm font-bold text-cmip-100 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Hash className="w-4 h-4 text-cmip-400" />
                Chamar Número Específico (Ex: 0045 ou N010)
              </h3>

              <form onSubmit={handleCallCustom} className="flex gap-3">
                <input
                  type="text"
                  placeholder="Ex: 45, N001 ou P005"
                  value={customNumber}
                  onChange={(e) => setCustomNumber(e.target.value)}
                  className="flex-1 bg-cmip-950 border border-cmip-500/40 text-white rounded-xl px-4 py-3 font-semibold focus:outline-none focus:border-cmip-400 placeholder:text-cmip-100/40"
                />
                <button
                  type="submit"
                  disabled={isCalling}
                  className="px-6 py-3 bg-cmip-700 hover:bg-cmip-600 text-white font-bold rounded-xl border border-cmip-500/30 transition-colors disabled:opacity-50"
                >
                  Chamar
                </button>
              </form>
            </div>

          </div>

          {/* PAINEL DIREITO */}
          <div className="lg:col-span-5 space-y-6">
            <div className="p-6 bg-cmip-900/80 border border-cmip-600/40 rounded-3xl glass-panel flex flex-col justify-between items-center text-center">
              <span className="text-xs font-bold text-cmip-400 uppercase tracking-widest">Senha Exibida na TV</span>
              
              <div className="my-6">
                <div className="text-6xl font-black text-white tracking-tight drop-shadow-[0_4px_20px_rgba(74,222,128,0.4)]">
                  {queueState.currentTicket ? (queueState.currentTicket.patientName || queueState.currentTicket.number) : '---'}
                </div>
                <div className="text-lg font-bold text-amber-300 mt-2">
                  {queueState.currentTicket ? (queueState.currentTicket.officeName || queueState.currentTicket.desk) : 'Aguardando...'}
                </div>
              </div>

              <div className="w-full pt-4 border-t border-cmip-600/30 flex items-center justify-between text-xs text-cmip-100/70">
                <span>Contador atual: <strong>{queueState.counter} / 1000</strong></span>
                <button
                  onClick={() => setShowResetModal(true)}
                  className="text-rose-400 hover:text-rose-300 font-bold flex items-center gap-1 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Zerar Fila</span>
                </button>
              </div>
            </div>

            <div className="p-6 bg-cmip-900/60 border border-cmip-600/30 rounded-3xl glass-panel">
              <h3 className="text-sm font-bold text-cmip-100 uppercase tracking-wider mb-4">
                Histórico Recente na TV
              </h3>

              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                {(queueState.history || []).map((item, idx) => (
                  <div key={item.id || idx} className="p-3.5 rounded-xl bg-cmip-950/70 border border-cmip-600/30 flex items-center justify-between text-sm">
                    <div>
                      <span className="font-bold text-white text-base">{item.patientName || item.number}</span>
                      <span className="text-xs text-amber-300 font-semibold ml-3">{item.officeName || item.desk}</span>
                    </div>
                    <span className="text-xs text-cmip-100/60 font-mono">{item.timestamp}</span>
                  </div>
                ))}

                {(!queueState.history || queueState.history.length === 0) && (
                  <div className="py-8 text-center text-cmip-100/50 text-xs font-medium">
                    Nenhuma senha chamada na TV ainda.
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>

      </div>

      {showResetModal && (
        <div className="fixed inset-0 bg-cmip-950/85 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-cmip-900 border border-cmip-600/50 p-6 rounded-3xl max-w-md w-full text-center space-y-5">
            <div className="w-12 h-12 bg-rose-950 text-rose-400 rounded-2xl flex items-center justify-center mx-auto border border-rose-800">
              <ShieldAlert className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-xl font-bold text-white">Zerar Fila CMIP?</h3>
              <p className="text-sm text-cmip-100/70 mt-2">O próximo número chamado iniciará novamente em 0001 e a fila do Totem será limpa.</p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowResetModal(false)}
                className="flex-1 py-3 bg-cmip-950 hover:bg-cmip-800 text-cmip-100 font-bold rounded-xl"
              >
                Cancelar
              </button>
              <button
                onClick={handleResetQueue}
                className="flex-1 py-3 bg-cmip-red hover:bg-cmip-red-hover text-white font-bold rounded-xl shadow-lg"
              >
                Sim, Zerar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
