// Motor de Áudio & Voz CMIP Original Restaurado e Blindado
// Suporte a PC, Smart TV e Tablets (com SpeechSynthesis Nativo e Google TTS Online)

import { isRemoteTtsPhraseAllowed } from './ttsPolicy.js';

let audioCtx = null;
let ptVoice = null;
let ptVoiceLocal = null;
let chimeAudioElement = null;

function generateChimeDataUri() {
  const sampleRate = 22050;
  const duration = 1.2;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Int16Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sample = 0;

    // "Ding" (0 a 0.45s) e "Dong" (a partir de 0.35s) se sobrepõem 100ms, como no som original.
    if (t < 0.45) {
      sample += Math.sin(2 * Math.PI * 783.99 * t) * Math.max(0, 1 - t / 0.45) * 0.8;
    }
    if (t >= 0.35) {
      const t2 = t - 0.35;
      sample += Math.sin(2 * Math.PI * 659.25 * t) * Math.max(0, 1 - t2 / 0.85) * 0.9;
    }

    const scaled = sample * 0.7 * 32767;
    buffer[i] = Math.max(-32768, Math.min(32767, scaled));
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

const isPtVoice = (v) => Boolean(v.lang && /^pt([-_]|$)/i.test(v.lang));
const PREFERRED_VOICE = /female|mulher|luciana|maria|francisca|fernanda|helena|vitoria|vitória/i;

// Escolhe a melhor voz em português. Vozes "localService" rodam no aparelho; as demais (ex.: "Google português
// do Brasil" no Chrome) podem enviar o texto pela internet, então só servem para frases sem nome de paciente.
export function pickVoices(voices = []) {
  const pt = voices.filter(isPtVoice);
  const rank = (list) =>
    list.find((v) => PREFERRED_VOICE.test(v.name)) ||
    list.find((v) => /pt-BR|pt_BR/i.test(v.lang)) ||
    list[0] ||
    null;
  const local = pt.filter((v) => v.localService === true);
  return { local: rank(local), any: rank(pt) };
}

function loadVoices() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return;
  const picked = pickVoices(voices);
  ptVoiceLocal = picked.local;
  ptVoice = picked.any || voices[0] || null;
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

export async function playChimeSound() {
  // Tenta uma única fonte por vez para evitar campainha duplicada/eco.
  try {
    if (!chimeAudioElement) {
      chimeAudioElement = new Audio(chimeDataUri);
    }
    chimeAudioElement.pause();
    chimeAudioElement.currentTime = 0;
    chimeAudioElement.volume = 1.0;
    const playPromise = chimeAudioElement.play();
    if (playPromise !== undefined) {
      await playPromise;
    }
    await new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        chimeAudioElement.onended = null;
        setTimeout(resolve, 80);
      };
      chimeAudioElement.onended = finish;
      setTimeout(finish, 1400);
    });
    return;
  } catch (e) {
    // Só cai para WebAudio quando o elemento HTML realmente falhou.
  }

  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => {});
    }
    if (ctx.state !== 'running') return;

    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(783.99, now);
    gain1.gain.setValueAtTime(0.001, now);
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
    gain2.gain.setValueAtTime(0.001, now + 0.2);
    gain2.gain.linearRampToValueAtTime(0.9, now + 0.23);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.2);
    osc2.stop(now + 0.9);

    await new Promise((resolve) => setTimeout(resolve, 950));
  } catch (e) {
    console.warn('[Chime Warning]', e);
  }
}

const FEMININE_PLACES =
  /^(sala|recepção|recepcao|clínica|clinica|triagem|enfermaria|farmácia|farmacia|emergência|emergencia|ala|unidade)\b/i;

// "dirigir-se ao Consultório 1" / "dirigir-se à Sala 3"
export function destinationPhrase(place) {
  const name = String(place || '').trim();
  return `${FEMININE_PLACES.test(name) ? 'à' : 'ao'} ${name}`;
}

export function formatTextForSpeech(ticketOrNumber, desk) {
  let number = '';
  let targetDesk = 'Guichê 01';
  let isPriority = false;

  if (ticketOrNumber && typeof ticketOrNumber === 'object') {
    number = ticketOrNumber.number || ticketOrNumber.rawNumber || '0';
    targetDesk =
      ticketOrNumber.officeName || ticketOrNumber.office_name || ticketOrNumber.desk || desk || 'Guichê 01';
    isPriority = ticketOrNumber.type === 'Preferencial';

    if (ticketOrNumber.patientName || ticketOrNumber.patient_name) {
      const patient = (ticketOrNumber.patientName || ticketOrNumber.patient_name).trim();
      const prefix = isPriority ? 'Atenção, atendimento preferencial. ' : 'Atenção. ';
      return `${prefix}Paciente ${patient}, dirigir-se ${destinationPhrase(targetDesk)}.`;
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

let isServerTtsAvailable = null; // null = não testado, false = indisponível, true = disponível
let lastTtsFailureTime = 0;
const TTS_RECOVERY_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutos de cooldown para novo teste
// eslint-disable-next-line no-unused-vars
let activeUtterance = null; // Previne GC prematuro no Chromium/Tizen

export function getTtsStatus() {
  return {
    isServerTtsAvailable,
    lastTtsFailureTime,
    inCooldown: isServerTtsAvailable === false && Date.now() - lastTtsFailureTime <= TTS_RECOVERY_COOLDOWN_MS,
  };
}

export function _setTtsAvailableForTest(val, failureTime = 0) {
  isServerTtsAvailable = val;
  lastTtsFailureTime = failureTime;
}

export async function checkTtsAvailability(forceProbe = false) {
  const now = Date.now();
  // Se falhou anteriormente mas já se passaram 5 minutos, permite novo teste (Half-Open)
  if (isServerTtsAvailable === false && now - lastTtsFailureTime > TTS_RECOVERY_COOLDOWN_MS) {
    isServerTtsAvailable = null;
  }

  if (isServerTtsAvailable !== null && !forceProbe) return isServerTtsAvailable;

  if (typeof window === 'undefined' || !window.fetch) {
    isServerTtsAvailable = false;
    lastTtsFailureTime = Date.now();
    return false;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch('/api/tts?text=1', { signal: controller.signal, method: 'GET' });
    clearTimeout(timer);
    isServerTtsAvailable = res.ok;
    if (!res.ok) {
      lastTtsFailureTime = Date.now();
    }
  } catch {
    isServerTtsAvailable = false;
    lastTtsFailureTime = Date.now();
  }
  return isServerTtsAvailable;
}

export function speakTicketViaEndpoint(phrase) {
  return new Promise((resolve, reject) => {
    if (!isRemoteTtsPhraseAllowed(phrase)) {
      return reject(new Error('Frase com dados pessoais não pode usar TTS remoto'));
    }
    if (isServerTtsAvailable === false) {
      return reject(new Error('TTS remoto desativado/indisponível'));
    }

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
          try {
            audio.onended = null;
            audio.onerror = null;
            audio.pause();
            audio.src = '';
            audio.load();
          } catch {}
          if (typeof window !== 'undefined') {
            window._activeTtsAudio = null;
          }
          if (success) resolve();
          else reject(new Error('Audio playback failed'));
        }
      };

      // Tempo proporcional ao tamanho da frase para não cortar nomes/locais longos.
      const timeoutMs = Math.max(7000, Math.min(20000, 3000 + phrase.length * 90));
      const timer = setTimeout(() => {
        done(false);
      }, timeoutMs);

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

export function speakTicketNative(phrase, { localOnly = false } = {}) {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return resolve();
    }

    try {
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();

      if (!ptVoice) loadVoices();
      // Frase com nome de paciente: só voz instalada no aparelho. Sem voz local, fica apenas a campainha.
      const validPtVoice = localOnly ? ptVoiceLocal : ptVoiceLocal || ptVoice;

      if (!validPtVoice) {
        return resolve();
      }

      const utterance = new SpeechSynthesisUtterance(phrase);
      activeUtterance = utterance;
      utterance.lang = 'pt-BR';
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      utterance.voice = validPtVoice;

      let hasEnded = false;
      const finish = () => {
        if (!hasEnded) {
          hasEnded = true;
          clearTimeout(safetyTimer);
          utterance.onend = null;
          utterance.onerror = null;
          activeUtterance = null;
          resolve();
        }
      };

      utterance.onend = finish;
      utterance.onerror = finish;
      const safetyTimer = setTimeout(finish, Math.max(7000, Math.min(20000, 3000 + phrase.length * 90)));

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      activeUtterance = null;
      resolve();
    }
  });
}

export function prepareTtsAudio(phrase) {
  if (typeof window === 'undefined' || isServerTtsAvailable === false || !isRemoteTtsPhraseAllowed(phrase)) {
    return { audio: null, readyPromise: Promise.resolve(null) };
  }
  try {
    const url = `/api/tts?text=${encodeURIComponent(phrase)}`;
    const audio = new Audio();
    audio.preload = 'auto';
    audio.volume = 1.0;
    audio.src = url;
    audio.load();
    const readyPromise = new Promise((resolve) => {
      const onReady = () => {
        cleanup();
        resolve(audio);
      };
      const onError = () => {
        cleanup();
        resolve(null);
      };
      const timer = setTimeout(() => {
        cleanup();
        resolve(null);
      }, 1600);
      const cleanup = () => {
        clearTimeout(timer);
        audio.removeEventListener('canplaythrough', onReady);
        audio.removeEventListener('error', onError);
      };
      audio.addEventListener('canplaythrough', onReady, { once: true });
      audio.addEventListener('error', onError, { once: true });
    });
    return { audio, readyPromise };
  } catch {
    return { audio: null, readyPromise: Promise.resolve(null) };
  }
}

export function playPreparedTts(audio, phrase) {
  return new Promise((resolve, reject) => {
    if (!audio) return reject(new Error('Áudio não fornecido'));
    if (typeof window !== 'undefined') {
      window._activeTtsAudio = audio;
    }
    let finished = false;
    const done = (success) => {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        try {
          audio.onended = null;
          audio.onerror = null;
          audio.pause();
          audio.src = '';
          audio.load();
        } catch {}
        if (typeof window !== 'undefined') {
          window._activeTtsAudio = null;
        }
        if (success) resolve();
        else reject(new Error('Audio playback failed'));
      }
    };
    const timeoutMs = Math.max(7000, Math.min(20000, 3000 + phrase.length * 90));
    const timer = setTimeout(() => done(false), timeoutMs);
    audio.onended = () => done(true);
    audio.onerror = () => done(false);
    const p = audio.play();
    if (p !== undefined) {
      p.catch(() => done(false));
    }
  });
}

export async function speakTicket(
  ticketOrNumber,
  desk,
  { onStart, preloadedAudio, readyPromise, phrase: directPhrase } = {}
) {
  const phrase = directPhrase || formatTextForSpeech(ticketOrNumber, desk);
  const remoteAllowed = isRemoteTtsPhraseAllowed(phrase);
  if (onStart) onStart();

  const now = Date.now();
  // Circuit breaker: se já passou o tempo de cooldown de 5 minutos, permite nova tentativa do TTS remoto
  if (isServerTtsAvailable === false && now - lastTtsFailureTime > TTS_RECOVERY_COOLDOWN_MS) {
    isServerTtsAvailable = null;
  }

  // 1. Tenta usar o áudio pré-carregado em paralelo durante a campainha
  if (remoteAllowed && isServerTtsAvailable !== false && readyPromise) {
    try {
      const audio = await readyPromise;
      if (audio) {
        await playPreparedTts(audio, phrase);
        isServerTtsAvailable = true;
        return;
      }
    } catch (err) {
      // Falhou o pré-carregamento, tenta os caminhos de fallback
    }
  }

  // 2. Tenta prioritariamente via endpoint remoto caso esteja disponível e responsivo (nunca com nomes)
  if (remoteAllowed && isServerTtsAvailable !== false) {
    try {
      await speakTicketViaEndpoint(phrase);
      isServerTtsAvailable = true; // Restaura circuit breaker automaticamente em caso de sucesso
      return;
    } catch (err) {
      isServerTtsAvailable = false; // Degrada graciosamente
      lastTtsFailureTime = Date.now();
      console.warn('[TTS Remote Warning - Usando voz nativa direta]', err.message);
    }
  }

  // 3. Fallback imediato para voz nativa do navegador
  try {
    await speakTicketNative(phrase, { localOnly: !remoteAllowed });
  } catch (nativeErr) {
    console.warn('[TTS Native Warning]', nativeErr);
  }
}

export async function announceTicket(ticketOrNumber, desk, { onChimeStart, onSpeechStart } = {}) {
  unlockAudio();
  const phrase = formatTextForSpeech(ticketOrNumber, desk);

  // Problema 6: Dispara preparação do TTS remoto em paralelo com o toque da campainha
  const { audio: preloadedAudio, readyPromise } = prepareTtsAudio(phrase);

  if (onChimeStart) onChimeStart();
  await playChimeSound();

  // Pausa mínima de 60ms apenas para o decaimento acústico da onda senoidal sem silêncio artificial
  await new Promise((r) => setTimeout(r, 60));
  await speakTicket(ticketOrNumber, desk, {
    onStart: onSpeechStart,
    preloadedAudio,
    readyPromise,
    phrase,
  });
}
