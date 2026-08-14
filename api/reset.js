import { supabaseAdmin } from './_supabase.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    try {
      await supabaseAdmin.from('tickets').delete().gt('id', 0);
      await supabaseAdmin.from('tickets').delete().gte('raw_number', 0);
    } catch (e) {
      console.error('[Supabase Delete Error]', e);
    }
    return res.status(200).json({
      success: true,
      message: 'Fila zerada com sucesso no Supabase.',
      state: {
        counter: 0,
        callSequence: 0,
        currentTicket: null,
        history: [],
        desks: ['Guichê 01', 'Guichê 02', 'Guichê 03', 'Guichê 04', 'Recepção CMIP']
      }
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
