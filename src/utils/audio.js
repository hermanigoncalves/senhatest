// Motor de Áudio e Voz Sintetizada Ultra-Robusto com Suporte a Autoplay do Navegador

let audioCtx = null;
let ptVoice = null;
let audioUnlocked = false;

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

/**
 * Tenta desbloquear o áudio no navegador
 */
export function unlockAudio() {
  try {
    const ctx = getAudioContext();
    if (ctx) {
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      
      // Toca buffer silencioso de 0.01s para destravar o Web Audio API no Chrome/Safari/iOS
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);

      audioUnlocked = ctx.state === 'running';
    }

    if ('speechSynthesis' in window) {
      window.speechSynthesis.resume();
      const silentUtterance = new SpeechSynthesisUtterance('');
      silentUtterance.volume = 0.001;
      window.speechSynthesis.speak(silentUtterance);
    }

    return audioUnlocked;
  } catch (err) {
    console.warn('[Audio Unlock Error]', err);
    return false;
  }
}

/**
 * Inicializa ouvintes transparentes na página da TV para destravar áudio no 1º clique ou toque do controle remoto
 */
export function initAudioAutoUnlock(onUnlockedCallback) {
  const events = ['touchstart', 'touchend', 'click', 'keydown', 'pointerdown'];

  const handleUnlock = () => {
    const isOk = unlockAudio();
    if (onUnlockedCallback) {
      onUnlockedCallback(isOk || (audioCtx && audioCtx.state === 'running'));
    }
  };

  events.forEach(evt => {
    document.addEventListener(evt, handleUnlock, { capture: true, passive: true });
    window.addEventListener(evt, handleUnlock, { capture: true, passive: true });
  });

  // Tenta destravar imediato se o navegador permitir autoplay sem gesto
  handleUnlock();
}

/**
 * Toca o BIP estilo "Ding-Dong" metálico
 */
export function playChimeSound() {
  return new Promise((resolve) => {
    try {
      const ctx = getAudioContext();
      if (!ctx) return resolve();

      // Força o resume se o contexto estiver suspenso
      if (ctx.state === 'suspended') {
        ctx.resume().then(() => playOscillators(ctx, resolve)).catch(() => resolve());
      } else {
        playOscillators(ctx, resolve);
      }
    } catch (err) {
      console.error('[Chime Error]', err);
      resolve();
    }
  });
}

function playOscillators(ctx, resolve) {
  try {
    const now = ctx.currentTime;

    // "Ding" (G5 - 783.99 Hz)
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

    // "Dong" (E5 - 659.25 Hz)
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

    setTimeout(() => resolve(), 1200);
  } catch (e) {
    resolve();
  }
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
 * Sequência completa de chamada: 1º BIP -> 2º Pausa -> 3º Voz Sintetizada
 */
export async function announceTicket(number, desk) {
  // Garante que tenta retomar o AudioContext antes do disparo
  unlockAudio();
  
  await playChimeSound();
  await new Promise(r => setTimeout(r, 250));
  await speakTicket(number, desk);
}
