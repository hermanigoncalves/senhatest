import React, { useState, useEffect } from 'react';
import { 
  socket, fetchVercelState, setInitialTicketVercel, callNextVercel, 
  callCustomVercel, repeatCallVercel, resetQueueVercel, callWaitingTicketVercel,
  fetchOfficesAndDoctors, registerPatientCall, searchPatients
} from '../utils/socket';
import { 
  Play, RotateCcw, Hash, Users, Trash2, ShieldAlert, Plus, SlidersHorizontal, 
  Check, Tv, Tablet, Star, Bell, Clock, AlertCircle, ArrowRight, LogIn, Stethoscope, 
  LogOut, UserPlus, X, Send, CheckCircle, ExternalLink, Search, UserCheck, ArrowLeft, RefreshCw
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

  // --- GERENCIAMENTO DE BUSCA & CADASTRO DE PACIENTE INTEGRADO ---
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [patientName, setPatientName] = useState('');
  const [document, setDocument] = useState('');
  const [phone, setPhone] = useState('');
  const [priorityType, setPriorityType] = useState('Normal');
  const [selectedPatientId, setSelectedPatientId] = useState(null);

  // Estados da Busca de Pacientes
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [modalMode, setModalMode] = useState('search'); // 'search' | 'form'

  const [isRegistering, setIsRegistering] = useState(false);
  const [registerSuccessMsg, setRegisterSuccessMsg] = useState('');
  const [registerErrorMsg, setRegisterErrorMsg] = useState('');
  const [recentRegistered, setRecentRegistered] = useState([]);

  const loadDoctorsList = async () => {
    try {
      const res = await fetchOfficesAndDoctors();
      if (res?.doctors) {
        const activeDocs = res.doctors.filter(d => d.active !== false);
        setDoctors(activeDocs);
        if (activeDocs.length > 0 && !selectedDoctorId) {
          setSelectedDoctorId(String(activeDocs[0].id));
        }
      }
    } catch {}
  };

  useEffect(() => {
    loadDoctorsList();
  }, []);

  const handleOpenRegisterModal = () => {
    loadDoctorsList();
    setRegisterErrorMsg('');
    setRegisterSuccessMsg('');
    setSearchQuery('');
    setSearchResults([]);
    setHasSearched(false);
    setSelectedPatientId(null);
    setPatientName('');
    setDocument('');
    setPhone('');
    setPriorityType('Normal');
    setModalMode('search');
    setShowRegisterModal(true);

    // Carrega sugestões iniciais
    handleSearch('');
  };

  const handleSearch = async (term = searchQuery) => {
    const clean = typeof term === 'string' ? term.trim() : searchQuery.trim();
    setIsSearching(true);
    setHasSearched(true);
    setRegisterErrorMsg('');

    try {
      const res = await searchPatients(clean);
      if (res?.patients) {
        setSearchResults(res.patients);
      } else {
        setSearchResults([]);
      }
    } catch (e) {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectPatient = (patient) => {
    setSelectedPatientId(patient.id || null);
    setPatientName(patient.name || '');
    setDocument(patient.document || '');
    setPhone(patient.phone || '');
    setRegisterErrorMsg('');
    setModalMode('form');
  };

  const handleStartNewPatient = (presetName = '') => {
    setSelectedPatientId(null);
    setPatientName(presetName || searchQuery.trim() || '');
    setDocument('');
    setPhone('');
    setPriorityType('Normal');
    setRegisterErrorMsg('');
    setModalMode('form');
  };

  const handleBackToSearch = () => {
    setModalMode('search');
    setRegisterErrorMsg('');
    setRegisterSuccessMsg('');
  };

  const handleRegisterPatient = async (e) => {
    e?.preventDefault();
    if (!patientName.trim()) {
      setRegisterErrorMsg('Por favor, informe o nome completo do paciente.');
      return;
    }
    if (!selectedDoctorId) {
      setRegisterErrorMsg('Por favor, selecione um médico / consultório ativo.');
      return;
    }

    const selectedDoc = doctors.find(d => String(d.id) === String(selectedDoctorId));
    const doctorName = selectedDoc ? selectedDoc.name : 'Médico de Plantão';
    const officeName = selectedDoc?.office_name || selectedDoc?.office?.name || 'Consultório';
    const targetTv = selectedDoc?.office?.target_tv || '1';

    setIsRegistering(true);
    setRegisterErrorMsg('');
    setRegisterSuccessMsg('');

    const res = await registerPatientCall({
      patientId: selectedPatientId,
      patientName: patientName.trim(),
      document: document.trim(),
      phone: phone.trim(),
      doctorId: parseInt(selectedDoctorId, 10),
      doctorName,
      officeName,
      targetTv,
      type: priorityType,
      createdBy: user?.name || 'Recepção'
    });

    setIsRegistering(false);

    if (res?.success) {
      const tvLabel = targetTv === '2' ? 'TV 02 (1º Andar)' : targetTv === 'all' ? 'Ambas as TVs' : 'TV 01 (Térreo)';
      const newEntry = {
        id: res.call?.id || Date.now(),
        name: patientName.trim(),
        doctor: doctorName,
        office: officeName,
        tv: tvLabel,
        type: priorityType,
        time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      };
      setRecentRegistered(prev => [newEntry, ...prev.slice(0, 5)]);
      setRegisterSuccessMsg(`Paciente ${patientName.trim()} encaminhado com sucesso para ${doctorName} (${officeName} • ${tvLabel})!`);
      
      // Reseta e volta para o modo busca
      setPatientName('');
      setDocument('');
      setPhone('');
      setSelectedPatientId(null);
      setSearchQuery('');
      setPriorityType('Normal');
      
      setTimeout(() => {
        setModalMode('search');
        handleSearch('');
      }, 1500);
    } else {
      setRegisterErrorMsg(res?.message || 'Erro ao encaminhar paciente para o médico.');
    }
  };

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

          {/* ATALHOS RÁPIDOS (CADASTRO DE PACIENTES, TOTEM, TV E LOGOUT) */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleOpenRegisterModal}
              className="px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs md:text-sm rounded-xl shadow-lg shadow-emerald-500/25 flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]"
              title="Cadastrar Paciente e Encaminhar para o Consultório Médico"
            >
              <UserPlus className="w-4 h-4 text-slate-950 stroke-[2.5]" />
              <span>Cadastrar Paciente</span>
            </button>

            <a
              href="/tv-recepcao"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2.5 bg-cmip-950 hover:bg-cmip-800 text-emerald-300 font-bold text-xs rounded-xl border border-emerald-600/40 flex items-center gap-2 transition-colors shadow-md"
              title="Abrir Painel de TV da Recepção em Nova Aba"
            >
              <Tv className="w-4 h-4 text-emerald-400" />
              <span>Abrir TV em Nova Aba</span>
              <ExternalLink className="w-3 h-3 opacity-60" />
            </a>

            <a
              href="/tablet"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2.5 bg-gradient-to-r from-cmip-500 to-cmip-600 hover:from-cmip-400 hover:to-cmip-500 text-cmip-950 font-black text-xs rounded-xl shadow-lg flex items-center gap-2 transition-transform active:scale-95"
              title="Abrir Totem de Autoatendimento"
            >
              <Tablet className="w-4 h-4" />
              <span>Totem (Tablet)</span>
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

      {/* MODAL DE BUSCA & CADASTRO DE PACIENTE */}
      {showRegisterModal && (
        <div className="fixed inset-0 bg-cmip-950/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-cmip-900 border border-emerald-500/50 p-6 md:p-8 rounded-3xl max-w-2xl w-full shadow-2xl space-y-5 relative max-h-[92vh] overflow-y-auto">
            
            {/* Header do Modal */}
            <div className="flex items-center justify-between border-b border-cmip-600/30 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-500/20 text-emerald-300 rounded-2xl border border-emerald-500/30">
                  {modalMode === 'search' ? <Search className="w-6 h-6" /> : <UserPlus className="w-6 h-6" />}
                </div>
                <div>
                  <h3 className="text-xl font-black text-white uppercase tracking-tight">
                    {modalMode === 'search' ? 'Localizar ou Cadastrar Paciente' : (selectedPatientId ? 'Encaminhar Paciente' : 'Novo Cadastro de Paciente')}
                  </h3>
                  <p className="text-xs text-cmip-100/70">
                    {modalMode === 'search' 
                      ? 'Pesquise pelo nome ou documento antes de cadastrar' 
                      : 'Defina o médico e consultório de destino para encaminhamento em tempo real'}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowRegisterModal(false)}
                className="p-2 rounded-xl bg-cmip-950 text-cmip-100/60 hover:text-white hover:bg-cmip-800 transition-colors"
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mensagem de Sucesso */}
            {registerSuccessMsg && (
              <div className="p-4 rounded-2xl bg-emerald-950/90 border border-emerald-500/50 text-emerald-200 text-xs md:text-sm font-bold flex items-center gap-3 shadow-lg animate-fade-in">
                <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                <span className="flex-1">{registerSuccessMsg}</span>
              </div>
            )}

            {/* Mensagem de Erro */}
            {registerErrorMsg && (
              <div className="p-4 rounded-2xl bg-rose-950/90 border border-rose-500/50 text-rose-200 text-xs md:text-sm font-bold flex items-center gap-3 shadow-lg animate-fade-in">
                <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
                <span className="flex-1">{registerErrorMsg}</span>
              </div>
            )}

            {/* FASE 1: BUSCA DE PACIENTE */}
            {modalMode === 'search' && (
              <div className="space-y-5">
                
                {/* BARRA DE PESQUISA */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-cmip-100 uppercase tracking-wider">
                    Buscar Paciente Cadastrado (Nome, CPF ou Telefone):
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 text-cmip-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Ex: João da Silva ou 123.456.789-00"
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          handleSearch(e.target.value);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSearch(searchQuery);
                        }}
                        className="w-full bg-cmip-950 border border-cmip-500/40 text-white rounded-xl pl-10 pr-4 py-3 text-sm font-bold focus:outline-none focus:border-cmip-400 placeholder:text-cmip-100/30 shadow-inner"
                        autoFocus
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSearch(searchQuery)}
                      disabled={isSearching}
                      className="px-4 py-3 bg-cmip-800 hover:bg-cmip-700 text-white font-bold text-xs rounded-xl border border-cmip-500/40 flex items-center gap-1.5 transition-colors"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSearching ? 'animate-spin' : ''}`} />
                      <span>Buscar</span>
                    </button>
                  </div>
                </div>

                {/* RESULTADOS DA BUSCA */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-cmip-400 uppercase tracking-wider">
                      {isSearching ? 'Buscando...' : (searchResults.length > 0 ? `Pacientes Encontrados (${searchResults.length}):` : 'Resultado da Busca:')}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleStartNewPatient('')}
                      className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Cadastrar Novo Direto</span>
                    </button>
                  </div>

                  {/* LISTA DE PACIENTES ENCONTRADOS */}
                  {searchResults.length > 0 && (
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {searchResults.map((pat, idx) => (
                        <div
                          key={pat.id || idx}
                          className="p-3.5 bg-cmip-950/90 border border-cmip-600/40 hover:border-emerald-500/60 rounded-2xl flex items-center justify-between gap-3 transition-all hover:scale-[1.005] group"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-white text-sm truncate">{pat.name}</span>
                              {pat.document && (
                                <span className="px-2 py-0.5 rounded bg-cmip-800 text-cmip-300 text-[10px] font-mono font-semibold">
                                  CPF: {pat.document}
                                </span>
                              )}
                            </div>
                            {pat.phone && (
                              <div className="text-xs text-cmip-100/60 mt-0.5">
                                Tel: {pat.phone}
                              </div>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => handleSelectPatient(pat)}
                            className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs rounded-xl shadow flex items-center gap-1.5 shrink-0 transition-transform active:scale-95"
                          >
                            <span>Selecionar</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* NENHUM PACIENTE ENCONTRADO -> FALLBACK PARA CADASTRO */}
                  {hasSearched && searchResults.length === 0 && !isSearching && (
                    <div className="p-6 bg-cmip-950/80 border border-amber-500/40 rounded-2xl text-center space-y-3.5 animate-fade-in">
                      <div className="w-10 h-10 bg-amber-500/20 text-amber-300 rounded-xl flex items-center justify-center mx-auto border border-amber-500/30">
                        <AlertCircle className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white">
                          {searchQuery.trim() ? `Nenhum cadastro encontrado para "${searchQuery}"` : 'Nenhum paciente cadastrado encontrado'}
                        </h4>
                        <p className="text-xs text-cmip-100/70 mt-1">
                          Deseja realizar um novo cadastro com estes dados e encaminhar para a consulta?
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleStartNewPatient(searchQuery)}
                        className="px-5 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs md:text-sm rounded-xl shadow-lg flex items-center justify-center gap-2 mx-auto transition-transform active:scale-95"
                      >
                        <UserPlus className="w-4 h-4 text-slate-950 stroke-[2.5]" />
                        <span>Cadastrar "{searchQuery || 'Novo Paciente'}" Agora</span>
                      </button>
                    </div>
                  )}
                </div>

              </div>
            )}

            {/* FASE 2: FORMULÁRIO DE ENCAMINHAMENTO / NOVO CADASTRO */}
            {modalMode === 'form' && (
              <form onSubmit={handleRegisterPatient} className="space-y-4 animate-fade-in">
                
                {/* BANNER DE IDENTIFICAÇÃO DO PACIENTE */}
                <div className="p-3.5 bg-cmip-950/90 border border-emerald-500/40 rounded-2xl flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="p-2 bg-emerald-500/20 text-emerald-300 rounded-xl shrink-0">
                      {selectedPatientId ? <UserCheck className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block">
                        {selectedPatientId ? 'Paciente Selecionado do Cadastro' : 'Novo Cadastro de Paciente'}
                      </span>
                      <strong className="text-white text-sm truncate block">{patientName || 'Novo Paciente'}</strong>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleBackToSearch}
                    className="px-3 py-1.5 bg-cmip-800 hover:bg-cmip-700 text-cmip-200 hover:text-white font-bold text-xs rounded-xl border border-cmip-600/40 flex items-center gap-1 shrink-0 transition-colors"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Voltar à Busca</span>
                  </button>
                </div>

                {/* Nome do Paciente */}
                <div>
                  <label className="block text-xs font-bold text-cmip-100 uppercase tracking-wider mb-1.5">
                    Nome Completo do Paciente <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Maria das Graças Silva"
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    className="w-full bg-cmip-950 border border-cmip-500/40 text-white rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-cmip-400 placeholder:text-cmip-100/30 shadow-inner"
                    autoFocus={!selectedPatientId}
                  />
                </div>

                {/* Seletor de Médico / Consultório */}
                <div>
                  <label className="block text-xs font-bold text-cmip-100 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Stethoscope className="w-4 h-4 text-emerald-400" />
                      Médico / Consultório de Destino <span className="text-rose-400">*</span>
                    </span>
                  </label>
                  <select
                    value={selectedDoctorId}
                    onChange={(e) => setSelectedDoctorId(e.target.value)}
                    className="w-full bg-cmip-950 border border-cmip-500/40 text-white rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:border-cmip-400 shadow-inner"
                  >
                    {doctors.map(doc => (
                      <option key={doc.id} value={doc.id}>
                        {doc.name} — {doc.specialty || 'Geral'} ({doc.office_name || 'Consultório'})
                      </option>
                    ))}
                    {doctors.length === 0 && (
                      <option value="">Carregando médicos ativos...</option>
                    )}
                  </select>
                </div>

                {/* Prioridade */}
                <div>
                  <label className="block text-xs font-bold text-cmip-100 uppercase tracking-wider mb-1.5">
                    Tipo de Atendimento
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setPriorityType('Normal')}
                      className={`py-2.5 px-3 rounded-xl border text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                        priorityType === 'Normal'
                          ? 'bg-cmip-800 text-white border-cmip-400 shadow-md scale-[1.01]'
                          : 'bg-cmip-950 text-cmip-100/60 border-cmip-600/30 hover:bg-cmip-900'
                      }`}
                    >
                      <Users className="w-4 h-4" />
                      <span>Normal</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPriorityType('Preferencial')}
                      className={`py-2.5 px-3 rounded-xl border text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                        priorityType === 'Preferencial'
                          ? 'bg-amber-500 text-slate-950 border-amber-300 shadow-md scale-[1.01]'
                          : 'bg-cmip-950 text-amber-400/70 border-amber-600/30 hover:bg-cmip-900'
                      }`}
                    >
                      <Star className="w-4 h-4 fill-current" />
                      <span>Preferencial</span>
                    </button>
                  </div>
                </div>

                {/* Documento e Telefone */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-cmip-100 uppercase tracking-wider mb-1">
                      CPF / Documento (Opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="000.000.000-00"
                      value={document}
                      onChange={(e) => setDocument(e.target.value)}
                      className="w-full bg-cmip-950 border border-cmip-600/30 text-white rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-cmip-400 placeholder:text-cmip-100/30"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-cmip-100 uppercase tracking-wider mb-1">
                      Telefone / Celular (Opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="(00) 00000-0000"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full bg-cmip-950 border border-cmip-600/30 text-white rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-cmip-400 placeholder:text-cmip-100/30"
                    />
                  </div>
                </div>

                {/* Ações */}
                <div className="pt-3 flex gap-3">
                  <button
                    type="button"
                    onClick={handleBackToSearch}
                    className="flex-1 py-3 bg-cmip-950 hover:bg-cmip-800 text-cmip-100 font-bold text-xs rounded-xl border border-cmip-600/40 transition-colors"
                  >
                    Voltar
                  </button>

                  <button
                    type="submit"
                    disabled={isRegistering}
                    className="flex-2 py-3 px-6 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs md:text-sm rounded-xl shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 transition-transform active:scale-95 disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                    <span>{isRegistering ? 'Encaminhando...' : (selectedPatientId ? 'ENCAMINHAR PARA O MÉDICO' : 'CADASTRAR E ENVIAR AO MÉDICO')}</span>
                  </button>
                </div>
              </form>
            )}

            {/* Histórico Recente Cadastrado */}
            {recentRegistered.length > 0 && (
              <div className="pt-4 border-t border-cmip-600/30 space-y-2">
                <span className="text-[11px] font-bold text-cmip-400 uppercase tracking-wider block">
                  Últimos Pacientes Encaminhados Nesta Sessão:
                </span>
                <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                  {recentRegistered.map((p, idx) => (
                    <div key={p.id || idx} className="p-2 bg-cmip-950 rounded-xl border border-cmip-600/20 flex items-center justify-between text-xs">
                      <div>
                        <strong className="text-white">{p.name}</strong>
                        <span className="text-cmip-100/60 ml-2">→ {p.doctor} ({p.office})</span>
                      </div>
                      <span className="text-emerald-400 font-mono font-bold text-[10px]">{p.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
