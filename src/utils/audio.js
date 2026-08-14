// Motor de Áudio & Voz Híbrido CMIP para TV com Seleção de Vozes Nativas em PT-BR
// Blindagem contra congelamento do Chromium (Heartbeat, Global Anchoring & Auto-Resume)

let audioCtx = null;
let ptVoice = null;
let chimeAudioElement = null;

// Garante que o motor do navegador nunca entre em sono silencioso
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  setInterval(() => {
    try {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    } catch (e) {}
  }, 3000);
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
 * Carrega e seleciona a melhor voz disponível em PT-BR
 */
function loadVoices() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;

  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  const ptVoices = voices.filter(v => v.lang && (v.lang.includes('pt-BR') || v.lang.includes('pt_BR') || v.lang.includes('pt')));

  if (ptVoices.length > 0) {
    const preferredVoice = ptVoices.find(v => 
      /female|mulher|luciana|maria|leticia|francisca|fernanda|helena|vitoria|vitória|google.*português/i.test(v.name)
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
      loadVoices();
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
          gain1.gain.linearRampToValueAtTime(0.8, now + 0.02);
          gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
          osc1.connect(gain1);
          gain1.connect(ctx.destination);
          osc1.start(now);
          osc1.stop(now + 0.3);

          // Nota 2: "Dong" (E5 - 659.25Hz)
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(659.25, now + 0.15);
          gain2.gain.setValueAtTime(0, now + 0.15);
          gain2.gain.linearRampToValueAtTime(0.9, now + 0.17);
          gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
          osc2.connect(gain2);
          gain2.connect(ctx.destination);
          osc2.start(now + 0.15);
          osc2.stop(now + 0.38);

          setTimeout(safeResolve, 220);
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

    setTimeout(safeResolve, 220);
  });
}

/**
 * Formata o texto para fala dependendo se for chamada médica nominal ou senha numérica
 */
export function formatMedicalSpeech(ticket) {
  if (!ticket) return 'Próximo atendimento CMIP';

  // Se for chamada nominal de paciente
  if (ticket.patientName || ticket.patient_name) {
    const patient = (ticket.patientName || ticket.patient_name || '').trim();
    const office = (ticket.officeName || ticket.office_name || ticket.desk || 'Consultório').trim();
    const doctor = (ticket.doctorName || ticket.doctor_name || '').trim();
    const isPriority = ticket.type === 'Preferencial';

    let prefix = isPriority ? 'Atenção, atendimento preferencial. ' : 'Atenção. ';
    let phrase = `${prefix}Paciente ${patient}, dirigir-se ao ${office}`;
    if (doctor) {
      phrase += `, ${doctor}`;
    }
    return phrase;
  }

  // Fallback para senha numérica tradicional
  let cleanNumber = String(ticket.number || '').replace(/^0+/, '');
  if (!cleanNumber) cleanNumber = '0';
  let cleanDesk = String(ticket.desk || 'Atendimento').replace(/0+(\d+)/, '$1');
  return `Senha ${cleanNumber}, ${cleanDesk}`;
}

export function speakTicketOnline(phrase) {
  return new Promise((resolve) => {
    const text = encodeURIComponent(phrase);
    const ttsUrls = [
      `https://api.streamelements.com/kappa/v2/speech?voice=Vitoria&text=${text}`,
      `https://translate.google.com/translate_tts?ie=UTF-8&q=${text}&tl=pt-BR&client=tw-ob`
    ];

    let urlIdx = 0;

    function playUrl() {
      if (urlIdx >= ttsUrls.length) {
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

        const timer = setTimeout(() => {
          if (!hasResolved) {
            hasResolved = true;
            playUrl();
          }
        }, 3000);

        audio.onended = () => {
          clearTimeout(timer);
          done();
        };

        audio.onerror = () => {
          clearTimeout(timer);
          if (!hasResolved) {
            hasResolved = true;
            playUrl();
          }
        };

        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.then(() => {}).catch(() => {
            clearTimeout(timer);
            if (!hasResolved) {
              hasResolved = true;
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

export function speakTicket(ticket) {
  return new Promise((resolve) => {
    const phrase = typeof ticket === 'string' ? ticket : formatMedicalSpeech(ticket);
    const isSamsungTv = typeof navigator !== 'undefined' && /Tizen|SmartTV|Samsung/i.test(navigator.userAgent);

    if (!isSamsungTv && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        window.speechSynthesis.resume();

        const voices = window.speechSynthesis.getVoices();
        const validPtVoice = ptVoice || (voices && voices.find(v => v.lang && (v.lang.includes('pt-BR') || v.lang.includes('pt_BR') || v.lang.includes('pt')))) || (voices && voices[0]);

        const utterance = new SpeechSynthesisUtterance(phrase);
        utterance.lang = 'pt-BR';
        utterance.rate = 0.93; // Cadência pausada e elegante para ambiente de saúde
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        if (validPtVoice) {
          utterance.voice = validPtVoice;
        }

        // ANCORAMENTO GLOBAL CONTRA GARBAGE COLLECTION DO CHROMIUM
        window._activeUtterance = utterance;

        let hasEnded = false;
        let safetyTimeout = null;

        const finish = () => {
          if (!hasEnded) {
            hasEnded = true;
            if (safetyTimeout) clearTimeout(safetyTimeout);
            window._activeUtterance = null;
            resolve();
          }
        };

        utterance.onend = finish;
        utterance.onerror = (err) => {
          console.warn('[SpeechSynthesis Error, ativando fallback online]', err);
          if (!hasEnded) {
            hasEnded = true;
            if (safetyTimeout) clearTimeout(safetyTimeout);
            window._activeUtterance = null;
            speakTicketOnline(phrase).then(resolve);
          }
        };

        // Timeout estrito de segurança (5s)
        safetyTimeout = setTimeout(() => {
          window.speechSynthesis.cancel();
          finish();
        }, 5000);

        window.speechSynthesis.speak(utterance);
        return;
      } catch (err) {
        console.error('[Voz Nativa Exception]', err);
      }
    }

    speakTicketOnline(phrase).then(resolve);
  });
}

export async function announceTicket(ticket) {
  unlockAudio();
  await playChimeSound();
  await speakTicket(ticket);
}
