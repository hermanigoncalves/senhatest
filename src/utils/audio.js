// Motor de Áudio & Voz Híbrido CMIP para TV com Seleção de Vozes Nativas em PT-BR
// Blindagem contra congelamento do Chromium e cancelamento assíncrono

let audioCtx = null;
let ptVoice = null;
let chimeAudioElement = null;

// Mantém o motor de síntese acordado
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  setInterval(() => {
    try {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    } catch (e) {}
  }, 2500);
}

function generateChimeDataUri() {
  const sampleRate = 22050;
  const duration = 1.2;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Int16Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let freq = 0;
    let vol = 0;

    if (t < 0.45) {
      freq = 783.99; // "Ding"
      vol = Math.max(0, 1 - t / 0.45) * 0.85;
    } else if (t >= 0.35 && t < 1.2) {
      const t2 = t - 0.35;
      freq = 659.25; // "Dong"
      vol = Math.max(0, 1 - t2 / 0.85) * 0.95;
    }

    const sample = Math.sin(2 * Math.PI * freq * t) * vol * 32767;
    buffer[i] = Math.max(-32768, Math.min(32767, sample));
  }

  const wavHeader = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(wavHeader);

  view.setUint32(0, 0x52494646, false);
  view.setUint32(4, 36 + numSamples * 2, true);
  view.setUint32(8, 0x57415645, false);
  view.setUint32(12, 0x666d7420, false);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(36, 0x64617461, false);
  view.setUint32(40, numSamples * 2, true);

  const bytes = new Uint8Array(wavHeader);
  const pcmBytes = new Uint8Array(buffer.buffer);
  bytes.set(pcmBytes, 44);

  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return 'data:audio/wav;base64,' + btoa(binary);
}

export const chimeDataUri = generateChimeDataUri();

/**
 * Carrega e seleciona a melhor voz disponível em PT-BR
 */
export function getPtVoice() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  const ptVoices = voices.filter(v => v.lang && (v.lang.toLowerCase().includes('pt-br') || v.lang.toLowerCase().includes('pt_br') || v.lang.toLowerCase().includes('pt')));

  if (ptVoices.length > 0) {
    const preferredVoice = ptVoices.find(v => 
      /female|mulher|luciana|maria|leticia|francisca|fernanda|helena|vitoria|vitória|google.*português|microsoft.*maria/i.test(v.name)
    );
    ptVoice = preferredVoice || ptVoices[0];
  } else {
    ptVoice = voices[0];
  }
  return ptVoice;
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  getPtVoice();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = () => {
      getPtVoice();
    };
  }
}

export function getAudioContext() {
  if (!audioCtx && typeof window !== 'undefined') {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  return audioCtx;
}

export function isAudioContextRunning() {
  const ctx = getAudioContext();
  return ctx && ctx.state === 'running';
}

export function unlockAudio() {
  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.resume();
    }
  } catch (e) {}
}

export function warmupAudio() {
  unlockAudio();
  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'running') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.05);
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      getPtVoice();
      const warmup = new SpeechSynthesisUtterance(' ');
      warmup.volume = 0.01;
      warmup.rate = 10;
      window.speechSynthesis.speak(warmup);
    }
  } catch (e) {}
}

export function playChimeSound() {
  return new Promise((resolve) => {
    let resolved = false;
    const safeResolve = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };

    const ctx = getAudioContext();
    if (ctx) {
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      if (ctx.state === 'running') {
        try {
          const now = ctx.currentTime;
          
          // Nota 1: "Ding" (G5 - 783.99Hz)
          const osc1 = ctx.createOscillator();
          const gain1 = ctx.createGain();
          osc1.type = 'sine';
          osc1.frequency.setValueAtTime(783.99, now);
          gain1.gain.setValueAtTime(0, now);
          gain1.gain.linearRampToValueAtTime(0.85, now + 0.02);
          gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
          osc1.connect(gain1);
          gain1.connect(ctx.destination);
          osc1.start(now);
          osc1.stop(now + 0.35);

          // Nota 2: "Dong" (E5 - 659.25Hz)
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(659.25, now + 0.2);
          gain2.gain.setValueAtTime(0, now + 0.2);
          gain2.gain.linearRampToValueAtTime(0.95, now + 0.22);
          gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
          osc2.connect(gain2);
          gain2.connect(ctx.destination);
          osc2.start(now + 0.2);
          osc2.stop(now + 0.5);

          setTimeout(safeResolve, 450);
          return;
        } catch (e) {}
      }
    }

    try {
      if (!chimeAudioElement) {
        chimeAudioElement = new Audio(chimeDataUri);
      }
      chimeAudioElement.currentTime = 0;
      chimeAudioElement.volume = 1.0;
      chimeAudioElement.play().catch(() => {});
    } catch (e) {}

    setTimeout(safeResolve, 450);
  });
}

/**
 * Normaliza o nome do paciente para pronúncia fluida em PT-BR (Title Case),
 * evitando que siglas acidentais como "HErmani" sejam soletradas como "Agá Ermani".
 */
export function normalizePersonName(name) {
  if (!name || typeof name !== 'string') return '';
  const lowerExceptions = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em']);
  return name
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((word, index) => {
      if (!word) return '';
      if (index > 0 && lowerExceptions.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

/**
 * Formata o texto para fala perfeitamente em português (senha e guichê)
 */
export function formatTicketSpeech(ticket) {
  if (!ticket) return 'Atenção. Próximo atendimento CMIP.';

  // Se houver nome de paciente nominal
  if (ticket.patientName || ticket.patient_name) {
    const rawPatient = ticket.patientName || ticket.patient_name || '';
    const patient = normalizePersonName(rawPatient);
    const office = (ticket.officeName || ticket.office_name || ticket.desk || 'Consultório').trim();
    const isPriority = ticket.type === 'Preferencial';
    const prefix = isPriority ? 'Atenção, atendimento preferencial. ' : 'Atenção. ';
    return `${prefix}Paciente ${patient}, dirigir-se ao ${office}.`;
  }

  // Senha numérica tradicional (Ex: "Senha 1, Guichê 1")
  let rawNumberStr = String(ticket.number || ticket.rawNumber || '0').trim();
  let cleanNumber = rawNumberStr.replace(/^0+/, '');
  if (!cleanNumber) cleanNumber = '0';

  let rawDesk = String(ticket.officeName || ticket.desk || 'Guichê 1').trim();
  let cleanDesk = rawDesk.replace(/0+(\d+)/, '$1');

  if (ticket.type === 'Preferencial') {
    return `Atenção, atendimento preferencial. Senha ${cleanNumber}, ${cleanDesk}.`;
  }

  return `Senha ${cleanNumber}, ${cleanDesk}.`;
}

export function speakTicket(ticket) {
  return new Promise((resolve) => {
    const phrase = typeof ticket === 'string' ? ticket : formatTicketSpeech(ticket);

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.resume();

        const selectedVoice = getPtVoice();
        const utterance = new SpeechSynthesisUtterance(phrase);
        utterance.lang = 'pt-BR';
        utterance.rate = 0.95; // Velocidade natural e clara
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        if (selectedVoice) {
          utterance.voice = selectedVoice;
        }

        // Ancoramento global para evitar GC no Chromium
        window._activeUtterance = utterance;

        let hasEnded = false;
        let safetyTimer = null;

        const finish = () => {
          if (!hasEnded) {
            hasEnded = true;
            if (safetyTimer) clearTimeout(safetyTimer);
            window._activeUtterance = null;
            resolve();
          }
        };

        utterance.onend = finish;
        utterance.onerror = (err) => {
          console.warn('[SpeechSynthesis Error]', err);
          finish();
        };

        // Trava máxima de 4.5 segundos por fala
        safetyTimer = setTimeout(() => {
          finish();
        }, 4500);

        // Se houver fala anterior rodando, cancela suavemente antes de falar
        if (window.speechSynthesis.speaking) {
          window.speechSynthesis.cancel();
          setTimeout(() => {
            window.speechSynthesis.speak(utterance);
          }, 60);
        } else {
          window.speechSynthesis.speak(utterance);
        }
        return;
      } catch (err) {
        console.error('[SpeechSynthesis Exception]', err);
      }
    }

    resolve();
  });
}

export async function announceTicket(ticket) {
  unlockAudio();
  await playChimeSound();
  await speakTicket(ticket);
}
