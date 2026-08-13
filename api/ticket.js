import { supabase, supabaseAdmin } from '../src/utils/supabaseClient.js';

let memoryState = {
  counter: 0,
  callSequence: 0,
  currentTicket: null,
  history: [],
  desks: ['Guichê 01', 'Guichê 02', 'Guichê 03', 'Guichê 04', 'Recepção CMIP']
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const formatBrasiliaTime = (dateObj = new Date()) => {
    return dateObj.toLocaleTimeString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (req.method === 'GET') {
    try {
      const { data: rows, error } = await supabase
        .from('tickets')
        .select('*')
        .order('id', { ascending: false })
        .limit(10);

      if (!error && rows && rows.length > 0) {
        const current = {
          id: rows[0].id,
          callId: rows[0].call_id || rows[0].id,
          number: rows[0].number,
          rawNumber: rows[0].raw_number,
          desk: rows[0].desk,
          type: rows[0].type,
          timestamp: formatBrasiliaTime(new Date(rows[0].created_at))
        };

        const history = rows.map(r => ({
          id: r.id,
          callId: r.call_id || r.id,
          number: r.number,
          rawNumber: r.raw_number,
          desk: r.desk,
          type: r.type,
          timestamp: formatBrasiliaTime(new Date(r.created_at))
        }));

        const counter = rows[0].raw_number || memoryState.counter;
        const callSequence = rows[0].call_id || memoryState.callSequence;

        memoryState.counter = counter;
        memoryState.callSequence = callSequence;
        memoryState.currentTicket = current;
        memoryState.history = history;

        return res.status(200).json({
          counter,
          callSequence,
          currentTicket: current,
          history,
          desks: memoryState.desks
        });
      }
    } catch (err) {
      console.error('[Supabase GET Error]', err);
    }
    return res.status(200).json(memoryState);
  }

  if (req.method === 'POST') {
    const { action, desk = 'Guichê 01', ticketType = 'Normal', customNumber, initialNumber } = req.body || {};

    if (action === 'set-initial-ticket' && initialNumber) {
      const num = parseInt(initialNumber, 10);
      if (!isNaN(num) && num >= 1 && num <= 1000) {
        memoryState.counter = num - 1;
        return res.status(200).json({
          success: true,
          message: `Próxima senha iniciará em ${String(num).padStart(4, '0')}`,
          state: memoryState
        });
      }
    }

    let formattedNumber = '';
    let nextCounter = memoryState.counter;

    if (action === 'repeat') {
      if (memoryState.currentTicket) {
        formattedNumber = memoryState.currentTicket.number;
        nextCounter = memoryState.currentTicket.rawNumber || memoryState.counter;
      } else {
        formattedNumber = customNumber || '0001';
      }
    } else if (action === 'call-custom' && customNumber) {
      formattedNumber = String(customNumber).trim();
      if (!isNaN(formattedNumber)) {
        formattedNumber = String(parseInt(formattedNumber, 10)).padStart(4, '0');
      }
      nextCounter = memoryState.counter;
    } else {
      try {
        const { data: lastRows } = await supabase
          .from('tickets')
          .select('raw_number')
          .order('id', { ascending: false })
          .limit(1);

        const lastNum = lastRows && lastRows[0] ? lastRows[0].raw_number : memoryState.counter;
        nextCounter = lastNum >= 1000 ? 1 : lastNum + 1;
      } catch (e) {
        nextCounter = memoryState.counter >= 1000 ? 1 : memoryState.counter + 1;
      }
      formattedNumber = String(nextCounter).padStart(4, '0');
    }

    memoryState.callSequence += 1;
    const nowStr = formatBrasiliaTime();
    const newTicket = {
      id: Date.now(),
      callId: memoryState.callSequence,
      number: formattedNumber,
      rawNumber: nextCounter,
      desk,
      type: ticketType,
      timestamp: nowStr,
      isRepeat: action === 'repeat'
    };

    memoryState.counter = nextCounter;
    memoryState.currentTicket = newTicket;
    
    if (action !== 'repeat') {
      memoryState.history = [newTicket, ...memoryState.history.slice(0, 9)];
    }

    try {
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from('tickets')
        .insert([{
          call_id: memoryState.callSequence,
          number: formattedNumber,
          raw_number: nextCounter,
          desk: desk,
          type: ticketType
        }])
        .select();

      if (!insertError && inserted && inserted[0]) {
        newTicket.id = inserted[0].id;
        newTicket.callId = inserted[0].call_id || memoryState.callSequence;
      }
    } catch (err) {
      console.error('[Supabase Insert Error]', err);
    }

    return res.status(200).json({
      success: true,
      ticket: newTicket,
      state: memoryState
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
