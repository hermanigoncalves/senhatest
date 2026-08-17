import React, { useState, useEffect, useRef } from 'react';
import { socket, fetchTvState } from '../utils/socket';
import { announceTicket, unlockAudio, warmupAudio, chimeDataUri, isAudioContextRunning } from '../utils/audio';
import { Volume2, Wifi, Maximize2, Clock, Plus, VolumeX, Stethoscope, Star, Monitor, DoorOpen, Users } from 'lucide-react';

export default function TvPanel({ initialTvId }) {
  // Determina o canal da TV ('recepcao', '1', '2' ou 'all')
  const getUrlTvId = () => {
    if (initialTvId) return String(initialTvId);
    if (typeof window !== 'undefined') {
      const path = window.location.pathname.toLowerCase();
      const urlParams = new URLSearchParams(window.location.search);
      const paramTv = urlParams.get('channel') || urlParams.get('tvId') || urlParams.get('tv');

      if (paramTv === 'recepcao' || paramTv === 'guiche' || path.includes('/tv-recepcao')) return 'recepcao';
      if (paramTv === '1' || path.includes('/tv1') || path.includes('/tv-medica-1')) return '1';
      if (paramTv === '2' || path.includes('/tv2') || path.includes('/tv-medica-2')) return '2';
    }
    return 'all';
  };

  const [channel, setChannel] = useState(getUrlTvId());
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
  const channelRef = useRef(channel);

  useEffect(() => {
    channelRef.current = channel;
  }, [channel]);

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

  // Regra de Isolamento Estrito: Determina se uma chamada pertence a esta TV
  const belongsToThisTv = (callItem) => {
    if (!callItem || callItem.type === 'Sistema') return false;
    const currentChannel = channelRef.current;
    if (currentChannel === 'all') return true;

    // Se a TV for a da Recepção (apenas senhas numéricas dos guichês)
    if (currentChannel === 'recepcao') {
      const isDeskTicket = Boolean(callItem.number && !callItem.doctorName && !callItem.doctor_name);
      const isTargetRecepcao = callItem.targetTv === 'recepcao' || callItem.target_tv === 'recepcao';
      return isDeskTicket || isTargetRecepcao;
    }

    // Se for TV Médica 01 ou TV Médica 02
    if (currentChannel === '1' || currentChannel === '2') {
      // Ignora senhas puras de guichê da recepção na TV médica
      if (callItem.number && !callItem.patientName && !callItem.patient_name) {
        return false;
      }
      const itemTarget = String(callItem.targetTv || callItem.target_tv || '1');
      return itemTarget === currentChannel || itemTarget === 'all';
    }

    return true;
  };

  // Processador sequencial de áudio protegido contra sobreposição
  const processAudioQueue = async () => {
    if (isProcessingQueueRef.current) return;
    if (audioQueueRef.current.length === 0) return;

    isProcessingQueueRef.current = true;

    try {
      while (audioQueueRef.current.length > 0) {
        const nextCall = audioQueueRef.current.shift();
        if (!nextCall || !belongsToThisTv(nextCall)) continue;

        // 1. Atualiza o card principal da TV
        setCurrentTicket(nextCall);
        setHistory(prev => {
          const filtered = prev.filter(t => (t.id || t.callId) !== (nextCall.id || nextCall.callId));
          return [nextCall, ...filtered].slice(0, 8);
        });

        // 2. Dispara destaque visual pulsante
        setIsCalling(true);

        // 3. Toca Chime harmônico e fala a chamada em PT-BR
        try {
          unlockAudio();
          await Promise.race([
            announceTicket(nextCall),
            new Promise(resolve => setTimeout(resolve, 5500))
          ]);
        } catch (err) {
          console.error('[Audio Error]', err);
        }

        // 4. Intervalo de leitura visual
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
    if (!callItem || !belongsToThisTv(callItem)) return;

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
      if (ticket && belongsToThisTv(ticket)) enqueueCall(ticket);
    }

    function onTicketCalled(ticket) {
      if (ticket && belongsToThisTv(ticket)) enqueueCall(ticket);
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

    // Polling resiliente filtrado para a TV ativa
    const pollInterval = setInterval(async () => {
      const state = await fetchTvState(channelRef.current);
      if (state) {
        setIsConnected(true);

        if (isFirstMountRef.current) {
          isFirstMountRef.current = false;
          if (state.currentTicket && belongsToThisTv(state.currentTicket)) {
            const firstKey = `id_${state.currentTicket.id}_${state.currentTicket.timestamp || ''}`;
            announcedKeysRef.current.add(firstKey);
            setCurrentTicket(state.currentTicket);
          }
          if (state.history) {
            setHistory(state.history.filter(h => belongsToThisTv(h)));
          }
          return;
        }

        if (state.currentTicket && belongsToThisTv(state.currentTicket)) {
          const key = `id_${state.currentTicket.id}_${state.currentTicket.timestamp || ''}`;
          if (!announcedKeysRef.current.has(key)) {
            enqueueCall(state.currentTicket);
          }
        }

        if (state.history && !isProcessingQueueRef.current) {
          setHistory(state.history.filter(h => belongsToThisTv(h)));
        }
      }
    }, 2000);

    const unlockEvents = ['click', 'touchstart', 'keydown', 'keyup', 'pointerdown', 'mousemove', 'focus'];
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
  }, [channel]);

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

  const channelBadgeInfo = {
    recepcao: { title: 'TV Recepção & Guichês', color: 'bg-emerald-500 text-slate-950', icon: Users },
    '1': { title: 'TV 01 — Consultórios (Térreo / Ala A)', color: 'bg-cyan-500 text-slate-950', icon: DoorOpen },
    '2': { title: 'TV 02 — Consultórios (1º Andar / Ala B)', color: 'bg-purple-500 text-white', icon: DoorOpen },
    all: { title: 'Painel Geral CMIP', color: 'bg-cmip-500 text-cmip-950', icon: Monitor }
  }[channel] || { title: 'Painel Geral CMIP', color: 'bg-cmip-500 text-cmip-950', icon: Monitor };

  const ChannelIcon = channelBadgeInfo.icon;

  return (
    <div 
      onClick={handleUnlockAudio}
      onTouchStart={handleUnlockAudio}
      className="h-screen max-h-screen bg-cmip-950 text-white flex flex-col font-['Montserrat',sans-serif] select-none overflow-hidden cmip-plus-pattern relative cursor-pointer"
    >
      <audio ref={audioRef} src={chimeDataUri} preload="auto" />

      {/* ELEMENTOS DECORATIVOS CMIP */}
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
      <header className="px-6 py-3.5 bg-cmip-900/90 border-b border-cmip-600/30 flex flex-wrap items-center justify-between gap-4 shadow-2xl backdrop-blur-md relative z-10 shrink-0">
        <div className="flex items-center gap-4">
          <div className="bg-white p-2 rounded-2xl shadow-xl border border-cmip-100 max-w-[180px]">
            <img src="/logo.png" alt="Centro Médico Integrado Piratininga" className="h-9 object-contain" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base md:text-lg font-black tracking-tight text-white uppercase flex items-center gap-2">
                <span className="text-cmip-400">CMIP</span> PAINEL DE ATENDIMENTO
              </h1>
              
              {/* BADGE DA TV DEDICADA */}
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow ${channelBadgeInfo.color}`}>
                <ChannelIcon className="w-3 h-3" />
                {channelBadgeInfo.title}
              </span>
            </div>
            <p className="text-[10px] text-cmip-100 font-bold tracking-wider uppercase">CENTRO MÉDICO INTEGRADO PIRATININGA</p>
          </div>
        </div>

        {/* CONTROLES E SELETOR DE CANAIS */}
        <div className="flex items-center gap-5">
          
          {/* SELETOR DE TV (DISCRETO) */}
          <div className="flex items-center gap-1 bg-cmip-950/80 p-1 rounded-xl border border-cmip-600/40" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => { setChannel('recepcao'); announcedKeysRef.current.clear(); }}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all ${
                channel === 'recepcao' ? 'bg-emerald-500 text-slate-950 shadow' : 'text-cmip-100/60 hover:text-white'
              }`}
            >
              Recepção
            </button>
            <button
              onClick={() => { setChannel('1'); announcedKeysRef.current.clear(); }}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all ${
                channel === '1' ? 'bg-cyan-500 text-slate-950 shadow' : 'text-cmip-100/60 hover:text-white'
              }`}
            >
              TV 01
            </button>
            <button
              onClick={() => { setChannel('2'); announcedKeysRef.current.clear(); }}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all ${
                channel === '2' ? 'bg-purple-500 text-white shadow' : 'text-cmip-100/60 hover:text-white'
              }`}
            >
              TV 02
            </button>
            <button
              onClick={() => { setChannel('all'); announcedKeysRef.current.clear(); }}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition-all ${
                channel === 'all' ? 'bg-cmip-500 text-cmip-950 shadow' : 'text-cmip-100/60 hover:text-white'
              }`}
            >
              Geral
            </button>
          </div>

          <div className="flex flex-col items-end">
            <div className="flex items-center gap-2 text-xl md:text-2xl font-extrabold text-white tracking-widest">
              <Clock className="w-4 h-4 text-cmip-400" />
              <span>{timeStr}</span>
            </div>
            <span className="text-[10px] text-cmip-100/70 capitalize">{dateStr}</span>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
              className="p-2 bg-cmip-950/80 hover:bg-cmip-800 rounded-xl text-cmip-100 transition-colors border border-cmip-600/40"
              title="Tela Cheia"
            >
              <Maximize2 className="w-4 h-4" />
            </button>

            <div className={`px-2.5 py-1 rounded-xl border flex items-center gap-1.5 text-[10px] font-black ${
              isConnected 
                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40' 
                : 'bg-rose-950/80 text-rose-300 border-rose-500/40'
            }`}>
              <Wifi className="w-3 h-3 text-emerald-400 animate-pulse" />
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
                  {isPriority ? <><Star className="w-4 h-4 fill-current" /> ATENDIMENTO PREFERENCIAL</> : channel === 'recepcao' ? 'SENHA DA RECEPÇÃO' : 'CHAMADA MÉDICA'}
                </span>
              </div>

              <div className="flex items-center gap-2 px-4 py-1.5 rounded-full border border-cmip-500/40 bg-cmip-950/80 text-cmip-100 text-xs font-bold shadow-md">
                <Clock className="w-3.5 h-3.5 text-cmip-400" />
                <span>Horário: <strong className="text-amber-300">{currentTicket?.timestamp || '--:--'}</strong></span>
              </div>
            </div>

            {/* CENTRO: NOME OU NÚMERO DA SENHA */}
            <div className="my-auto py-4 flex flex-col items-center justify-center max-w-4xl">
              <p className="text-xs md:text-sm text-cmip-400 font-bold uppercase tracking-[0.3em] mb-2">
                {channel === 'recepcao' ? 'SENHA ATUAL' : 'PACIENTE CHAMADO'}
              </p>
              
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
                <span className="text-[10px] bg-cmip-500 text-cmip-950 px-2.5 py-0.5 rounded-full font-black shadow-md">
                  {channelBadgeInfo.title.split('—')[0].trim()}
                </span>
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
                    Nenhuma chamada anterior neste canal
                  </div>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-cmip-600/30 text-center shrink-0 mt-2">
              <span className="inline-block px-3 py-1 bg-cmip-red text-white font-extrabold text-[10px] uppercase tracking-wider rounded-full shadow-md mb-1">
                Atendimento CMIP
              </span>
              <p className="text-[10px] text-cmip-100/70 font-medium">
                {channel === 'recepcao' 
                  ? 'Aguarde a chamada da sua senha e dirija-se ao guichê.' 
                  : 'Por favor, dirija-se ao consultório indicado no painel.'}
              </p>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}
