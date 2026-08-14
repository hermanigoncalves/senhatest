import { supabase, supabaseAdmin } from './_supabase.js';

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

  const DESKS_LIST = ['Guichê 01', 'Guichê 02', 'Guichê 03', 'Guichê 04', 'Recepção CMIP'];

  // Helper para buscar o estado 100% atualizado do Supabase
  const getSupabaseState = async () => {
    try {
      const { data: allRows, error } = await supabase
        .from('tickets')
        .select('*')
        .order('id', { ascending: false })
        .limit(20);

      if (error || !allRows || allRows.length === 0) {
        return {
          counter: 0,
          callSequence: 0,
          currentTicket: null,
          history: [],
          desks: DESKS_LIST
        };
      }

      // Separa tickets reais dos marcadores de sistema (seeds)
      const realTickets = allRows.filter(r => r.type !== 'Sistema');
      const sequentialTickets = allRows.filter(r => r.type !== 'Custom' && r.type !== 'Sistema');
      const latestOverall = allRows[0];

      let currentTicket = null;
      let history = [];

      if (realTickets.length > 0) {
        currentTicket = {
          id: realTickets[0].id,
          callId: realTickets[0].call_id || realTickets[0].id,
          number: realTickets[0].number,
          rawNumber: realTickets[0].raw_number,
          desk: realTickets[0].desk,
          type: realTickets[0].type,
          timestamp: formatBrasiliaTime(new Date(realTickets[0].created_at))
        };

        history = realTickets.slice(0, 10).map(r => ({
          id: r.id,
          callId: r.call_id || r.id,
          number: r.number,
          rawNumber: r.raw_number,
          desk: r.desk,
          type: r.type,
          timestamp: formatBrasiliaTime(new Date(r.created_at))
        }));
      }

      const queueCounter = sequentialTickets.length > 0 ? (sequentialTickets[0].raw_number || 0) : (latestOverall.raw_number || 0);

      return {
        counter: queueCounter,
        callSequence: latestOverall.call_id || latestOverall.id || 0,
        currentTicket,
        history,
        desks: DESKS_LIST
      };
    } catch (err) {
      console.error('[Supabase State Error]', err);
      return {
        counter: 0,
        callSequence: 0,
        currentTicket: null,
        history: [],
        desks: DESKS_LIST
      };
    }
  };

  // GET: Retorna o estado real derivado do Supabase
  if (req.method === 'GET') {
    const state = await getSupabaseState();
    return res.status(200).json(state);
  }

  // POST: Executa as ações alterando o Supabase
  if (req.method === 'POST') {
    const { action, desk = 'Guichê 01', ticketType = 'Normal', customNumber, initialNumber, number } = req.body || {};
    const targetInitial = initialNumber !== undefined ? initialNumber : number;

    // 1. ZERAR FILA
    if (action === 'reset') {
      try {
        await supabaseAdmin.from('tickets').delete().gt('id', 0);
        await supabaseAdmin.from('tickets').delete().gte('raw_number', 0);
      } catch (e) {
        console.error('[Supabase Reset Error]', e);
      }
      return res.status(200).json({
        success: true,
        message: 'Fila zerada com sucesso.',
        state: {
          counter: 0,
          callSequence: 0,
          currentTicket: null,
          history: [],
          desks: DESKS_LIST
        }
      });
    }

    // 2. DEFINIR SENHA INICIAL (1 a 1000)
    if (action === 'set-initial-ticket' && targetInitial !== undefined && targetInitial !== null) {
      const num = parseInt(targetInitial, 10);
      if (!isNaN(num) && num >= 1 && num <= 1000) {
        try {
          if (num === 1) {
            // Se for 1, limpa completamente a tabela para começar no 0001
            await supabaseAdmin.from('tickets').delete().gt('id', 0);
            await supabaseAdmin.from('tickets').delete().gte('raw_number', 0);
          } else {
            // Se for maior que 1 (ex: 50 ou 10 vindo de 154), apaga registros >= num
            await supabaseAdmin.from('tickets').delete().gte('raw_number', num);

            // Verifica o último registro remanescente no banco
            const { data: latestRemaining } = await supabase
              .from('tickets')
              .select('*')
              .order('id', { ascending: false })
              .limit(1);

            const lastCallId = latestRemaining && latestRemaining[0] ? (latestRemaining[0].call_id || latestRemaining[0].id) : 0;
            const lastRaw = latestRemaining && latestRemaining[0] ? latestRemaining[0].raw_number : -1;

            // Se o último registro não for exatamente num - 1, insere um marcador para garantir que a próxima chamada seja num
            if (lastRaw !== num - 1) {
              await supabaseAdmin.from('tickets').insert([{
                call_id: lastCallId + 1,
                number: String(num - 1).padStart(4, '0'),
                raw_number: num - 1,
                desk: 'CMIP',
                type: 'Sistema'
              }]);
            }
          }
        } catch (e) {
          console.error('[Supabase Set Initial Error]', e);
        }

        const updatedState = await getSupabaseState();
        return res.status(200).json({
          success: true,
          message: `Próxima senha iniciará em ${String(num).padStart(4, '0')}`,
          state: updatedState
        });
      }
    }

    // 3. RECHAMAR SENHA
    if (action === 'repeat') {
      try {
        const { data: latestRows } = await supabase
          .from('tickets')
          .select('*')
          .order('id', { ascending: false })
          .limit(10);

        const realRows = (latestRows || []).filter(r => r.type !== 'Sistema');
        if (realRows.length > 0) {
          const targetTicket = realRows[0];
          const maxCallId = latestRows[0].call_id || latestRows[0].id || 0;
          const targetDesk = desk || targetTicket.desk || 'Guichê 01';

          const { data: inserted } = await supabaseAdmin
            .from('tickets')
            .insert([{
              call_id: maxCallId + 1,
              number: targetTicket.number,
              raw_number: targetTicket.raw_number,
              desk: targetDesk,
              type: targetTicket.type || 'Normal'
            }])
            .select();

          const nowStr = formatBrasiliaTime();
          const repeatedTicket = {
            id: inserted && inserted[0] ? inserted[0].id : Date.now(),
            callId: maxCallId + 1,
            number: targetTicket.number,
            rawNumber: targetTicket.raw_number,
            desk: targetDesk,
            type: targetTicket.type || 'Normal',
            timestamp: nowStr,
            isRepeat: true
          };

          const state = await getSupabaseState();
          return res.status(200).json({
            success: true,
            ticket: repeatedTicket,
            state
          });
        }
      } catch (err) {
        console.error('[Supabase Repeat Error]', err);
      }
    }

    // 4. CHAMAR NÚMERO ESPECÍFICO (CUSTOM) — NÃO ALTERA A CONTAGEM DA FILA
    if (action === 'call-custom' && customNumber) {
      let formattedNumber = String(customNumber).trim();
      let customRaw = 0;
      if (!isNaN(formattedNumber)) {
        customRaw = parseInt(formattedNumber, 10);
        formattedNumber = String(customRaw).padStart(4, '0');
      }

      try {
        const { data: latestRows } = await supabase
          .from('tickets')
          .select('*')
          .order('id', { ascending: false })
          .limit(10);

        const maxCallId = latestRows && latestRows[0] ? (latestRows[0].call_id || latestRows[0].id) : 0;
        const nextCallId = maxCallId + 1;

        // Mantém a contagem sequencial anterior intacta
        const seqRow = (latestRows || []).find(r => r.type !== 'Custom' && r.type !== 'Sistema');
        const currentQueueCounter = seqRow ? seqRow.raw_number : 0;

        const { data: inserted } = await supabaseAdmin
          .from('tickets')
          .insert([{
            call_id: nextCallId,
            number: formattedNumber,
            raw_number: currentQueueCounter,
            desk: desk,
            type: 'Custom'
          }])
          .select();

        const customTicket = {
          id: inserted && inserted[0] ? inserted[0].id : Date.now(),
          callId: nextCallId,
          number: formattedNumber,
          rawNumber: currentQueueCounter,
          desk: desk,
          type: 'Custom',
          timestamp: formatBrasiliaTime(),
          isRepeat: false
        };

        const state = await getSupabaseState();
        return res.status(200).json({
          success: true,
          ticket: customTicket,
          state
        });
      } catch (err) {
        console.error('[Supabase Custom Error]', err);
      }
    }

    // 5. CHAMAR PRÓXIMA (CALL NEXT) — AVANÇA DA ÚLTIMA SENHA SEQUENCIAL
    try {
      // Busca a última senha sequencial (ignora chamadas Custom e marcadores de Sistema)
      const { data: latestSeqRows } = await supabase
        .from('tickets')
        .select('*')
        .neq('type', 'Custom')
        .order('id', { ascending: false })
        .limit(1);

      let nextCounter = 1;
      if (latestSeqRows && latestSeqRows.length > 0) {
        const lastNum = latestSeqRows[0].raw_number;
        nextCounter = lastNum >= 1000 ? 1 : lastNum + 1;
      }

      // Busca o call_id global mais alto para a TV
      const { data: latestAnyRows } = await supabase
        .from('tickets')
        .select('*')
        .order('id', { ascending: false })
        .limit(1);

      const maxCallId = latestAnyRows && latestAnyRows[0] ? (latestAnyRows[0].call_id || latestAnyRows[0].id) : 0;
      const nextCallId = maxCallId + 1;

      const formattedNumber = String(nextCounter).padStart(4, '0');

      const { data: inserted } = await supabaseAdmin
        .from('tickets')
        .insert([{
          call_id: nextCallId,
          number: formattedNumber,
          raw_number: nextCounter,
          desk: desk,
          type: ticketType || 'Normal'
        }])
        .select();

      const newTicket = {
        id: inserted && inserted[0] ? inserted[0].id : Date.now(),
        callId: nextCallId,
        number: formattedNumber,
        rawNumber: nextCounter,
        desk: desk,
        type: ticketType || 'Normal',
        timestamp: formatBrasiliaTime(),
        isRepeat: false
      };

      const state = await getSupabaseState();
      return res.status(200).json({
        success: true,
        ticket: newTicket,
        state
      });
    } catch (err) {
      console.error('[Supabase Call Next Error]', err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
