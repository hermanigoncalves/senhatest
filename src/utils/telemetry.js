/**
 * Utilitário de Telemetria de Performance End-to-End para TV e Chamador CMIP
 * Ativo em ambiente de desenvolvimento (DEV) ou via localStorage.setItem('cmip_debug', 'true')
 */

const isDebugEnabled = () => {
  if (typeof window === 'undefined') return true;
  try {
    return Boolean(
      (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV) ||
      window.localStorage?.getItem('cmip_debug') === 'true' ||
      window.sessionStorage?.getItem('cmip_debug') === 'true'
    );
  } catch {
    return true;
  }
};

const timers = new Map();
const recentReports = [];
const MAX_TIMERS = 100;

// Log de latência só em desenvolvimento ou com localStorage.cmip_debug = 'true' (TVs 24/7 não poluem o console).
export const latencyLog = (...args) => {
  if (isDebugEnabled()) console.debug('[CMIP LATENCY]', ...args);
};

export const telemetry = {
  mark(eventId, step, extra = {}) {
    if (!isDebugEnabled()) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const wallNow = Date.now();

    if (!timers.has(eventId)) {
      // Limite de memória: operações que nunca chegam a T8/FINISHED não acumulam para sempre.
      while (timers.size >= MAX_TIMERS) timers.delete(timers.keys().next().value);
      timers.set(eventId, {
        createdAt: now,
        wallCreatedAt: extra.wallTime || wallNow,
        marks: {},
        wallMarks: {},
        extra: {},
      });
    }

    const entry = timers.get(eventId);
    entry.marks[step] = now;
    entry.wallMarks[step] = extra.wallTime || wallNow;
    Object.assign(entry.extra, extra);

    const deltaFromStart = Math.round(now - entry.createdAt);
    console.log(`⏱️ [CMIP Telemetry] [${eventId}] ${step}: +${deltaFromStart}ms`, extra);

    // Métricas compostas calculadas em pontos-chave
    if (step === 'T2' && entry.marks.T1) {
      const rpcLatency = Math.round(now - entry.marks.T1);
      console.log(`📊 [CMIP Metric] [${eventId}] RPC_LATENCY (T2 - T1): ${rpcLatency}ms`);
    }

    if (step === 'T3' && entry.marks.T2) {
      const dispatchLatency = Math.round(now - entry.marks.T2);
      console.log(`📊 [CMIP Metric] [${eventId}] BROADCAST_DISPATCH (T3 - T2): ${dispatchLatency}ms`);
    }

    if (step === 'T4' && extra.t3_timestamp) {
      const realtimeNet = Math.max(0, wallNow - extra.t3_timestamp);
      console.log(
        `📊 [CMIP Metric] [${eventId}] REALTIME_NETWORK (T4 - T3): ${realtimeNet}ms [source: ${extra.source || 'broadcast'}]`
      );
    }

    if (step === 'T6' && entry.marks.T5) {
      const queueWait = Math.round(now - entry.marks.T5);
      console.log(`📊 [CMIP Metric] [${eventId}] QUEUE_WAIT (T6 - T5): ${queueWait}ms`);
    }

    if (step === 'T8' || step === 'FINISHED') {
      const report = telemetry.getReport(eventId);
      if (report) {
        recentReports.push(report);
        if (recentReports.length > 50) recentReports.shift();
      }
      setTimeout(() => timers.delete(eventId), 15000);
    }
  },

  getReport(eventId) {
    const entry = timers.get(eventId);
    if (!entry) return null;
    const m = entry.marks;
    const wm = entry.wallMarks;
    const extra = entry.extra;

    const rpcLatency = m.T1 && m.T2 ? Math.round(m.T2 - m.T1) : null;
    const broadcastDispatch = m.T2 && m.T3 ? Math.round(m.T3 - m.T2) : null;
    const realtimeNetwork = extra.t3_timestamp && wm.T4 ? Math.max(0, wm.T4 - extra.t3_timestamp) : null;
    const queueWait = m.T5 && m.T6 ? Math.round(m.T6 - m.T5) : null;
    const clickToTv = extra.t0_timestamp && wm.T4 ? Math.max(0, wm.T4 - extra.t0_timestamp) : null;
    const clickToVisual = extra.t0_timestamp && wm.T6 ? Math.max(0, wm.T6 - extra.t0_timestamp) : null;
    const clickToAudio = extra.t0_timestamp && wm.T7 ? Math.max(0, wm.T7 - extra.t0_timestamp) : null;

    return {
      eventId,
      source: extra.source || 'broadcast',
      marks: m,
      wallMarks: wm,
      metrics: {
        RPC_LATENCY: rpcLatency,
        BROADCAST_DISPATCH: broadcastDispatch,
        REALTIME_NETWORK: realtimeNetwork,
        QUEUE_WAIT: queueWait,
        CLICK_TO_TV: clickToTv,
        CLICK_TO_VISUAL: clickToVisual,
        CLICK_TO_AUDIO: clickToAudio,
      },
    };
  },

  getRecentReports() {
    return recentReports;
  },

  clear() {
    timers.clear();
    recentReports.length = 0;
  },
};
