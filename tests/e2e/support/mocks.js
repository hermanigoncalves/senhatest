// Helpers para testes E2E sem rede real: Supabase (REST, Auth, WebSocket) e mídia são simulados.
export const isSupabase = (url) => /\.supabase\.co$/.test(new URL(url).hostname);

export const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/** Intercepta o Supabase. handlers: { rpcName: (payload, request) => body | {status, body} } */
export async function mockSupabase(page, { rpc = {}, rest = {}, auth = {}, functions = {} } = {}) {
  const calls = [];
  await page.route((url) => isSupabase(url.toString()), async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    calls.push({ method: request.method(), path: url.pathname, body: request.postData() });
    const rpcMatch = url.pathname.match(/\/rest\/v1\/rpc\/([^/]+)$/);
    const respond = (result) =>
      result && typeof result === 'object' && 'status' in result && 'body' in result
        ? json(route, result.body, result.status)
        : json(route, result ?? null);
    if (rpcMatch) {
      const handler = rpc[rpcMatch[1]];
      if (!handler) return json(route, { message: `rpc não mockada: ${rpcMatch[1]}` }, 404);
      return respond(await handler(request.postDataJSON?.() ?? null, request));
    }
    const restMatch = url.pathname.match(/\/rest\/v1\/([^/]+)$/);
    if (restMatch) {
      const handler = rest[restMatch[1]];
      return handler ? respond(await handler(request)) : json(route, []);
    }
    const fnMatch = url.pathname.match(/\/functions\/v1\/([^/]+)$/);
    if (fnMatch) {
      const handler = functions[fnMatch[1]];
      return handler ? respond(await handler(request.postDataJSON?.() ?? null, request)) : json(route, {}, 404);
    }
    if (url.pathname.includes('/auth/v1/')) {
      const key = `${request.method()} ${url.pathname.split('/auth/v1')[1]}`;
      const handler = auth[key];
      return handler ? respond(await handler(request)) : json(route, {});
    }
    return json(route, {}, 503);
  });
  await page.routeWebSocket((url) => isSupabase(url.toString()), (socket) => socket.close());
  return calls;
}

/** Sessão fictícia gravada no localStorage, no formato do supabase-js (chave sb-<ref>-auth-token). */
export async function seedSession(page, userId = 'user-1', ref = 'e2e-mock') {
  await page.addInitScript(
    ({ userId, ref }) => {
      const session = {
        access_token: 'e2e.access.token',
        refresh_token: 'e2e-refresh',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: userId, aud: 'authenticated', role: 'authenticated', email: 'e2e@example.com' },
      };
      localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(session));
    },
    { userId, ref }
  );
}

/** Substitui reprodução de mídia: registra play/pause do <video> e encerra os áudios curtos sozinhos. */
export async function stubMedia(page, { audio = 'suspended' } = {}) {
  await page.addInitScript((audioState) => {
    // AudioContext simulado: numa TV real o navegador mantém o contexto suspenso até o primeiro gesto.
    class FakeAudioContext {
      constructor() {
        this.state = audioState;
        this.currentTime = 0;
        this.destination = {};
      }
      resume() {
        return audioState === 'running' ? Promise.resolve() : new Promise(() => {});
      }
      createOscillator() {
        return { type: '', frequency: { setValueAtTime() {} }, connect() {}, start() {}, stop() {} };
      }
      createGain() {
        return {
          gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
          connect() {},
        };
      }
    }
    window.AudioContext = FakeAudioContext;
    window.webkitAudioContext = FakeAudioContext;

    window.__media = { videoPlay: 0, videoPause: 0, audioPlay: 0 };
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (this instanceof HTMLVideoElement) {
        window.__media.videoPlay += 1;
        Object.defineProperty(this, 'paused', { value: false, configurable: true });
        return Promise.resolve();
      }
      window.__media.audioPlay += 1;
      setTimeout(() => this.dispatchEvent(new Event('ended')) || (this.onended && this.onended()), 30);
      return Promise.resolve();
    };
    const pause = HTMLMediaElement.prototype.pause;
    HTMLMediaElement.prototype.pause = function () {
      if (this instanceof HTMLVideoElement) {
        window.__media.videoPause += 1;
        Object.defineProperty(this, 'paused', { value: true, configurable: true });
      }
      return pause ? undefined : undefined;
    };
    HTMLMediaElement.prototype.load = function () {};
    void play;
  }, audio);
}
