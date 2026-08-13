import React, { useState, useEffect } from 'react';
import AttendantPanel from './components/AttendantPanel';
import TvPanel from './components/TvPanel';

export default function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    const handlePopState = () => setCurrentPath(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Se o caminho for /tv ou a URL tiver ?tv=true
  const isTvView = currentPath === '/tv' || window.location.search.includes('tv=true');

  if (isTvView) {
    return <TvPanel />;
  }

  return <AttendantPanel />;
}
