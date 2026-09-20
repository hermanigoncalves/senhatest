import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Mantém no Vite/LAN o mesmo TTS server-side que já funcionava nas TVs do CMIP antigo.
// Assim `npm run dev -- --host` não depende de um segundo processo Express apenas para voz.
function cmipTtsDevPlugin() {
  return {
    name: 'cmip-tts-dev',
    configureServer(server) {
      server.middlewares.use('/api/tts', async (req, res) => {
        const requestUrl = new URL(req.url || '/', 'http://localhost')
        const text = (requestUrl.searchParams.get('text') || requestUrl.searchParams.get('q') || '').trim()
        if (!text) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          return res.end(JSON.stringify({ error: 'Parâmetro text é obrigatório.' }))
        }
        const providers = [
          `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=pt-BR&client=tw-ob`,
          `https://api.streamelements.com/kappa/v2/speech?voice=Vitoria&text=${encodeURIComponent(text)}`
        ]
        for (const url of providers) {
          try {
            const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://translate.google.com/' } })
            if (!response.ok) continue
            const bytes = Buffer.from(await response.arrayBuffer())
            res.statusCode = 200
            res.setHeader('Content-Type', 'audio/mpeg')
            res.setHeader('Cache-Control', 'public, max-age=86400')
            res.setHeader('Access-Control-Allow-Origin', '*')
            return res.end(bytes)
          } catch (_) {}
        }
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: 'Falha ao sintetizar áudio.' }))
      })
    }
  }
}

export default defineConfig({
  base: '/',
  plugins: [react(), cmipTtsDevPlugin()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/socket.io': { target: 'http://localhost:3001', ws: true },
      '/api/medical': { target: 'http://localhost:3001' },
      '/api/ticket': { target: 'http://localhost:3001' },
      '/api/info': { target: 'http://localhost:3001' },
      '/api/reset': { target: 'http://localhost:3001' }
    }
  }
})
