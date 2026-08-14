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

  const search = typeof window !== 'undefined' ? window.location.search : '';

  // Visão da TV
  const isTvView = currentPath === '/tv' || search.includes('tv=true');

  // Visão do Totem (Tablet de Autoatendimento)
  const isTotemView = currentPath === '/tablet' || currentPath === '/totem' || search.includes('tablet=true') || search.includes('totem=true');

  if (isTvView) {
    return <TvPanel />;
  }

  if (isTotemView) {
    return <TotemTablet />;
  }

  return <AttendantPanel />;
}
