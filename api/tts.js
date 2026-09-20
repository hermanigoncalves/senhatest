export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const text = (req.query.text || req.query.q || '').trim();
  if (!text) {
    return res.status(400).json({ error: 'Parâmetro text é obrigatório.' });
  }

  // Tenta primeiro o Google Translate TTS com headers de servidor
  try {
    const encoded = encodeURIComponent(text);
    const googleUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encoded}&tl=pt-BR&client=tw-ob`;
    
    const response = await fetch(googleUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://translate.google.com/'
      }
    });

    if (response.ok) {
      const buffer = await response.arrayBuffer();
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
      return res.status(200).send(Buffer.from(buffer));
    }
  } catch (err) {
    console.warn('[TTS Google Error]', err.message);
  }

  // Fallback para StreamElements (Voz Vitória em PT-BR)
  try {
    const encoded = encodeURIComponent(text);
    const seUrl = `https://api.streamelements.com/kappa/v2/speech?voice=Vitoria&text=${encoded}`;
    
    const seResponse = await fetch(seUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });

    if (seResponse.ok) {
      const buffer = await seResponse.arrayBuffer();
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
      return res.status(200).send(Buffer.from(buffer));
    }
  } catch (seErr) {
    console.warn('[TTS StreamElements Error]', seErr.message);
  }

  return res.status(502).json({ error: 'Falha ao sintetizar áudio nos provedores de TTS.' });
}
