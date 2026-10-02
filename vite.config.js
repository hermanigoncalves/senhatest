import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// TTS local equivalente ao endpoint serverless usado em produção.
function cmipTtsDevPlugin() {
  return {
    name: 'cmip-tts-dev',
    configureServer(server) {
      server.middlewares.use('/api/tts', async (req, res) => {
        const requestUrl = new URL(req.url || '/', 'http://localhost')
        const text = (requestUrl.searchParams.get('text') || requestUrl.searchParams.get('q') || '').trim()
        if (!text || text.length > 250) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          return res.end(JSON.stringify({ error: 'Texto ausente ou acima do limite permitido.' }))
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
    port: 5173
  }
})
