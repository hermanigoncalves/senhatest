import { supabaseAdmin } from '../src/utils/supabaseClient.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    try {
      await supabaseAdmin.from('tickets').delete().gte('id', 0);
    } catch (e) {
      console.error('[Supabase Delete Error]', e);
    }
    return res.status(200).json({ success: true, message: 'Fila zerada com sucesso no Supabase.' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
