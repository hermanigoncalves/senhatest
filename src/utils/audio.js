// Motor de Áudio Híbrido CMIP para TV (Web Audio + HTML5 Audio + SpeechSynthesis PT-BR)

let audioCtx = null;
let ptVoice = null;
let chimeAudioElement = null;

// Gera um arquivo WAV PCM de Bip "Ding-Dong" cristalino em Data URI
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

  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + numSamples * 2, true);
  view.setUint32(8, 0x57415645, false); // "WAVE"
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(36, 0x64617461, false); // "data"
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

export function getAudioContext() {
  if (!audioCtx) {
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

    if ('speechSynthesis' in window) {
      window.speechSynthesis.resume();
      const silentUtterance = new SpeechSynthesisUtterance('');
      silentUtterance.volume = 0.01;
      window.speechSynthesis.speak(silentUtterance);
    }
  } catch (e) {}
}

export function playChimeSound() {
  return new Promise((resolve) => {
    let played = false;

    // HTML5 Audio Playback
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
          setTimeout(resolve, 1100);
        }).catch(err => {
          console.warn('[HTML5 Audio Blocked by Browser Autoplay Policy]', err);
        });
      }
    } catch (e) {}

    // Web Audio API Playback (Dual Engine)
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
          gain1.gain.linearRampToValueAtTime(0.8, now + 0.04);
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
          gain2.gain.linearRampToValueAtTime(0.9, now + 0.35);
          gain2.gain.exponentialRampToValueAtTime(0.001, now + 1.3);
          osc2.connect(gain2);
          gain2.connect(ctx.destination);
          osc2.start(now + 0.3);
          osc2.stop(now + 1.3);

          if (!played) {
            setTimeout(resolve, 1100);
          }
        }
      }
    } catch (e) {}

    setTimeout(resolve, 1200);
  });
}

function formatTextForSpeech(number, desk) {
  let cleanNumber = String(number).replace(/^0+/, '');
  if (!cleanNumber) cleanNumber = '0';
  let cleanDesk = String(desk).replace(/0+(\d+)/, '$1');
  return `Senha ${cleanNumber}, ${cleanDesk}`;
}

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

export async function announceTicket(number, desk) {
  unlockAudio();
  await playChimeSound();
  await new Promise(r => setTimeout(r, 250));
  await speakTicket(number, desk);
}
