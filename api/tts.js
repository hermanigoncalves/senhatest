export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  const text = String(req.query.text || req.query.q || '').trim();
  if (!text) {
    return res.status(400).json({ error: 'Parâmetro text é obrigatório.' });
  }
  if (text.length > 250) {
    return res.status(400).json({ error: 'Texto excede o limite permitido.' });
  }

  const providers = [
    {
      url: `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=pt-BR&client=tw-ob`,
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://translate.google.com/'
      }
    },
    {
      url: `https://api.streamelements.com/kappa/v2/speech?voice=Vitoria&text=${encodeURIComponent(text)}`,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }
  ];

  for (const provider of providers) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const response = await fetch(provider.url, { headers: provider.headers, signal: controller.signal });
      clearTimeout(timer);
      if (!response.ok) continue;

      const buffer = await response.arrayBuffer();
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
      return res.status(200).send(Buffer.from(buffer));
    } catch (err) {
      console.warn('[TTS provider error]', err?.message || err);
    }
  }

  return res.status(502).json({ error: 'Falha ao sintetizar áudio nos provedores de TTS.' });
}
