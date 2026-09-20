// Motor de Áudio & Voz CMIP Original Restaurado e Blindado
// Suporte a PC, Smart TV e Tablets (com SpeechSynthesis Nativo e Google TTS Online)

let audioCtx = null;
let ptVoice = null;
let chimeAudioElement = null;

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
      vol = Math.max(0, 1 - t / 0.45) * 0.8;
    } else if (t >= 0.35 && t < 1.2) {
      const t2 = t - 0.35;
      freq = 659.25; // "Dong"
      vol = Math.max(0, 1 - t2 / 0.85) * 0.9;
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

function loadVoices() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return;

  const ptVoices = voices.filter(v => v.lang && (v.lang.includes('pt-BR') || v.lang.includes('pt_BR') || v.lang.includes('pt') || v.lang.includes('PT')));

  if (ptVoices.length > 0) {
    const preferredVoice = ptVoices.find(v => 
      /female|mulher|luciana|maria|francisca|fernanda|helena|vitoria|vitória|google/i.test(v.name)
    );
    ptVoice = preferredVoice || ptVoices[0];
  } else if (voices.length > 0) {
    ptVoice = voices[0];
  }
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  loadVoices();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
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
      const silentUtterance = new SpeechSynthesisUtterance('');
      silentUtterance.volume = 0.01;
      window.speechSynthesis.speak(silentUtterance);
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
  } catch (e) {}
}

export function playChimeSound() {
  return new Promise((resolve) => {
    let played = false;

    try {
      if (!chimeAudioElement) {
        chimeAudioElement = new Audio(chimeDataUri);
      }
      chimeAudioElement.currentTime = 0;
      chimeAudioElement.volume = 1.0;
      
      const playPromise = chimeAudioElement.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          played = true;
          setTimeout(resolve, 800);
        }).catch(() => {});
      }
    } catch (e) {}

    try {
      const ctx = getAudioContext();
      if (ctx) {
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }

        if (ctx.state === 'running') {
          const now = ctx.currentTime;
          const osc1 = ctx.createOscillator();
          const gain1 = ctx.createGain();
          osc1.type = 'sine';
          osc1.frequency.setValueAtTime(783.99, now);
          gain1.gain.setValueAtTime(0, now);
          gain1.gain.linearRampToValueAtTime(0.8, now + 0.03);
          gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
          osc1.connect(gain1);
          gain1.connect(ctx.destination);
          osc1.start(now);
          osc1.stop(now + 0.5);

          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(659.25, now + 0.2);
          gain2.gain.setValueAtTime(0, now + 0.2);
          gain2.gain.linearRampToValueAtTime(0.9, now + 0.23);
          gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
          osc2.connect(gain2);
          gain2.connect(ctx.destination);
          osc2.start(now + 0.2);
          osc2.stop(now + 0.9);

          if (!played) {
            setTimeout(resolve, 800);
          }
        }
      }
    } catch (e) {}

    setTimeout(resolve, 900);
  });
}

export function formatTextForSpeech(ticketOrNumber, desk) {
  let number = '';
  let targetDesk = 'Guichê 01';
  let isPriority = false;

  if (ticketOrNumber && typeof ticketOrNumber === 'object') {
    number = ticketOrNumber.number || ticketOrNumber.rawNumber || '0';
    targetDesk = ticketOrNumber.officeName || ticketOrNumber.office_name || ticketOrNumber.desk || desk || 'Guichê 01';
    isPriority = ticketOrNumber.type === 'Preferencial';

    if (ticketOrNumber.patientName || ticketOrNumber.patient_name) {
      const patient = (ticketOrNumber.patientName || ticketOrNumber.patient_name).trim();
      const prefix = isPriority ? 'Atenção, atendimento preferencial. ' : 'Atenção. ';
      return `${prefix}Paciente ${patient}, dirigir-se ao ${targetDesk}.`;
    }
  } else {
    number = String(ticketOrNumber || '0');
    targetDesk = desk || 'Guichê 01';
  }

  let cleanNumber = String(number).trim().replace(/^0+/, '');
  if (!cleanNumber) cleanNumber = '0';

  // Garante que o guichê sempre tenha o termo "Guichê" e seja pronunciado com clareza
  let cleanDesk = String(targetDesk || 'Guichê 01').trim();
  if (/^\d+$/.test(cleanDesk)) {
    cleanDesk = `Guichê ${parseInt(cleanDesk, 10)}`;
  } else {
    cleanDesk = cleanDesk.replace(/Guichê\s*0+(\d+)/i, 'Guichê $1');
  }

  // Uso de ponto final entre a senha e o guichê para dar uma pausa natural e elegante na voz
  if (isPriority) {
    return `Atenção, atendimento preferencial. Senha ${cleanNumber}. ${cleanDesk}.`;
  }

  return `Senha ${cleanNumber}. ${cleanDesk}.`;
}

export function speakTicketViaEndpoint(phrase) {
  return new Promise((resolve, reject) => {
    try {
      const url = `/api/tts?text=${encodeURIComponent(phrase)}`;
      const audio = new Audio(url);
      audio.volume = 1.0;
      if (typeof window !== 'undefined') {
        window._activeTtsAudio = audio;
      }

      let finished = false;
      const done = (success) => {
        if (!finished) {
          finished = true;
          clearTimeout(timer);
          if (typeof window !== 'undefined') {
            window._activeTtsAudio = null;
          }
          if (success) resolve();
          else reject(new Error('Audio playback failed'));
        }
      };

      // Timeout amplo de 9.5 segundos para garantir que toda a frase (inclusive o guichê) seja dita
      const timer = setTimeout(() => {
        done(true);
      }, 9500);

      audio.onended = () => done(true);
      audio.onerror = () => done(false);

      const p = audio.play();
      if (p !== undefined) {
        p.catch(() => done(false));
      }
    } catch (err) {
      reject(err);
    }
  });
}

export function speakTicketNative(phrase) {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return resolve();
    }

    try {
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();

      if (!ptVoice) loadVoices();
      const voices = window.speechSynthesis.getVoices();
      const validPtVoice = ptVoice || (voices && voices.find(v => v.lang && (v.lang.includes('pt') || v.lang.includes('PT'))));

      // Se o navegador não possui voz pt-BR instalada, não trava
      if (!validPtVoice) {
        return resolve();
      }

      const utterance = new SpeechSynthesisUtterance(phrase);
      utterance.lang = 'pt-BR';
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      utterance.voice = validPtVoice;

      let hasEnded = false;
      const finish = () => {
        if (!hasEnded) {
          hasEnded = true;
          resolve();
        }
      };

      utterance.onend = finish;
      utterance.onerror = finish;
      setTimeout(finish, 4500);

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      resolve();
    }
  });
}

export async function speakTicket(ticketOrNumber, desk) {
  const phrase = formatTextForSpeech(ticketOrNumber, desk);

  // 1. Tenta prioritariamente via endpoint /api/tts (garante voz nas Smart TVs e TV Box sem CORS)
  try {
    await speakTicketViaEndpoint(phrase);
    return;
  } catch (err) {
    console.warn('[TTS Endpoint Warning - Tentando voz nativa]', err.message);
  }

  // 2. Fallback para voz nativa do navegador
  try {
    await speakTicketNative(phrase);
  } catch (nativeErr) {
    console.warn('[TTS Native Warning]', nativeErr);
  }
}

export async function announceTicket(ticketOrNumber, desk) {
  unlockAudio();
  await playChimeSound();
  await new Promise(r => setTimeout(r, 250));
  await speakTicket(ticketOrNumber, desk);
}
