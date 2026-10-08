// "/tv", "/tv/" e "/tv/<slug>" são rotas de TV. "/tvqualquercoisa" não é.
export function isTvPath(pathname = '') {
  return pathname === '/tv' || pathname.startsWith('/tv/');
}

export function tvSlug(pathname = '', search = '', fallback = 'recepcao') {
  const fromQuery = new URLSearchParams(search).get('panel');
  if (fromQuery) return fromQuery;
  const segment = pathname.split('/')[2];
  if (!segment) return fallback;
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
