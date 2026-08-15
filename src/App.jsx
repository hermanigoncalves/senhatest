import React, { useState, useEffect } from 'react';
import AttendantPanel from './components/AttendantPanel';
import TvPanel from './components/TvPanel';
import TotemTablet from './components/TotemTablet';

export default function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    const handlePopState = () => setCurrentPath(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const path = currentPath.toLowerCase();
  const search = typeof window !== 'undefined' ? window.location.search.toLowerCase() : '';

  // 1. Rota: TV DA RECEPÇÃO (Apenas Senhas / Guichês)
  const isTvRecepcao = path === '/tv-recepcao' || path === '/tv_recepcao' || search.includes('tv=recepcao') || search.includes('channel=recepcao');

  // 2. Rota: TV CONSULTÓRIOS 01 (Térreo / Ala A)
  const isTv1 = path === '/tv1' || path === '/tv-medica-1' || path === '/tv-1' || search.includes('tv=1') || search.includes('channel=1') || search.includes('tvid=1');

  // 3. Rota: TV CONSULTÓRIOS 02 (1º Andar / Ala B)
  const isTv2 = path === '/tv2' || path === '/tv-medica-2' || path === '/tv-2' || search.includes('tv=2') || search.includes('channel=2') || search.includes('tvid=2');

  // 4. Rota: TV GERAL
  const isTvGeral = path === '/tv' || path === '/tv-geral' || search.includes('tv=true') || search.includes('tv=all');

  // 5. Visão do Totem (Tablet de Autoatendimento da Recepção)
  const isTotemView = path === '/tablet' || path === '/totem' || search.includes('tablet=true') || search.includes('totem=true');

  if (isTvRecepcao) {
    return <TvPanel initialTvId="recepcao" />;
  }

  if (isTv1) {
    return <TvPanel initialTvId="1" />;
  }

  if (isTv2) {
    return <TvPanel initialTvId="2" />;
  }

  if (isTvGeral) {
    return <TvPanel initialTvId="all" />;
  }

  if (isTotemView) {
    return <TotemTablet />;
  }

  return <AttendantPanel />;
}
