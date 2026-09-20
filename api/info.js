import { supabase } from './_supabase.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { data: rows } = await supabase
      .from('tickets')
      .select('*')
      .order('id', { ascending: false })
      .limit(10);

    const formatBrasiliaTime = (dateObj = new Date()) => {
      return dateObj.toLocaleTimeString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit'
      });
    };

    let currentTicket = null;
    let history = [];
    let counter = 0;
    let callSequence = 0;

    if (rows && rows.length > 0) {
      currentTicket = {
        id: rows[0].id,
        callId: rows[0].call_id || rows[0].id,
        number: rows[0].number,
        rawNumber: rows[0].raw_number,
        desk: rows[0].desk,
        type: rows[0].type,
        timestamp: formatBrasiliaTime(new Date(rows[0].created_at))
      };
      history = rows.map(r => ({
        id: r.id,
        callId: r.call_id || r.id,
        number: r.number,
        rawNumber: r.raw_number,
        desk: r.desk,
        type: r.type,
        timestamp: formatBrasiliaTime(new Date(r.created_at))
      }));
      counter = rows[0].raw_number || 0;
      callSequence = rows[0].call_id || 0;
    }

    return res.status(200).json({
      status: 'online',
      platform: 'Vercel Serverless',
      state: {
        counter,
        callSequence,
        currentTicket,
        history,
        desks: ['Guichê 01', 'Guichê 02', 'Guichê 03', 'Guichê 04', 'Recepção CMIP']
      }
    });
  } catch (err) {
    return res.status(200).json({
      status: 'online',
      error: err.message,
      state: {
        counter: 0,
        callSequence: 0,
        currentTicket: null,
        history: [],
        desks: ['Guichê 01', 'Guichê 02', 'Guichê 03', 'Guichê 04', 'Recepção CMIP']
      }
    });
  }
}
