import React, { useState, useEffect, useRef } from 'react';
import { socket, fetchVercelState } from '../utils/socket';
import { announceTicket, initAudioAutoUnlock, unlockAudio } from '../utils/audio';
import { Volume2, Wifi, Maximize2, Clock, Plus } from 'lucide-react';

export default function TvPanel() {
  const [currentTicket, setCurrentTicket] = useState(null);
  const [history, setHistory] = useState([]);
  const [isConnected, setIsConnected] = useState(true);
  const [isCalling, setIsCalling] = useState(false);
  const [timeStr, setTimeStr] = useState('');
  const [dateStr, setDateStr] = useState('');

  const callingTimerRef = useRef(null);
  const lastTicketIdRef = useRef(null);

  const handleTouch = () => {
    unlockAudio();
  };

  useEffect(() => {
    // Tenta desbloqueio de áudio automático no carregamento
    initAudioAutoUnlock();

    const updateClock = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setDateStr(now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }));
    };
    updateClock();
    const clockInterval = setInterval(updateClock, 1000);

    const handleNewTicketCall = (ticket) => {
      if (!ticket) return;

      if (ticket.id === lastTicketIdRef.current && !ticket.isRepeat) {
        return;
      }
      lastTicketIdRef.current = ticket.id;

      setCurrentTicket(ticket);
      setIsCalling(true);
      if (callingTimerRef.current) clearTimeout(callingTimerRef.current);
      callingTimerRef.current = setTimeout(() => setIsCalling(false), 4000);

      // Desbloqueia e executa Bip + Voz 100% automático sem telas de aviso
      unlockAudio();
      announceTicket(ticket.number, ticket.desk);
    };

    function onConnect() { setIsConnected(true); }
    function onDisconnect() { setIsConnected(false); }
    function onStateUpdate(state) {
      if (state?.currentTicket) {
        setCurrentTicket(state.currentTicket);
        lastTicketIdRef.current = state.currentTicket.id;
      }
      if (state?.history) setHistory(state.history);
    }
    function onTicketCalled(ticket) {
      handleNewTicketCall(ticket);
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('state-update', onStateUpdate);
    socket.on('ticket-called', onTicketCalled);

    if (socket.connected) socket.emit('get-state');

    const pollInterval = setInterval(async () => {
      const state = await fetchVercelState();
      if (state) {
        setIsConnected(true);
        if (state.history) setHistory(state.history);
        if (state.currentTicket) {
          if (state.currentTicket.id !== lastTicketIdRef.current) {
            handleNewTicketCall(state.currentTicket);
          } else {
            setCurrentTicket(state.currentTicket);
          }
        }
      }
    }, 1500);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('state-update', onStateUpdate);
      socket.off('ticket-called', onTicketCalled);
      clearInterval(clockInterval);
      clearInterval(pollInterval);
    };
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => console.log(err));
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
    }
  };

  return (
    <div 
      onClick={handleTouch}
      onTouchStart={handleTouch}
      className="min-h-screen bg-cmip-950 text-white flex flex-col font-['Montserrat',sans-serif] select-none overflow-hidden cmip-plus-pattern relative cursor-pointer"
    >
      
      {/* PADRÃO DE CRUZES DECORATIVAS CMIP NAS PONTAS */}
      <div className="absolute top-6 left-6 grid grid-cols-4 gap-2 opacity-25 pointer-events-none">
        {[...Array(16)].map((_, i) => (
          <Plus key={i} className="w-6 h-6 text-cmip-400" />
        ))}
      </div>
      <div className="absolute bottom-6 right-6 grid grid-cols-4 gap-2 opacity-25 pointer-events-none">
        {[...Array(16)].map((_, i) => (
          <Plus key={i} className="w-6 h-6 text-cmip-400" />
        ))}
      </div>

      {/* CABEÇALHO DA TV CMIP */}
      <header className="px-8 py-5 bg-cmip-900/90 border-b border-cmip-600/30 flex items-center justify-between shadow-2xl backdrop-blur-md relative z-10">
        <div className="flex items-center gap-5">
          <div className="bg-white p-3 rounded-2xl shadow-xl border border-cmip-100 max-w-[240px]">
            <img src="/logo.png" alt="Centro Médico Integrado Piratininga" className="h-12 object-contain" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-black tracking-tight text-white uppercase flex items-center gap-2">
              <span className="text-cmip-400">CMIP</span> PAINEL DA TV
            </h1>
            <p className="text-xs text-cmip-100 font-bold tracking-wider uppercase">PRATICIDADE E AGILIDADE NO SEU ATENDIMENTO!</p>
          </div>
        </div>

        <div className="flex items-center gap-8">
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-2 text-3xl font-extrabold text-white tracking-widest">
              <Clock className="w-6 h-6 text-cmip-400" />
              <span>{timeStr}</span>
            </div>
            <span className="text-xs text-cmip-100/70 capitalize">{dateStr}</span>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={toggleFullscreen}
              className="p-3 bg-cmip-950/80 hover:bg-cmip-800 rounded-xl text-cmip-100 transition-colors border border-cmip-600/40"
            >
              <Maximize2 className="w-5 h-5" />
            </button>

            <div className={`px-4 py-2 rounded-xl border flex items-center gap-2 text-xs font-semibold ${
              isConnected 
                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40' 
                : 'bg-rose-950/80 text-rose-300 border-rose-500/40'
            }`}>
              <Wifi className="w-4 h-4 text-emerald-400 animate-pulse" />
              <span>ONLINE</span>
            </div>
          </div>
        </div>
      </header>

      {/* ÁREA PRINCIPAL DA TV */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 p-8 items-stretch relative z-10">
        
        {/* DESTAQUE PRINCIPAL DA SENHA ATUAL */}
        <div className="lg:col-span-8 flex flex-col justify-center">
          <div className={`h-full min-h-[500px] rounded-3xl p-10 flex flex-col justify-between items-center text-center transition-all duration-500 glass-panel ${
            isCalling 
              ? 'animate-tv-glow border-cmip-400 bg-cmip-900/90 scale-[1.01]' 
              : 'border-cmip-600/30 bg-cmip-900/60 shadow-2xl'
          }`}>
            
            <div className="w-full flex items-center justify-between">
              <span className="px-6 py-2 rounded-full text-base font-extrabold uppercase tracking-widest shadow-md bg-cmip-500 text-cmip-950">
                SENHA CMIP
              </span>

              <div className="flex items-center gap-2 px-4 py-1.5 rounded-full border border-emerald-500/40 bg-emerald-950/80 text-emerald-300 text-xs font-semibold">
                <Volume2 className="w-4 h-4 text-emerald-400 animate-pulse" />
                <span>Áudio & Voz CMIP</span>
              </div>
            </div>

            <div className="my-auto py-8">
              <p className="text-sm md:text-base text-cmip-400 font-bold uppercase tracking-[0.3em] mb-2">SENHA ATUAL</p>
              <div className="text-7xl sm:text-8xl lg:text-9xl xl:text-[11rem] font-black tracking-tight text-white drop-shadow-[0_10px_40px_rgba(74,222,128,0.5)]">
                {currentTicket ? currentTicket.number : '---'}
              </div>
            </div>

            <div className="w-full pt-6 border-t border-cmip-600/30 flex flex-col items-center">
              <p className="text-xs md:text-sm text-cmip-400 font-bold uppercase tracking-[0.25em] mb-1">LOCAL DE ATENDIMENTO</p>
              <div className="text-4xl sm:text-5xl lg:text-6xl font-black text-amber-300 tracking-wide uppercase drop-shadow-md">
                {currentTicket ? currentTicket.desk : 'Aguardando...'}
              </div>
            </div>

          </div>
        </div>

        {/* HISTÓRICO DAS ÚLTIMAS SENHAS */}
        <div className="lg:col-span-4 flex flex-col justify-between">
          <div className="h-full rounded-3xl p-6 bg-cmip-900/60 border border-cmip-600/30 glass-panel flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-cmip-600/30">
                <h2 className="text-xl font-bold uppercase tracking-wider text-slate-200">Últimas Chamadas</h2>
                <span className="text-xs bg-cmip-500 text-cmip-950 px-3 py-1 rounded-full font-extrabold shadow-md">CMIP</span>
              </div>

              <div className="space-y-4">
                {history.slice(1, 5).map((item, idx) => (
                  <div 
                    key={item.id || idx}
                    className="p-5 rounded-2xl bg-cmip-950/80 border border-cmip-600/40 flex items-center justify-between transition-all hover:bg-cmip-900/60"
                  >
                    <div>
                      <div className="text-3xl font-black text-slate-100">{item.number}</div>
                      <div className="text-sm font-semibold text-amber-300 mt-0.5">{item.desk}</div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-mono text-cmip-100/70 bg-cmip-900 px-2.5 py-1 rounded-lg border border-cmip-600/30">
                        {item.timestamp}
                      </span>
                    </div>
                  </div>
                ))}

                {history.length <= 1 && (
                  <div className="py-16 text-center text-cmip-100/50 font-medium">
                    Nenhuma chamada anterior
                  </div>
                )}
              </div>
            </div>

            <div className="pt-6 border-t border-cmip-600/30 text-center">
              <span className="inline-block px-4 py-1.5 bg-cmip-red text-white font-extrabold text-xs uppercase tracking-wider rounded-full shadow-md mb-2">
                Agendamento CMIP
              </span>
              <p className="text-[11px] text-cmip-100/70 font-medium">
                Atendimento por ordem de chamada. Mantenha seu documento em mãos.
              </p>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}
