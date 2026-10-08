import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { isRemoteTtsPhraseAllowed } from './src/utils/ttsPolicy.js';

// TTS local equivalente ao endpoint serverless usado em produção.
function cmipTtsDevPlugin() {
  return {
    name: 'cmip-tts-dev',
    configureServer(server) {
      server.middlewares.use('/api/tts', async (req, res) => {
        const requestUrl = new URL(req.url || '/', 'http://localhost');
        const text = (requestUrl.searchParams.get('text') || requestUrl.searchParams.get('q') || '').trim();
        if (!text || !isRemoteTtsPhraseAllowed(text)) {
          // Mesma política do /api/tts em produção: nomes de pacientes nunca saem do aparelho.
          res.statusCode = text ? 422 : 400;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: 'Texto ausente ou não permitido para síntese online.' }));
        }
        const providers = [
          `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=pt-BR&client=tw-ob`,
          `https://api.streamelements.com/kappa/v2/speech?voice=Vitoria&text=${encodeURIComponent(text)}`,
        ];
        for (const url of providers) {
          try {
            const response = await fetch(url, {
              headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://translate.google.com/' },
              signal: AbortSignal.timeout(6000),
            });
            if (!response.ok) continue;
            const bytes = Buffer.from(await response.arrayBuffer());
            res.statusCode = 200;
            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader('Cache-Control', 'public, max-age=86400');
            return res.end(bytes);
          } catch (_) {}
        }
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Falha ao sintetizar áudio.' }));
      });
    },
  };
}

// Falha o build (e não só a página em runtime) quando o Supabase não está configurado.
function requireSupabaseEnv(mode, command) {
  if (command !== 'build' || mode === 'test') return;
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env };
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      'Build abortado: defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY (veja .env.example).'
    );
  }
}

export default defineConfig(({ mode, command }) => {
  requireSupabaseEnv(mode, command);
  return {
    base: '/',
    plugins: [react(), cmipTtsDevPlugin()],
    server: {
      host: true,
      port: 5173,
    },
  };
});
