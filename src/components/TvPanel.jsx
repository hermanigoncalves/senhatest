import React, { useState, useEffect, useRef } from 'react';
import { socket, fetchTvState } from '../utils/socket';
import { announceTicket, unlockAudio, warmupAudio, chimeDataUri, isAudioContextRunning } from '../utils/audio';
import { Volume2, Wifi, Maximize2, Clock, Plus, VolumeX, Stethoscope, Star, User } from 'lucide-react';

export default function TvPanel() {
  const [currentTicket, setCurrentTicket] = useState(null);
  const [history, setHistory] = useState([]);
  const [isConnected, setIsConnected] = useState(true);
  const [isCalling, setIsCalling] = useState(false);
  const [timeStr, setTimeStr] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  const announcedKeysRef = useRef(new Set());
  const isFirstMountRef = useRef(true);
  const audioQueueRef = useRef([]);
  const isProcessingQueueRef = useRef(false);
  const audioRef = useRef(null);

  const handleUnlockAudio = () => {
    warmupAudio();
    if (audioRef.current) {
      audioRef.current.play().then(() => {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }).catch(() => {});
    }
    setAudioUnlocked(true);
  };

  // Processador sequencial de áudio protegido contra travamentos
  const processAudioQueue = async () => {
    if (isProcessingQueueRef.current) return;
    if (audioQueueRef.current.length === 0) return;

    isProcessingQueueRef.current = true;

    try {
      while (audioQueueRef.current.length > 0) {
        const nextCall = audioQueueRef.current.shift();
        if (!nextCall || nextCall.type === 'Sistema') continue;

        // 1. Atualiza visualmente o card principal da TV
        setCurrentTicket(nextCall);
        setHistory(prev => {
          const filtered = prev.filter(t => (t.id || t.callId) !== (nextCall.id || nextCall.callId));
          return [nextCall, ...filtered].slice(0, 8);
        });

        // 2. Dispara destaque visual piscante
        setIsCalling(true);

        // 3. Toca o Chime sonoro e fala a senha ou paciente
        try {
          unlockAudio();
          await Promise.race([
            announceTicket(nextCall),
            new Promise(resolve => setTimeout(resolve, 5500))
          ]);
        } catch (err) {
          console.error('[Audio Error]', err);
        }

        // 4. Intervalo de leitura visual antes da próxima chamada
        await new Promise(resolve => setTimeout(resolve, 3000));
        setIsCalling(false);
        await new Promise(resolve => setTimeout(resolve, 400));
      }
    } catch (queueErr) {
      console.error('[Queue Process Error]', queueErr);
    } finally {
      isProcessingQueueRef.current = false;
      setIsCalling(false);
      if (audioQueueRef.current.length > 0) {
        setTimeout(() => processAudioQueue(), 100);
      }
    }
  };

  const enqueueCall = (callItem) => {
    if (!callItem || callItem.type === 'Sistema') return;

    // Gera chave única robusta para evitar repetição acidental sem bloquear chamadas legítimas
    const uniqueKey = callItem.id 
      ? `id_${callItem.id}_${callItem.timestamp || ''}` 
      : `num_${callItem.number || callItem.patientName}_${callItem.timestamp || Date.now()}`;

    if (announcedKeysRef.current.has(uniqueKey)) {
      if (!isProcessingQueueRef.current && !currentTicket) {
        setCurrentTicket(callItem);
      }
      return;
    }

    announcedKeysRef.current.add(uniqueKey);

    // Mantém o tamanho do Set controlado
    if (announcedKeysRef.current.size > 200) {
      const arr = Array.from(announcedKeysRef.current);
      announcedKeysRef.current = new Set(arr.slice(arr.length - 100));
    }

    audioQueueRef.current.push(callItem);
    processAudioQueue();
  };

  useEffect(() => {
    warmupAudio();
    if (isAudioContextRunning()) {
      setAudioUnlocked(true);
    }

    const updateClock = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setDateStr(now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }));
    };
    updateClock();
    const clockInterval = setInterval(updateClock, 1000);

    function onConnect() { setIsConnected(true); }
    function onDisconnect() { setIsConnected(false); }
    
    function onPatientCalled(ticket) {
      if (ticket && ticket.type !== 'Sistema') enqueueCall(ticket);
    }

    function onTicketCalled(ticket) {
      if (ticket && ticket.type !== 'Sistema') enqueueCall(ticket);
    }

    function onQueueReset() {
      audioQueueRef.current = [];
      announcedKeysRef.current.clear();
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      setCurrentTicket(null);
      setHistory([]);
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('patient-called', onPatientCalled);
    socket.on('ticket-called', onTicketCalled);
    socket.on('queue-reset', onQueueReset);

    // Polling inteligente e seguro para a Vercel
    const pollInterval = setInterval(async () => {
      const state = await fetchTvState();
      if (state) {
        setIsConnected(true);

        if (isFirstMountRef.current) {
          isFirstMountRef.current = false;
          if (state.currentTicket && state.currentTicket.type !== 'Sistema') {
            const firstKey = `id_${state.currentTicket.id}_${state.currentTicket.timestamp || ''}`;
            announcedKeysRef.current.add(firstKey);
            setCurrentTicket(state.currentTicket);
          }
          if (state.history) {
            setHistory(state.history.filter(h => h.type !== 'Sistema'));
          }
          return;
        }

        if (state.currentTicket && state.currentTicket.type !== 'Sistema') {
          const key = `id_${state.currentTicket.id}_${state.currentTicket.timestamp || ''}`;
          if (!announcedKeysRef.current.has(key)) {
            enqueueCall(state.currentTicket);
          }
        }

        if (state.history && !isProcessingQueueRef.current) {
          setHistory(state.history.filter(h => h.type !== 'Sistema'));
        }
      }
    }, 2000);

    const unlockEvents = ['click', 'touchstart', 'keydown', 'keyup', 'pointerdown'];
    const globalUnlock = () => handleUnlockAudio();
    unlockEvents.forEach(evt => window.addEventListener(evt, globalUnlock, { capture: true, passive: true }));

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('patient-called', onPatientCalled);
      socket.off('ticket-called', onTicketCalled);
      socket.off('queue-reset', onQueueReset);
      unlockEvents.forEach(evt => window.removeEventListener(evt, globalUnlock, { capture: true }));
      clearInterval(clockInterval);
      clearInterval(pollInterval);
    };
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
    }
  };

  const displayName = currentTicket?.patientName || currentTicket?.patient_name || currentTicket?.number || '---';
  const displayLocation = currentTicket?.officeName || currentTicket?.office_name || currentTicket?.desk || 'Aguardando...';
  const displayDoctor = currentTicket?.doctorName || currentTicket?.doctor_name || '';
  const isPriority = currentTicket?.type === 'Preferencial';

  return (
    <div 
      onClick={handleUnlockAudio}
      onTouchStart={handleUnlockAudio}
      className="h-screen max-h-screen bg-cmip-950 text-white flex flex-col font-['Montserrat',sans-serif] select-none overflow-hidden cmip-plus-pattern relative cursor-pointer"
    >
      <audio ref={audioRef} src={chimeDataUri} preload="auto" />

      {/* CRUZES DECORATIVAS CMIP */}
      <div className="absolute top-6 left-6 grid grid-cols-4 gap-2 opacity-20 pointer-events-none">
        {[...Array(16)].map((_, i) => (
          <Plus key={i} className="w-5 h-5 text-cmip-400" />
        ))}
      </div>
      <div className="absolute bottom-6 right-6 grid grid-cols-4 gap-2 opacity-20 pointer-events-none">
        {[...Array(16)].map((_, i) => (
          <Plus key={i} className="w-5 h-5 text-cmip-400" />
        ))}
      </div>

      {/* OVERLAY DE DESBLOQUEIO DE ÁUDIO */}
      {!audioUnlocked && (
        <div 
          onClick={handleUnlockAudio}
          className="bg-amber-400 text-slate-950 px-6 py-2.5 font-black text-center text-xs md:text-sm shadow-2xl flex items-center justify-center gap-3 z-50 cursor-pointer animate-pulse uppercase tracking-wider border-b-2 border-amber-600 shrink-0"
        >
          <VolumeX className="w-5 h-5 text-slate-950 animate-bounce shrink-0" />
          <span>⚠️ ÁUDIO BLOQUEADO DA TV: PRESSIONE QUALQUER BOTÃO NO CONTROLE DA TV OU CLIQUE NA TELA PARA LIBERAR O SOM!</span>
        </div>
      )}

      {/* CABEÇALHO DA TV */}
      <header className="px-6 py-4 bg-cmip-900/90 border-b border-cmip-600/30 flex items-center justify-between shadow-2xl backdrop-blur-md relative z-10 shrink-0">
        <div className="flex items-center gap-4">
          <div className="bg-white p-2.5 rounded-2xl shadow-xl border border-cmip-100 max-w-[200px]">
            <img src="/logo.png" alt="Centro Médico Integrado Piratininga" className="h-10 object-contain" />
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-black tracking-tight text-white uppercase flex items-center gap-2">
              <span className="text-cmip-400">CMIP</span> PAINEL DE ATENDIMENTO
            </h1>
            <p className="text-[11px] text-cmip-100 font-bold tracking-wider uppercase">CENTRO MÉDICO INTEGRADO PIRATININGA</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex flex-col items-end">
            <div className="flex items-center gap-2 text-2xl md:text-3xl font-extrabold text-white tracking-widest">
              <Clock className="w-5 h-5 text-cmip-400" />
              <span>{timeStr}</span>
            </div>
            <span className="text-[11px] text-cmip-100/70 capitalize">{dateStr}</span>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={toggleFullscreen}
              className="p-2.5 bg-cmip-950/80 hover:bg-cmip-800 rounded-xl text-cmip-100 transition-colors border border-cmip-600/40"
              title="Tela Cheia"
            >
              <Maximize2 className="w-4 h-4" />
            </button>

            <div className={`px-3.5 py-1.5 rounded-xl border flex items-center gap-2 text-xs font-semibold ${
              isConnected 
                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40' 
                : 'bg-rose-950/80 text-rose-300 border-rose-500/40'
            }`}>
              <Wifi className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              <span>ONLINE</span>
            </div>
          </div>
        </div>
      </header>

      {/* CORPO PRINCIPAL DA TV */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 p-5 md:p-6 items-stretch relative z-10 min-h-0 overflow-hidden">
        
        {/* CARD PRINCIPAL */}
        <div className="lg:col-span-8 flex flex-col justify-center min-h-0">
          <div className={`h-full rounded-3xl p-6 lg:p-10 flex flex-col justify-between items-center text-center transition-all duration-500 glass-panel min-h-0 relative overflow-hidden ${
            isCalling 
              ? 'animate-tv-glow border-cmip-400 bg-cmip-900/95 scale-[1.01]' 
              : 'border-cmip-600/30 bg-cmip-900/60 shadow-2xl'
          }`}>
            
            {/* TOPO DO CARD */}
            <div className="w-full flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <span className={`px-5 py-2 rounded-full text-xs md:text-sm font-black uppercase tracking-widest shadow-md ${
                  isPriority 
                    ? 'bg-amber-400 text-slate-950 animate-pulse flex items-center gap-1.5' 
                    : 'bg-cmip-500 text-cmip-950'
                }`}>
                  {isPriority ? <><Star className="w-4 h-4 fill-current" /> ATENDIMENTO PREFERENCIAL</> : 'SENHA CMIP'}
                </span>
              </div>

              <div className="flex items-center gap-2 px-4 py-1.5 rounded-full border border-cmip-500/40 bg-cmip-950/80 text-cmip-100 text-xs font-bold shadow-md">
                <Clock className="w-3.5 h-3.5 text-cmip-400" />
                <span>Horário: <strong className="text-amber-300">{currentTicket?.timestamp || '--:--'}</strong></span>
              </div>
            </div>

            {/* CENTRO: NOME OU NÚMERO */}
            <div className="my-auto py-4 flex flex-col items-center justify-center max-w-4xl">
              <p className="text-xs md:text-sm text-cmip-400 font-bold uppercase tracking-[0.3em] mb-2">SENHA ATUAL</p>
              
              <div className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl xl:text-9xl font-black tracking-tight text-white drop-shadow-[0_10px_40px_rgba(74,222,128,0.5)] line-clamp-2 leading-tight uppercase">
                {displayName}
              </div>

              {displayDoctor && (
                <div className="mt-4 flex items-center gap-2 px-4 py-1.5 rounded-2xl bg-cmip-950/80 border border-cmip-500/30 text-cyan-300 font-bold text-lg md:text-xl shadow">
                  <Stethoscope className="w-5 h-5 text-cyan-400" />
                  <span>{displayDoctor}</span>
                </div>
              )}
            </div>

            {/* RODAPÉ DO CARD */}
            <div className="w-full pt-5 border-t border-cmip-600/30 flex flex-col items-center shrink-0">
              <p className="text-[11px] md:text-xs text-cmip-400 font-bold uppercase tracking-[0.25em] mb-1">LOCAL DE ATENDIMENTO</p>
              <div className="text-3xl sm:text-4xl lg:text-5xl font-black text-amber-300 tracking-wide uppercase drop-shadow-md">
                {displayLocation}
              </div>
            </div>

          </div>
        </div>

        {/* HISTÓRICO LATERAL */}
        <div className="lg:col-span-4 flex flex-col justify-between min-h-0">
          <div className="h-full rounded-3xl p-5 bg-cmip-900/60 border border-cmip-600/30 glass-panel flex flex-col justify-between min-h-0 overflow-hidden shadow-2xl">
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-cmip-600/30 shrink-0">
                <h2 className="text-base font-bold uppercase tracking-wider text-slate-200">Últimas Chamadas</h2>
                <span className="text-[10px] bg-cmip-500 text-cmip-950 px-2.5 py-0.5 rounded-full font-black shadow-md">CMIP</span>
              </div>

              <div className="space-y-2.5 flex-1 flex flex-col justify-around min-h-0">
                {history.slice(1, 5).map((item, idx) => (
                  <div 
                    key={item.id || idx}
                    className="p-3 md:p-3.5 rounded-2xl bg-cmip-950/80 border border-cmip-600/40 flex items-center justify-between transition-all"
                  >
                    <div className="pr-2 min-w-0">
                      <div className="text-base md:text-lg font-black text-slate-100 truncate">
                        {item.patientName || item.patient_name || item.number}
                      </div>
                      <div className="text-xs font-bold text-amber-300 mt-0.5 truncate">
                        {item.officeName || item.office_name || item.desk}
                        {item.doctorName ? ` • ${item.doctorName}` : ''}
                      </div>
                    </div>
                    
                    <div className="shrink-0 text-right">
                      <span className="text-[11px] font-mono font-bold text-cmip-400 bg-cmip-900 px-2.5 py-1 rounded-lg border border-cmip-500/40 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {item.timestamp}
                      </span>
                    </div>
                  </div>
                ))}

                {history.length <= 1 && (
                  <div className="py-12 text-center text-cmip-100/50 font-medium text-xs">
                    Nenhuma chamada anterior
                  </div>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-cmip-600/30 text-center shrink-0 mt-2">
              <span className="inline-block px-3 py-1 bg-cmip-red text-white font-extrabold text-[10px] uppercase tracking-wider rounded-full shadow-md mb-1">
                Agendamento CMIP
              </span>
              <p className="text-[10px] text-cmip-100/70 font-medium">
                Atendimento por ordem de chamada. Mantenha seu documento em mãos.
              </p>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}
