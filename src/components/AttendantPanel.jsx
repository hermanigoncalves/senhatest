import React, { useState, useEffect } from 'react';
import { 
  socket, fetchVercelState, callNextVercel, 
  callCustomVercel, repeatCallVercel, resetQueueVercel 
} from '../utils/socket';
import { 
  Play, RotateCcw, Hash, Users, Monitor, 
  Trash2, ShieldAlert, ExternalLink, Copy, Check, Plus
} from 'lucide-react';

export default function AttendantPanel() {
  const [queueState, setQueueState] = useState({
    counter: 0,
    currentTicket: null,
    history: [],
    desks: ['Guichê 01', 'Guichê 02', 'Guichê 03', 'Guichê 04', 'Recepção CMIP']
  });

  const [selectedDesk, setSelectedDesk] = useState('Guichê 01');
  const [customNumber, setCustomNumber] = useState('');
  const [copiedIp, setCopiedIp] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);

  const isVercelHost = window.location.hostname.includes('vercel.app');

  const updateState = (state) => {
    if (state) setQueueState(state);
  };

  useEffect(() => {
    fetch('/api/info')
      .then(res => res.json())
      .then(data => {
        if (data.state) updateState(data.state);
      })
      .catch(() => {});

    function onStateUpdate(state) {
      updateState(state);
    }

    socket.on('state-update', onStateUpdate);
    if (socket.connected) socket.emit('get-state');

    const interval = setInterval(async () => {
      const state = await fetchVercelState();
      if (state) updateState(state);
    }, 2000);

    return () => {
      socket.off('state-update', onStateUpdate);
      clearInterval(interval);
    };
  }, []);

  const handleCallNext = async () => {
    if (isVercelHost || !socket.connected) {
      const res = await callNextVercel(selectedDesk);
      if (res?.state) updateState(res.state);
    } else {
      socket.emit('call-next', { desk: selectedDesk });
    }
  };

  const handleRepeatCall = async () => {
    if (isVercelHost || !socket.connected) {
      const res = await repeatCallVercel(queueState.currentTicket);
      if (res?.state) updateState(res.state);
    } else {
      socket.emit('repeat-call');
    }
  };

  const handleCallCustom = async (e) => {
    e.preventDefault();
    if (!customNumber.trim()) return;

    if (isVercelHost || !socket.connected) {
      const res = await callCustomVercel(customNumber.trim(), selectedDesk);
      if (res?.state) updateState(res.state);
    } else {
      socket.emit('call-custom', { number: customNumber.trim(), desk: selectedDesk });
    }
    setCustomNumber('');
  };

  const handleResetQueue = async () => {
    if (isVercelHost || !socket.connected) {
      await resetQueueVercel();
      const state = await fetchVercelState();
      updateState(state || { counter: 0, currentTicket: null, history: [], desks: queueState.desks });
    } else {
      socket.emit('reset-queue');
    }
    setShowResetModal(false);
  };

  const copyTvLink = () => {
    const link = `${window.location.origin}/tv`;
    navigator.clipboard.writeText(link);
    setCopiedIp(true);
    setTimeout(() => setCopiedIp(false), 2000);
  };

  return (
    <div className="min-h-screen bg-cmip-950 text-slate-100 font-['Montserrat',sans-serif] p-4 md:p-8 cmip-plus-pattern relative">
      
      {/* PADRÃO DE CRUZES DECORATIVAS CMIP */}
      <div className="absolute top-6 left-6 grid grid-cols-4 gap-2 opacity-20 pointer-events-none">
        {[...Array(12)].map((_, i) => (
          <Plus key={i} className="w-5 h-5 text-cmip-400" />
        ))}
      </div>

      <div className="max-w-7xl mx-auto space-y-8 relative z-10">
        
        {/* CABEÇALHO CMIP VERDE */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 p-6 bg-cmip-900/90 border border-cmip-600/30 rounded-3xl shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-5">
            <div className="bg-white p-3 rounded-2xl shadow-lg border border-cmip-100 max-w-[200px]">
              <img src="/logo.png" alt="CMIP Logo" className="h-12 object-contain" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black tracking-tight text-white uppercase flex items-center gap-2">
                <span className="text-cmip-400">CMIP</span> Atendimento
              </h1>
              <p className="text-xs text-cmip-100 font-semibold tracking-wider uppercase">Centro Médico Integrado Piratininga</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <a 
              href="/tv" 
              target="_blank" 
              rel="noreferrer"
              className="px-5 py-3 bg-cmip-600 hover:bg-cmip-500 text-white rounded-2xl font-bold text-sm flex items-center gap-2 transition-all shadow-lg shadow-cmip-600/30"
            >
              <Monitor className="w-4 h-4 text-white" />
              <span>Abrir Painel da TV</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-80" />
            </a>
          </div>
        </header>

        {/* LINK DA TV */}
        <div className="p-5 bg-cmip-900/60 border border-cmip-500/40 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 glass-panel">
          <div className="flex items-start gap-3">
            <Monitor className="w-6 h-6 text-cmip-400 shrink-0 mt-1" />
            <div>
              <h3 className="font-bold text-cmip-100 text-sm">Endereço para abrir na TV / Chrome:</h3>
              <div className="mt-1.5">
                <code className="px-3 py-1 bg-cmip-950/80 border border-cmip-500/50 rounded-lg text-cmip-400 font-mono text-sm font-bold">
                  {window.location.origin}/tv
                </code>
              </div>
            </div>
          </div>

          <button
            onClick={copyTvLink}
            className="px-4 py-2 bg-cmip-red hover:bg-cmip-red-hover text-white rounded-xl font-bold text-xs flex items-center gap-2 transition-colors shrink-0 shadow-md"
          >
            {copiedIp ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span>{copiedIp ? 'Copiado!' : 'Copiar Link da TV'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* CONTROLE DO ATENDENTE */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* SELEÇÃO DE GUICHÊ */}
            <div className="p-6 bg-cmip-900/70 border border-cmip-600/30 rounded-3xl glass-panel space-y-4">
              <h2 className="text-base font-bold text-cmip-100 uppercase tracking-wider flex items-center gap-2">
                <Users className="w-5 h-5 text-cmip-400" />
                Guichê / Consultório de Atendimento
              </h2>

              <div>
                <label className="block text-xs font-semibold text-cmip-100/70 mb-2">SELECIONE SEU LOCAL</label>
                <select 
                  value={selectedDesk}
                  onChange={(e) => setSelectedDesk(e.target.value)}
                  className="w-full bg-cmip-950 border border-cmip-500/50 text-white rounded-xl px-4 py-3 font-bold text-base focus:outline-none focus:border-cmip-400"
                >
                  {queueState.desks.map(desk => (
                    <option key={desk} value={desk}>{desk}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* BOTÃO PRINCIPAL CHAMAR PRÓXIMA */}
            <div className="p-8 bg-gradient-to-br from-cmip-800/80 via-cmip-900/90 to-cmip-950 border border-cmip-500/40 rounded-3xl glass-panel text-center space-y-6 relative overflow-hidden">
              
              {/* ONDA DECORATIVA CMIP VERDE */}
              <div className="absolute -bottom-10 -right-10 w-48 h-48 bg-cmip-500/10 rounded-full blur-2xl pointer-events-none" />

              <div>
                <span className="text-xs font-bold tracking-widest text-cmip-400 uppercase">Sequência Numérica (1 a 1000)</span>
                <h3 className="text-3xl font-black text-white mt-1">Chamar Próximo Paciente</h3>
                <p className="text-xs text-cmip-100/80 mt-1">Praticidade e agilidade no seu atendimento!</p>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 relative z-10">
                <button
                  onClick={handleCallNext}
                  className="w-full sm:w-auto px-10 py-5 bg-gradient-to-r from-cmip-500 to-cmip-600 hover:from-cmip-400 hover:to-cmip-500 text-cmip-950 rounded-2xl font-black text-xl shadow-xl shadow-cmip-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                >
                  <Play className="w-7 h-7 fill-cmip-950" />
                  <span>CHAMAR PRÓXIMA</span>
                </button>

                <button
                  onClick={handleRepeatCall}
                  disabled={!queueState.currentTicket}
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
                Chamar Número Específico (Ex: 0045 ou 500)
              </h3>

              <form onSubmit={handleCallCustom} className="flex gap-3">
                <input
                  type="text"
                  placeholder="Ex: 45 ou 0045"
                  value={customNumber}
                  onChange={(e) => setCustomNumber(e.target.value)}
                  className="flex-1 bg-cmip-950 border border-cmip-500/40 text-white rounded-xl px-4 py-3 font-semibold focus:outline-none focus:border-cmip-400 placeholder:text-cmip-100/40"
                />
                <button
                  type="submit"
                  className="px-6 py-3 bg-cmip-700 hover:bg-cmip-600 text-white font-bold rounded-xl border border-cmip-500/30 transition-colors"
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
                  {queueState.currentTicket ? queueState.currentTicket.number : '---'}
                </div>
                <div className="text-lg font-bold text-amber-300 mt-2">
                  {queueState.currentTicket ? queueState.currentTicket.desk : 'Aguardando...'}
                </div>
              </div>

              <div className="w-full pt-4 border-t border-cmip-600/30 flex items-center justify-between text-xs text-cmip-100/70">
                <span>Último número gerado: <strong>{queueState.counter} / 1000</strong></span>
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
                Histórico Recente CMIP
              </h3>

              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                {queueState.history.map((item, idx) => (
                  <div key={item.id || idx} className="p-3.5 rounded-xl bg-cmip-950/70 border border-cmip-600/30 flex items-center justify-between text-sm">
                    <div>
                      <span className="font-bold text-white text-base">{item.number}</span>
                      <span className="text-xs text-amber-300 font-semibold ml-3">{item.desk}</span>
                    </div>
                    <span className="text-xs text-cmip-100/60 font-mono">{item.timestamp}</span>
                  </div>
                ))}

                {queueState.history.length === 0 && (
                  <div className="py-8 text-center text-cmip-100/50 text-xs font-medium">
                    Nenhuma senha chamada ainda.
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
              <p className="text-sm text-cmip-100/70 mt-2">O próximo número chamado iniciará novamente em 0001.</p>
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
