// Intervalo que não é estrangulado em aba oculta.
// O Chrome reduz setInterval de abas em segundo plano para ~1x/minuto, o que derrubaria o heartbeat
// do médico (janela de 45s no backend). Timers dentro de um Worker não sofrem esse estrangulamento.
export function createTicker(callback, intervalMs) {
  let worker = null;
  let url = null;
  let fallbackTimer = null;

  try {
    if (typeof Worker !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined') {
      const code = `const t=setInterval(()=>postMessage(1),${Number(intervalMs)});onmessage=()=>{clearInterval(t);close()};`;
      url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
      worker = new Worker(url);
      worker.onmessage = () => callback();
      worker.onerror = () => {
        if (!fallbackTimer) fallbackTimer = setInterval(callback, intervalMs);
        try {
          worker.terminate();
        } catch {}
      };
    }
  } catch {
    worker = null;
  }
  if (!worker) fallbackTimer = setInterval(callback, intervalMs);

  // Ao voltar para a aba, bate imediatamente em vez de esperar o próximo ciclo.
  const onVisible = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') callback();
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);

  return () => {
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
    if (fallbackTimer) clearInterval(fallbackTimer);
    if (worker) {
      try {
        worker.postMessage('stop');
        worker.terminate();
      } catch {}
    }
    if (url) URL.revokeObjectURL(url);
  };
}
