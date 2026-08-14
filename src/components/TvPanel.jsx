import React, { useState, useEffect, useRef } from 'react';
import { socket, fetchVercelState } from '../utils/socket';
import { announceTicket, unlockAudio, warmupAudio, chimeDataUri, isAudioContextRunning } from '../utils/audio';
import { Volume2, Wifi, Maximize2, Clock, Plus, VolumeX } from 'lucide-react';

export default function TvPanel() {
  const [currentTicket, setCurrentTicket] = useState(null);
  const [history, setHistory] = useState([]);
  const [isConnected, setIsConnected] = useState(true);
  const [isCalling, setIsCalling] = useState(false);
  const [timeStr, setTimeStr] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  const lastAnnouncedCallIdRef = useRef(0);
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

  // Motor da Fila Sequencial Assíncrona de Áudio (FIFO)
  const processAudioQueue = async () => {
    if (isProcessingQueueRef.current) return;
    if (audioQueueRef.current.length === 0) return;

    isProcessingQueueRef.current = true;

    while (audioQueueRef.current.length > 0) {
      const nextTicket = audioQueueRef.current.shift();
      if (!nextTicket) continue;

      // 1. Atualiza visualmente o ticket atual na tela da TV
      setCurrentTicket(nextTicket);
      setHistory(prev => {
        const filtered = prev.filter(t => t.id !== nextTicket.id && t.number !== nextTicket.number);
        return [nextTicket, ...filtered].slice(0, 10);
      });

      // 2. Dispara o efeito visual de destaque
      setIsCalling(true);

      // 3. Toca o som (Bip + Voz) e AGUARDA COMPLETAR
      try {
        unlockAudio();
        await announceTicket(nextTicket.number, nextTicket.desk);
      } catch (err) {
        console.error('Erro no anúncio sonoro de senha:', err);
      }

      // 4. Intervalo de 3 segundos após a voz terminar antes de começar a próxima senha
      await new Promise(resolve => setTimeout(resolve, 3000));
      setIsCalling(false);
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    isProcessingQueueRef.current = false;
  };

  const enqueueTicketCall = (ticket) => {
    if (!ticket) return;
    const callId = ticket.callId || (typeof ticket.id === 'number' && ticket.id < 1000000000000 ? ticket.id : 0);

    // Se a contagem foi redefinida para um número menor ou zerada, limpa a fila e destrava
    if (callId > 0 && lastAnnouncedCallIdRef.current > 0 && (callId < lastAnnouncedCallIdRef.current || ticket.rawNumber < lastAnnouncedCallIdRef.current - 20)) {
      lastAnnouncedCallIdRef.current = 0;
      audioQueueRef.current = [];
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    }

    // Se for uma chamada antiga já anunciada, apenas atualiza a tela se não estiver tocando fila
    if (callId > 0 && callId <= lastAnnouncedCallIdRef.current) {
      if (!isProcessingQueueRef.current) {
        setCurrentTicket(ticket);
      }
      return;
    }

    const alreadyInQueue = audioQueueRef.current.some(t => (t.callId || t.id) === (ticket.callId || ticket.id));
    if (!alreadyInQueue) {
      if (callId > 0) {
        lastAnnouncedCallIdRef.current = Math.max(lastAnnouncedCallIdRef.current, callId);
      }
      audioQueueRef.current.push(ticket);
      processAudioQueue();
    }
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
    function onStateUpdate(state) {
      if (!state) return;

      if (!state.currentTicket || state.counter === 0) {
        audioQueueRef.current = [];
        if (typeof window !== 'undefined' && window.speechSynthesis) {
          window.speechSynthesis.cancel();
        }
        lastAnnouncedCallIdRef.current = 0;
        setCurrentTicket(null);
        setHistory([]);
      } else if (state.currentTicket && lastAnnouncedCallIdRef.current === 0) {
        lastAnnouncedCallIdRef.current = state.currentTicket.callId || state.currentTicket.id;
        setCurrentTicket(state.currentTicket);
      }

      if (state.history && !isProcessingQueueRef.current) {
        setHistory(state.history);
      }
    }

    function onTicketCalled(ticket) {
      enqueueTicketCall(ticket);
    }

    function onQueueReset() {
      audioQueueRef.current = [];
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      lastAnnouncedCallIdRef.current = 0;
      setCurrentTicket(null);
      setHistory([]);
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('state-update', onStateUpdate);
    socket.on('ticket-called', onTicketCalled);
    socket.on('queue-reset', onQueueReset);

    if (socket.connected) socket.emit('get-state');

    // Polling Vercel com detecção e enfileiramento de múltiplas chamadas simultâneas
    const pollInterval = setInterval(async () => {
      const state = await fetchVercelState();
      if (state) {
        setIsConnected(true);

        if (state.currentTicket) {
          const currentCallId = state.currentTicket.callId || state.currentTicket.id;

          if (lastAnnouncedCallIdRef.current === 0) {
            // Primeira carga: registra o estado atual sem tocar áudios velhos
            lastAnnouncedCallIdRef.current = currentCallId;
            setCurrentTicket(state.currentTicket);
            if (state.history) setHistory(state.history);
          } else if (state.history && state.history.length > 0) {
            // Encontra todas as chamadas novas no histórico ainda não anunciadas
            const unannounced = state.history
              .filter(t => (t.callId || t.id) > lastAnnouncedCallIdRef.current)
              .sort((a, b) => (a.callId || a.id) - (b.callId || b.id));

            if (unannounced.length > 0) {
              unannounced.forEach(t => enqueueTicketCall(t));
            } else if (currentCallId > lastAnnouncedCallIdRef.current) {
              enqueueTicketCall(state.currentTicket);
            }
          } else if (currentCallId > lastAnnouncedCallIdRef.current) {
            enqueueTicketCall(state.currentTicket);
          }
        } else {
          // Banco zerado
          audioQueueRef.current = [];
          if (typeof window !== 'undefined' && window.speechSynthesis) {
            window.speechSynthesis.cancel();
          }
          setCurrentTicket(null);
          setHistory([]);
          lastAnnouncedCallIdRef.current = 0;
        }

        if (state.history && !isProcessingQueueRef.current) {
          setHistory(state.history);
        }
      }
    }, 400);

    const events = ['click', 'touchstart', 'keydown', 'keyup', 'pointerdown', 'focus'];
    const globalUnlock = () => {
      handleUnlockAudio();
    };
    events.forEach(evt => window.addEventListener(evt, globalUnlock, { capture: true, passive: true }));

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('state-update', onStateUpdate);
      socket.off('ticket-called', onTicketCalled);
      socket.off('queue-reset', onQueueReset);
      events.forEach(evt => window.removeEventListener(evt, globalUnlock, { capture: true }));
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
      onClick={handleUnlockAudio}
      onTouchStart={handleUnlockAudio}
      className="h-screen max-h-screen bg-cmip-950 text-white flex flex-col font-['Montserrat',sans-serif] select-none overflow-hidden cmip-plus-pattern relative cursor-pointer"
    >
      <audio ref={audioRef} src={chimeDataUri} preload="auto" />

      {/* PADRÃO DE CRUZES DECORATIVAS CMIP */}
      <div className="absolute top-6 left-6 grid grid-cols-4 gap-2 opacity-25 pointer-events-none">
        {[...Array(16)].map((_, i) => (
          <Plus key={i} className="w-5 h-5 text-cmip-400" />
        ))}
      </div>
      <div className="absolute bottom-6 right-6 grid grid-cols-4 gap-2 opacity-25 pointer-events-none">
        {[...Array(16)].map((_, i) => (
          <Plus key={i} className="w-5 h-5 text-cmip-400" />
        ))}
      </div>

      {/* OVERLAY CASO BLOQUEADO DA TV */}
      {!audioUnlocked && (
        <div 
          onClick={handleUnlockAudio}
          className="bg-amber-400 text-slate-950 px-6 py-2.5 font-black text-center text-xs md:text-sm shadow-2xl flex items-center justify-center gap-3 z-50 cursor-pointer animate-pulse uppercase tracking-wider border-b-2 border-amber-600 shrink-0"
        >
          <VolumeX className="w-5 h-5 text-slate-950 animate-bounce shrink-0" />
          <span>⚠️ ÁUDIO BLOQUEADO DA TV: PRESSIONE QUALQUER BOTÃO NO CONTROLE DA TV OU CLIQUE NA TELA PARA LIBERAR O SOM DAS CHAMADAS!</span>
        </div>
      )}

      {/* CABEÇALHO DA TV CMIP */}
      <header className="px-6 py-4 bg-cmip-900/90 border-b border-cmip-600/30 flex items-center justify-between shadow-2xl backdrop-blur-md relative z-10 shrink-0">
        <div className="flex items-center gap-4">
          <div className="bg-white p-2.5 rounded-2xl shadow-xl border border-cmip-100 max-w-[200px]">
            <img src="/logo.png" alt="Centro Médico Integrado Piratininga" className="h-10 object-contain" />
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-black tracking-tight text-white uppercase flex items-center gap-2">
              <span className="text-cmip-400">CMIP</span> PAINEL DA TV
            </h1>
            <p className="text-[11px] text-cmip-100 font-bold tracking-wider uppercase">PRATICIDADE E AGILIDADE NO SEU ATENDIMENTO!</p>
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

      {/* ÁREA PRINCIPAL DA TV */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 p-5 md:p-6 items-stretch relative z-10 min-h-0 overflow-hidden">
        
        {/* DESTAQUE PRINCIPAL DA SENHA ATUAL */}
        <div className="lg:col-span-8 flex flex-col justify-center min-h-0">
          <div className={`h-full rounded-3xl p-6 lg:p-8 flex flex-col justify-between items-center text-center transition-all duration-500 glass-panel min-h-0 ${
            isCalling 
              ? 'animate-tv-glow border-cmip-400 bg-cmip-900/90 scale-[1.01]' 
              : 'border-cmip-600/30 bg-cmip-900/60 shadow-2xl'
          }`}>
            
            <div className="w-full flex items-center justify-between shrink-0">
              <span className="px-5 py-1.5 rounded-full text-xs md:text-sm font-extrabold uppercase tracking-widest shadow-md bg-cmip-500 text-cmip-950">
                SENHA CMIP
              </span>

              {/* EXIBIÇÃO EM DESTAQUE DA HORA DA CHAMADA */}
              <div className="flex items-center gap-2 px-3.5 py-1 rounded-full border border-cmip-500/40 bg-cmip-950/80 text-cmip-100 text-xs font-bold shadow-md">
                <Clock className="w-3.5 h-3.5 text-cmip-400" />
                <span>Horário da Chamada: <strong className="text-amber-300">{currentTicket ? currentTicket.timestamp : '--:--'}</strong></span>
              </div>
            </div>

            <div className="my-auto py-2 flex flex-col items-center justify-center">
              <p className="text-xs md:text-sm text-cmip-400 font-bold uppercase tracking-[0.3em] mb-1">SENHA ATUAL</p>
              <div className="text-6xl sm:text-7xl lg:text-8xl xl:text-9xl font-black tracking-tight text-white drop-shadow-[0_10px_40px_rgba(74,222,128,0.5)]">
                {currentTicket ? currentTicket.number : '---'}
              </div>
            </div>

            <div className="w-full pt-4 border-t border-cmip-600/30 flex flex-col items-center shrink-0">
              <p className="text-[11px] md:text-xs text-cmip-400 font-bold uppercase tracking-[0.25em] mb-0.5">LOCAL DE ATENDIMENTO</p>
              <div className="text-3xl sm:text-4xl lg:text-5xl font-black text-amber-300 tracking-wide uppercase drop-shadow-md">
                {currentTicket ? currentTicket.desk : 'Aguardando...'}
              </div>
            </div>

          </div>
        </div>

        {/* HISTÓRICO DAS ÚLTIMAS SENHAS */}
        <div className="lg:col-span-4 flex flex-col justify-between min-h-0">
          <div className="h-full rounded-3xl p-5 bg-cmip-900/60 border border-cmip-600/30 glass-panel flex flex-col justify-between min-h-0 overflow-hidden">
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-cmip-600/30 shrink-0">
                <h2 className="text-lg font-bold uppercase tracking-wider text-slate-200">Últimas Chamadas</h2>
                <span className="text-[11px] bg-cmip-500 text-cmip-950 px-2.5 py-0.5 rounded-full font-extrabold shadow-md">CMIP</span>
              </div>

              <div className="space-y-2.5 flex-1 flex flex-col justify-around min-h-0">
                {history.slice(1, 5).map((item, idx) => (
                  <div 
                    key={item.id || idx}
                    className="p-3 md:p-3.5 rounded-2xl bg-cmip-950/80 border border-cmip-600/40 flex items-center justify-between transition-all hover:bg-cmip-900/60"
                  >
                    <div>
                      <div className="text-xl md:text-2xl font-black text-slate-100">{item.number}</div>
                      <div className="text-xs font-semibold text-amber-300 mt-0.5">{item.desk}</div>
                    </div>
                    <div className="text-right">
                      {/* DESTACADA A HORA EM CADA ITEM DO HISTÓRICO */}
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
