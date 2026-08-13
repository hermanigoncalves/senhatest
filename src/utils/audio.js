// Motor de Áudio Híbrido (HTML5 Audio + Web Audio API + SpeechSynthesis PT-BR)
// Garante reprodução automática do BIP e da VOZ sem bloqueios

let audioCtx = null;
let ptVoice = null;
let chimeAudioElement = null;

// Gera um arquivo WAV PCM de Bip "Ding-Dong" cristalino embutido em Data URI
function generateChimeDataUri() {
  const sampleRate = 22050;
  const duration = 1.2; // 1.2 segundos
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Int16Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let freq = 0;
    let vol = 0;

    if (t < 0.45) {
      // Nota "Ding" (783.99 Hz - G5)
      freq = 783.99;
      vol = Math.max(0, 1 - t / 0.45) * 0.7;
    } else if (t >= 0.35 && t < 1.2) {
      // Nota "Dong" (659.25 Hz - E5)
      const t2 = t - 0.35;
      freq = 659.25;
      vol = Math.max(0, 1 - t2 / 0.85) * 0.8;
    }

    const sample = Math.sin(2 * Math.PI * freq * t) * vol * 32767;
    buffer[i] = Math.max(-32768, Math.min(32767, sample));
  }

  // Cria o cabeçalho WAV
  const wavHeader = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(wavHeader);

  /* RIFF identifier */
  view.setUint32(0, 0x52494646, false); // "RIFF"
  /* file length */
  view.setUint32(4, 36 + numSamples * 2, true);
  /* RIFF type */
  view.setUint32(8, 0x57415645, false); // "WAVE"
  /* format chunk identifier */
  view.setUint32(12, 0x666d7420, false); // "fmt "
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw) */
  view.setUint16(20, 1, true);
  /* channel count */
  view.setUint16(22, 1, true); // Mono
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * 2, true);
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, 2, true);
  /* bits per sample */
  view.setUint16(34, 16, true);
  /* data chunk identifier */
  view.setUint32(36, 0x64617461, false); // "data"
  /* data chunk length */
  view.setUint32(40, numSamples * 2, true);

  // Copia o buffer de áudio para o DataView
  const bytes = new Uint8Array(wavHeader);
  const pcmBytes = new Uint8Array(buffer.buffer);
  bytes.set(pcmBytes, 44);

  // Converte para Base64 Data URI
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return 'data:audio/wav;base64,' + btoa(binary);
}

// Pré-inicializa o elemento de áudio HTML5
const chimeDataUri = generateChimeDataUri();

function getChimeAudioElement() {
  if (!chimeAudioElement) {
    chimeAudioElement = new Audio(chimeDataUri);
    chimeAudioElement.preload = 'auto';
  }
  return chimeAudioElement;
}

function loadVoices() {
  if ('speechSynthesis' in window) {
    const voices = window.speechSynthesis.getVoices();
    ptVoice = voices.find(v => v.lang.includes('pt-BR') || v.lang.includes('pt_BR') || v.lang.includes('pt')) || voices[0];
  }
}

if ('speechSynthesis' in window) {
  loadVoices();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }
}

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function unlockAudio() {
  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    if ('speechSynthesis' in window) {
      window.speechSynthesis.resume();
      const silentUtterance = new SpeechSynthesisUtterance('');
      silentUtterance.volume = 0.001;
      window.speechSynthesis.speak(silentUtterance);
    }
  } catch (e) {}
}

export function initAudioAutoUnlock() {
  const events = ['touchstart', 'touchend', 'click', 'keydown', 'pointerdown', 'mousemove', 'scroll'];

  const handleUnlock = () => {
    unlockAudio();
    // Pre-play silencioso do HTML5 Audio no 1º movimento para destravar o elemento
    const audioEl = getChimeAudioElement();
    if (audioEl) {
      audioEl.volume = 0.001;
      audioEl.play().then(() => {
        audioEl.pause();
        audioEl.currentTime = 0;
        audioEl.volume = 1.0;
      }).catch(() => {});
    }
  };

  events.forEach(evt => {
    document.addEventListener(evt, handleUnlock, { capture: true, passive: true });
    window.addEventListener(evt, handleUnlock, { capture: true, passive: true });
  });

  handleUnlock();
}

/**
 * Toca o BIP (Ding-Dong) 100% automático via HTML5 Audio + Web Audio Dual Engine
 */
export function playChimeSound() {
  return new Promise((resolve) => {
    let played = false;

    // 1. Tenta reproduzir via HTML5 Audio element (Ignora bloqueio de AudioContext)
    try {
      const audioEl = getChimeAudioElement();
      if (audioEl) {
        audioEl.currentTime = 0;
        audioEl.volume = 1.0;
        audioEl.play()
          .then(() => {
            played = true;
            setTimeout(resolve, 1100);
          })
          .catch((err) => {
            console.warn('[HTML5 Audio fallback...]', err);
          });
      }
    } catch (e) {}

    // 2. Tenta reproduzir via Web Audio API simultaneamente
    try {
      const ctx = getAudioContext();
      if (ctx) {
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }

        const now = ctx.currentTime;
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(783.99, now);
        gain1.gain.setValueAtTime(0, now);
        gain1.gain.linearRampToValueAtTime(0.7, now + 0.04);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.7);

        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(659.25, now + 0.3);
        gain2.gain.setValueAtTime(0, now + 0.3);
        gain2.gain.linearRampToValueAtTime(0.8, now + 0.35);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 1.3);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.3);
        osc2.stop(now + 1.3);

        if (!played) {
          setTimeout(resolve, 1100);
        }
      }
    } catch (e) {
      if (!played) resolve();
    }

    // Fallback de segurança para não travar a promessa
    setTimeout(resolve, 1200);
  });
}

function formatTextForSpeech(number, desk) {
  let cleanNumber = String(number).replace(/^0+/, '');
  if (!cleanNumber) cleanNumber = '0';
  let cleanDesk = String(desk).replace(/0+(\d+)/, '$1');
  return `Senha ${cleanNumber}, ${cleanDesk}`;
}

/**
 * Anuncia a senha em voz alta em Português
 */
export function speakTicket(number, desk) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) return resolve();

    try {
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();

      const phrase = formatTextForSpeech(number, desk);
      const utterance = new SpeechSynthesisUtterance(phrase);
      
      utterance.lang = 'pt-BR';
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      if (!ptVoice) loadVoices();
      if (ptVoice) utterance.voice = ptVoice;

      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();

      window.speechSynthesis.speak(utterance);

    } catch (err) {
      console.error('[Voz Error]', err);
      resolve();
    }
  });
}

/**
 * Sequência completa de chamada: 1º BIP -> 2º Pausa -> 3º Fala em Voz Alta
 */
export async function announceTicket(number, desk) {
  unlockAudio();
  await playChimeSound();
  await new Promise(r => setTimeout(r, 250));
  await speakTicket(number, desk);
}
