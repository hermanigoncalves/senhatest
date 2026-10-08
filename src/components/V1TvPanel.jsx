import React, { useEffect, useRef, useState } from 'react';
import { Clock, Film, Maximize2, Monitor, Stethoscope, Volume2, VolumeX, Wifi } from 'lucide-react';
import { cmipApi } from '../utils/cmipApi';
import { announceTicket, isAudioContextRunning, warmupAudio, checkTtsAvailability } from '../utils/audio';
import { telemetry, latencyLog } from '../utils/telemetry';
import { normalizeTvEvent as normalize } from '../utils/tvEvents';

const VIDEOS = ['/institucional-1.mp4', '/institucional-2.mp4'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default function V1TvPanel({ slug }) {
  const [current, setCurrent] = useState(null);
  const [history, setHistory] = useState([]);
  const [panel, setPanel] = useState(null);
  const [apiConnected, setApiConnected] = useState(true);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [calling, setCalling] = useState(false);
  const [activated, setActivated] = useState(false);
  const [video, setVideo] = useState(0);
  const [muted, setMuted] = useState(true);
  const [time, setTime] = useState('');
  const [date, setDate] = useState('');
  const [missing, setMissing] = useState(false);
  const [videoReady, setVideoReady] = useState(false);

  const videoRef = useRef(null);
  const first = useRef(true);
  const seen = useRef(new Set());
  const announcementQueue = useRef([]);
  const announcementProcessing = useRef(false);
  // Os callbacks de Realtime/polling são registrados uma única vez (useEffect [slug]) e guardam o valor do
  // primeiro render; por isso o estado de ativação precisa de uma ref para ser lido de dentro da fila.
  const activatedRef = useRef(false);
  const loadSeq = useRef(0);

  const markActivated = () => {
    activatedRef.current = true;
    setActivated(true);
  };

  // Fila de Anúncio: Controla estritamente o card principal + áudio sincronizados
  const processAnnouncementQueue = async () => {
    if (announcementProcessing.current) return;
    announcementProcessing.current = true;

    try {
      while (announcementQueue.current.length) {
        const item = announcementQueue.current.shift();
        if (!item) continue;

        // O card principal da TV é atualizado EXATAMENTE no momento em que seu anúncio começa
        latencyLog('visual-updated', performance.now(), item.event_key, item.number);
        telemetry.mark(item.event_key, 'T6', {
          number: item.number,
          destination: item.desk,
          t0_timestamp: item.t0_timestamp,
          source: item.source,
        });

        setCurrent(item);
        setCalling(true);

        try {
          if (videoRef.current && !videoRef.current.paused) {
            videoRef.current.pause();
          }

          latencyLog('bell-start', performance.now(), item.event_key);

          await Promise.race([
            announceTicket(item, item.desk, {
              onChimeStart: () => {
                latencyLog('bell-start', performance.now(), item.event_key);
                telemetry.mark(item.event_key, 'T7', { t0_timestamp: item.t0_timestamp });
              },
              onSpeechStart: () => {
                latencyLog('speech-start', performance.now(), item.event_key);
                telemetry.mark(item.event_key, 'T8', { t0_timestamp: item.t0_timestamp });
              },
            }),
            sleep(20000),
          ]);

          latencyLog('speech-end', performance.now(), item.event_key);
        } catch (e) {
          console.error('[TV audio]', e);
        }

        // Intervalo técnico mínimo de 120ms (entre 100-150ms) entre términos de voz e início da próxima
        if (announcementQueue.current.length > 0) {
          await sleep(120);
        } else {
          setCalling(false);
          if (videoRef.current && activatedRef.current) {
            const p = videoRef.current.play();
            if (p && p.catch) p.catch(() => {});
          }
        }
      }
    } finally {
      announcementProcessing.current = false;
      if (announcementQueue.current.length) {
        setTimeout(processAnnouncementQueue, 30);
      }
    }
  };

  // Deduplicação unificada e gerenciamento de anúncio
  const enqueue = (item, origin = 'unknown') => {
    if (!item || !item.event_key) return;
    if (seen.current.has(item.event_key)) {
      latencyLog('deduplication-ignored', item.event_key, origin);
      return;
    }

    seen.current.add(item.event_key);
    // Limpeza de memória para Smart TV 24/7 (mantém no máximo 100 itens no Set)
    if (seen.current.size > 150) {
      const arr = Array.from(seen.current);
      seen.current = new Set(arr.slice(arr.length - 100));
    }

    item.source = origin;

    // 1. O histórico recebe a chamada imediatamente
    setHistory((h) => [item, ...h.filter((x) => x.event_key !== item.event_key)].slice(0, 8));

    // Telemetria T5 (adicionada à fila de anúncio)
    telemetry.mark(item.event_key, 'T5', { source: origin, t0_timestamp: item.t0_timestamp });

    // 2. O card principal é controlado sincronizadamente pela fila de anúncio
    announcementQueue.current.push(item);
    processAnnouncementQueue();
  };

  // Camada 2 & Carga Inicial: busca o estado público sanitizado do painel
  const load = async ({ announce = true, origin = 'polling' } = {}) => {
    const mySeq = ++loadSeq.current;
    try {
      const s = await cmipApi.publicPanelState(slug);
      // Uma resposta antiga não pode sobrescrever uma consulta mais recente.
      if (mySeq !== loadSeq.current) return;
      if (!s) {
        setMissing(true);
        return;
      }
      setMissing(false);
      setApiConnected(true);
      setPanel(s.panel || null);

      const next = normalize(s.current ? { ...s.current, source: origin } : null);
      const hist = (s.history || []).map((h) => normalize({ ...h, source: origin })).filter(Boolean);

      if (first.current) {
        first.current = false;
        if (next) seen.current.add(next.event_key);
        setCurrent(next);
        setHistory(hist);
        return;
      }

      if (next && announce) enqueue(next, origin);
      if (!next && !announcementProcessing.current && announcementQueue.current.length === 0)
        setCurrent(null);
      if (!announcementProcessing.current && announcementQueue.current.length === 0) setHistory(hist);
    } catch (e) {
      if (mySeq !== loadSeq.current) return;
      console.error('[TV state]', e);
      setApiConnected(false);
    } finally {
      // Os vídeos institucionais não dependem de a primeira consulta ter dado certo.
      setVideoReady(true);
    }
  };

  useEffect(() => {
    // 1. Relógio e data imediatos
    const tick = () => {
      const n = new Date();
      setTime(n.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
      setDate(
        n.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
      );
    };
    tick();
    const t = setInterval(tick, 1000);

    // 2. Pré-aquecimento de áudio e teste prévio de TTS com verificação periódica de recuperação
    warmupAudio();
    checkTtsAvailability().catch(() => {});
    const ttsProbeInterval = setInterval(() => {
      checkTtsAvailability().catch(() => {});
    }, 60000);

    // 3. Auto-ativação: o navegador só libera áudio automaticamente se a política de autoplay permitir
    //    (ex.: Chrome em modo quiosque com --autoplay-policy=no-user-gesture-required). Caso contrário,
    //    qualquer toque/tecla do controle remoto ativa o painel.
    const autoActivateTimer = setTimeout(() => {
      if (isAudioContextRunning()) markActivated();
    }, 400);
    const onFirstGesture = () => {
      if (!activatedRef.current) activate();
    };
    window.addEventListener('keydown', onFirstGesture);
    window.addEventListener('pointerdown', onFirstGesture);

    // 4. Carga inicial rápida (sem anunciar áudio do estado passado)
    load({ announce: false, origin: 'boot' });

    // 5. Camada 1 (Broadcast Instantâneo) + Camada 2 (Postgres Changes) no mesmo canal
    const off = cmipApi.subscribeDisplay(slug, {
      onBroadcast: (payload) => {
        if (!payload) return;
        latencyLog('tv-event-received', performance.now(), payload.event_key, payload.display_number);
        telemetry.mark(payload.event_key, 'T4', {
          source: 'broadcast',
          t3_timestamp: payload.t3_timestamp,
          t0_timestamp: payload.t0_timestamp,
        });
        const item = normalize({ ...payload, source: 'broadcast' });
        if (item) {
          enqueue(item, 'broadcast');
        }
      },
      onRefresh: () => load({ announce: true, origin: 'postgres_changes' }),
      onStatus: (s) => setRealtimeConnected(s),
    });

    // 6. Camada 3: Polling periódico de resiliência (10s como contingência pura)
    const poll = setInterval(() => load({ announce: true, origin: 'polling' }), 10000);

    return () => {
      clearTimeout(autoActivateTimer);
      window.removeEventListener('keydown', onFirstGesture);
      window.removeEventListener('pointerdown', onFirstGesture);
      clearInterval(t);
      clearInterval(ttsProbeInterval);
      clearInterval(poll);
      if (off) off();
    };
  }, [slug]);

  // Rotação de vídeos institucionais apenas se liberado
  useEffect(() => {
    if (videoReady && videoRef.current) {
      videoRef.current.load();
      if (activated) {
        const p = videoRef.current.play();
        if (p && p.catch) p.catch(() => {});
      }
    }
  }, [video, videoReady]);

  const activate = async () => {
    warmupAudio();
    markActivated();
    setMuted(true);

    if (videoRef.current) {
      try {
        const playPromise = videoRef.current.play();
        if (playPromise && playPromise.then) await playPromise;
      } catch (e) {
        console.warn('[TV video unlock]', e);
      }
    }

    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
    } catch (e) {
      console.warn('[TV fullscreen]', e);
    }
  };

  const fullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      } else {
        if (document.exitFullscreen) await document.exitFullscreen();
      }
    } catch {}
  };

  if (missing) {
    return (
      <main className="h-screen bg-cmip-950 text-white grid place-items-center p-8">
        <div className="text-center">
          <Monitor className="w-14 h-14 mx-auto text-cmip-400" />
          <h1 className="text-3xl font-black mt-4">TV não encontrada ou inativa</h1>
          <p className="text-cmip-100/60 mt-2">Verifique o identificador deste display ({slug}).</p>
        </div>
      </main>
    );
  }

  const connectionLabel = !apiConnected ? 'OFFLINE' : realtimeConnected ? 'ONLINE' : 'DEGRADADO';
  const connectionClass = !apiConnected
    ? 'text-rose-400 border-rose-500/30'
    : realtimeConnected
      ? 'text-emerald-400 border-emerald-500/30'
      : 'text-amber-300 border-amber-500/30';

  const isMedical = current?.kind === 'medical';
  const displayName = current ? (isMedical ? current.patientName : current.number) : '----';
  const location = current?.officeName || current?.desk || 'Aguardando chamada';

  return (
    <div className="h-screen w-screen bg-cmip-950 text-slate-100 font-['Montserrat',sans-serif] flex flex-col overflow-hidden cmip-plus-pattern relative">
      {/* Botão de desbloqueio de áudio/vídeo/tela cheia para navegadores */}
      {!activated && (
        <button
          autoFocus
          onClick={activate}
          className="absolute inset-0 z-50 bg-cmip-950/95 text-white grid place-items-center text-center p-8"
        >
          <div>
            <Volume2 className="w-16 h-16 mx-auto text-cmip-400" />
            <div className="text-4xl font-black mt-5">ATIVAR PAINEL</div>
            <p className="mt-3 text-cmip-100/70">Ativa áudio, vídeo e tela cheia para uso na televisão.</p>
          </div>
        </button>
      )}

      {/* Cabeçalho Superior */}
      <header className="h-16 md:h-20 px-4 md:px-6 flex items-center justify-between border-b border-cmip-600/30 bg-cmip-900/90 shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="bg-white p-1.5 rounded-xl">
            <img src="/logo.png" alt="CMIP Logo" className="h-9 md:h-11 object-contain" />
          </div>
          <div>
            <h1 className="font-black text-sm md:text-lg uppercase">
              <span className="text-cmip-400">CMIP</span> Painel de Atendimento
            </h1>
            <p className="text-[9px] md:text-xs text-cmip-100/60 uppercase">{panel?.name || slug}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fullscreen}
            className="p-2 rounded-lg border border-cmip-600/30 bg-cmip-950"
            title="Tela cheia"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <div
            className={`px-2 py-1 rounded-lg border flex items-center gap-1 text-[9px] font-bold ${connectionClass}`}
          >
            <Wifi className="w-3 h-3" />
            {connectionLabel}
          </div>
        </div>
      </header>

      {/* Conteúdo Principal */}
      <main className="flex-1 grid grid-cols-2 gap-3 md:gap-4 p-3 md:p-4 min-h-0 overflow-hidden z-10">
        {/* Coluna Esquerda: Senha Atual e Histórico */}
        <div className="flex flex-col gap-3 min-h-0">
          {/* Card Principal da Senha Chamada */}
          <div
            className={`flex-1 rounded-3xl p-4 md:p-5 flex flex-col justify-between items-center text-center glass-panel min-h-0 bg-cmip-900/70 border shadow-2xl transition-all ${
              calling ? 'animate-tv-glow border-cmip-400 bg-cmip-900/95 scale-[1.008]' : 'border-cmip-600/30'
            }`}
          >
            <div className="w-full flex items-center justify-between">
              <span className="px-4 py-1.5 rounded-full text-xs md:text-sm font-black uppercase tracking-wider bg-emerald-400 text-cmip-950">
                {isMedical ? (
                  <>
                    <Stethoscope className="inline w-4 h-4 mr-1" />
                    CONSULTA MÉDICA
                  </>
                ) : (
                  'SENHA DA RECEPÇÃO'
                )}
              </span>
              <span className="px-3 py-1 rounded-full border border-cmip-500/40 bg-cmip-950/80 text-xs font-bold">
                <Clock className="inline w-3 h-3 mr-1 text-cmip-400" />
                {time || '--:--'}
              </span>
            </div>

            <div className="my-auto py-2 flex flex-col items-center justify-center max-w-4xl">
              <p className="text-xs md:text-sm text-cmip-400 font-bold uppercase tracking-[0.25em] mb-1">
                {isMedical ? 'PACIENTE' : 'SENHA ATUAL'}
              </p>
              <div
                className={`${
                  isMedical
                    ? 'text-4xl sm:text-5xl md:text-6xl lg:text-7xl'
                    : 'text-6xl sm:text-7xl md:text-8xl lg:text-9xl'
                } font-black tracking-tight text-white leading-tight uppercase`}
              >
                {displayName}
              </div>
            </div>

            <div className="w-full pt-3 border-t border-cmip-600/30">
              <p className="text-[10px] md:text-xs text-cmip-400 font-bold uppercase tracking-[0.2em]">
                LOCAL DE ATENDIMENTO
              </p>
              <div className="text-2xl md:text-4xl xl:text-5xl font-black text-amber-300 uppercase">
                {location}
              </div>
            </div>
          </div>

          {/* Histórico Recente de Chamadas */}
          <div className="h-36 md:h-40 rounded-3xl p-3 bg-cmip-900/65 border border-cmip-600/30 glass-panel overflow-hidden shadow-2xl shrink-0">
            <div className="flex items-center justify-between mb-2 pb-1 border-b border-cmip-600/30">
              <h2 className="text-xs md:text-sm font-bold uppercase flex items-center gap-2">
                <Clock className="w-4 h-4 text-cmip-400" />
                Últimas Chamadas
              </h2>
              <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full">
                {panel?.name || 'CMIP'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 h-[76px]">
              {history.slice(1, 4).map((x) => (
                <div
                  key={x.event_key}
                  className="p-2 rounded-xl bg-cmip-950/80 border border-cmip-600/40 overflow-hidden"
                >
                  <div className="text-xs md:text-sm font-black truncate">
                    {x.kind === 'medical' ? x.patientName : x.number}
                  </div>
                  <div className="text-[10px] font-bold text-amber-300 truncate">
                    {x.officeName || x.desk}
                  </div>
                  <div className="text-[9px] mt-2 text-cmip-400">{x.timestamp}</div>
                </div>
              ))}
              {history.length <= 1 && (
                <div className="col-span-3 grid place-items-center text-xs text-cmip-100/50">
                  Nenhuma chamada anterior neste painel
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Coluna Direita: Vídeos Institucionais com preload='none' para não bloquear boot */}
        <div className="h-full rounded-3xl p-4 bg-cmip-900/70 border border-cmip-600/40 glass-panel shadow-2xl overflow-hidden flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs md:text-sm font-black uppercase flex items-center gap-2">
              <Film className="w-4 h-4 text-cmip-400" />
              CMIP VÍDEOS INSTITUCIONAIS
            </span>
            <div className="flex gap-2 items-center">
              <span className="text-xs font-mono bg-cmip-950 px-2 py-1 rounded">
                {video + 1} / {VIDEOS.length}
              </span>
              <button
                onClick={() => setMuted(!muted)}
                className="p-1.5 rounded-xl bg-cmip-950 border border-cmip-600/30"
              >
                {muted ? (
                  <VolumeX className="w-4 h-4 text-amber-400" />
                ) : (
                  <Volume2 className="w-4 h-4 text-emerald-400" />
                )}
              </button>
            </div>
          </div>
          <div className="relative flex-1 rounded-2xl overflow-hidden bg-black border border-cmip-600/20">
            <video
              ref={videoRef}
              key={video}
              src={videoReady ? VIDEOS[video] : undefined}
              autoPlay={activated}
              muted={muted}
              playsInline
              preload="none"
              onEnded={() => setVideo((video + 1) % VIDEOS.length)}
              className="w-full h-full object-contain bg-black"
            />
          </div>
          <p className="text-[10px] text-cmip-100/50 mt-2 text-center capitalize">{date}</p>
        </div>
      </main>
    </div>
  );
}
