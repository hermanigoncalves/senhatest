// Motor de Áudio Híbrido CMIP para TV com Seleção de Vozes Nativas em PT-BR

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

/**
 * Seleciona a melhor voz disponível no dispositivo para o Português (PT-BR)
 */
function loadVoices() {
  if (!('speechSynthesis' in window)) return null;

  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  const ptVoices = voices.filter(v => v.lang && (v.lang.includes('pt-BR') || v.lang.includes('pt_BR') || v.lang.includes('pt')));
  
  if (ptVoices.length > 0) {
    const preferredVoice = ptVoices.find(v => 
      /female|mulher|luciana|maria|francisca|fernanda|helena|vitoria|vitória|google/i.test(v.name)
    );
    ptVoice = preferredVoice || ptVoices[0];
  } else {
    ptVoice = voices[0];
  }
  return ptVoice;
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  loadVoices();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = () => {
      loadVoices();
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
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();
      
      // Pré-aquecimento (warmup) do motor de voz do navegador para não falhar no 1º número
      const warmupUtterance = new SpeechSynthesisUtterance(' ');
      warmupUtterance.volume = 0.01;
      warmupUtterance.rate = 10;
      window.speechSynthesis.speak(warmupUtterance);
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
      loadVoices();
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
    if (ctx && ctx.state === 'running') {
      try {
        const now = ctx.currentTime;
        
        // Nota 1: "Ding" (G5 - 783.99Hz)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(783.99, now);
        gain1.gain.setValueAtTime(0, now);
        gain1.gain.linearRampToValueAtTime(0.8, now + 0.02);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.35);

        // Nota 2: "Dong" (E5 - 659.25Hz)
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(659.25, now + 0.16);
        gain2.gain.setValueAtTime(0, now + 0.16);
        gain2.gain.linearRampToValueAtTime(0.9, now + 0.18);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.16);
        osc2.stop(now + 0.42);

        setTimeout(safeResolve, 420);
        return;
      } catch (e) {}
    }

    // Fallback via elemento de Áudio HTML5
    try {
      if (!chimeAudioElement) {
        chimeAudioElement = new Audio(chimeDataUri);
      }
      chimeAudioElement.currentTime = 0;
      chimeAudioElement.volume = 1.0;
      
      const playPromise = chimeAudioElement.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          setTimeout(safeResolve, 450);
        }).catch(() => safeResolve());
      } else {
        safeResolve();
      }
    } catch (e) {
      safeResolve();
    }

    setTimeout(safeResolve, 500);
  });
}

function formatTextForSpeech(number, desk) {
  let cleanNumber = String(number).replace(/^0+/, '');
  if (!cleanNumber) cleanNumber = '0';
  let cleanDesk = String(desk).replace(/0+(\d+)/, '$1');
  return `Senha ${cleanNumber}, ${cleanDesk}`;
}

export function speakTicketOnline(phrase) {
  return new Promise((resolve) => {
    const text = encodeURIComponent(phrase);
    
    // Servidores TTS públicos com suporte a PT-BR e sem bloqueio de CORS/HTTP 403
    const ttsUrls = [
      `https://api.streamelements.com/kappa/v2/speech?voice=Vitoria&text=${text}`,
      `https://api.streamelements.com/kappa/v2/speech?voice=Camila&text=${text}`,
      `https://translate.google.com/translate_tts?ie=UTF-8&q=${text}&tl=pt-BR&client=tw-ob`
    ];

    let urlIdx = 0;

    function playUrl() {
      if (urlIdx >= ttsUrls.length) {
        console.warn('[TTS] Todos os servidores de voz online falharam.');
        return resolve();
      }

      const currentUrl = ttsUrls[urlIdx];
      urlIdx++;

      try {
        const audio = new Audio(currentUrl);
        audio.volume = 1.0;

        let hasResolved = false;
        const done = () => {
          if (!hasResolved) {
            hasResolved = true;
            resolve();
          }
        };

        audio.onended = done;
        audio.onerror = (err) => {
          console.warn(`[TTS Error] Falha no servidor ${currentUrl}, tentando próximo...`, err);
          if (!hasResolved) {
            playUrl();
          }
        };

        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.then(() => {}).catch((err) => {
            console.warn(`[TTS Autoplay Error] ${currentUrl}`, err);
            if (!hasResolved) {
              playUrl();
            }
          });
        }
      } catch (e) {
        playUrl();
      }
    }

    playUrl();
  });
}

export function speakTicket(number, desk) {
  return new Promise((resolve) => {
    const phrase = formatTextForSpeech(number, desk);

    // No navegador da TV Samsung Tizen, priorizamos o TTS Online por ter voz em Português garantida
    const isSamsungTv = typeof navigator !== 'undefined' && /Tizen|SmartTV|Samsung/i.test(navigator.userAgent);

    if (!isSamsungTv && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        window.speechSynthesis.resume();

        const currentVoice = ptVoice || loadVoices();
        const voices = window.speechSynthesis.getVoices();
        const validPtVoice = currentVoice || (voices && voices.find(v => v.lang && (v.lang.includes('pt-BR') || v.lang.includes('pt_BR') || v.lang.includes('pt'))));

        const utterance = new SpeechSynthesisUtterance(phrase);
        utterance.lang = 'pt-BR';
        utterance.rate = 0.95;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        if (validPtVoice) {
          utterance.voice = validPtVoice;
        }

        let hasEnded = false;
        const finish = () => {
          if (!hasEnded) {
            hasEnded = true;
            resolve();
          }
        };

        utterance.onend = finish;
        utterance.onerror = () => {
          if (!hasEnded) {
            hasEnded = true;
            speakTicketOnline(phrase).then(resolve);
          }
        };

        setTimeout(() => {
          if (!hasEnded) {
            hasEnded = true;
            try { window.speechSynthesis.cancel(); } catch (e) {}
            speakTicketOnline(phrase).then(resolve);
          }
        }, 3500);

        window.speechSynthesis.speak(utterance);
        return;
      } catch (err) {
        console.error('[Voz Nativa Error]', err);
      }
    }

    // Se for TV Samsung ou dispositivo sem voz nativa em PT-BR, usa o sintetizador online
    speakTicketOnline(phrase).then(resolve);
  });
}

export async function announceTicket(number, desk) {
  unlockAudio();
  await playChimeSound();
  await speakTicket(number, desk);
}


