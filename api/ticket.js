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

  // Helper para buscar o estado 100% atualizado do Supabase (TV + Fila de Espera)
  const getSupabaseState = async () => {
    try {
      const { data: allRows, error } = await supabase
        .from('tickets')
        .select('*')
        .order('id', { ascending: false })
        .limit(30);

      if (error || !allRows || allRows.length === 0) {
        return {
          counter: 0,
          callSequence: 0,
          currentTicket: null,
          history: [],
          waitingQueue: [],
          desks: DESKS_LIST
        };
      }

      // Separa tickets:
      // 1. Chamados na TV (desk != 'Aguardando' e type != 'Sistema')
      // 2. Aguardando na Fila do Totem (desk = 'Aguardando')
      const calledTickets = allRows.filter(r => r.type !== 'Sistema' && r.desk !== 'Aguardando');
      const waitingTickets = allRows.filter(r => r.desk === 'Aguardando').reverse(); // ordem cronológica
      const latestOverall = allRows[0];

      let currentTicket = null;
      let history = [];

      if (calledTickets.length > 0) {
        currentTicket = {
          id: calledTickets[0].id,
          callId: calledTickets[0].call_id || calledTickets[0].id,
          number: calledTickets[0].number,
          rawNumber: calledTickets[0].raw_number,
          desk: calledTickets[0].desk,
          type: calledTickets[0].type,
          timestamp: formatBrasiliaTime(new Date(calledTickets[0].created_at))
        };

        history = calledTickets.slice(0, 10).map(r => ({
          id: r.id,
          callId: r.call_id || r.id,
          number: r.number,
          rawNumber: r.raw_number,
          desk: r.desk,
          type: r.type,
          timestamp: formatBrasiliaTime(new Date(r.created_at))
        }));
      }

      const queueCounter = latestOverall ? (latestOverall.raw_number || 0) : 0;

      const formattedWaiting = waitingTickets.map(r => ({
        id: r.id,
        number: r.number,
        rawNumber: r.raw_number,
        type: r.type,
        timestamp: formatBrasiliaTime(new Date(r.created_at))
      }));

      return {
        counter: queueCounter,
        callSequence: latestOverall.call_id || latestOverall.id || 0,
        currentTicket,
        history,
        waitingQueue: formattedWaiting,
        desks: DESKS_LIST
      };
    } catch (err) {
      console.error('[Supabase State Error]', err);
      return {
        counter: 0,
        callSequence: 0,
        currentTicket: null,
        history: [],
        waitingQueue: [],
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
    const { 
      action, 
      desk = 'Guichê 01', 
      ticketType = 'Normal', 
      customNumber, 
      initialNumber, 
      number,
      ticketId
    } = req.body || {};

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
          waitingQueue: [],
          desks: DESKS_LIST
        }
      });
    }

    // 2. EMISSÃO DE SENHA PELO TOTEM/TABLET (NÃO vai para a TV, entra com desk='Aguardando')
    if (action === 'issue-ticket') {
      try {
        const isPref = ticketType === 'Preferencial';
        
        // Busca a última senha emitida para incrementar o contador
        const { data: latestRows } = await supabase
          .from('tickets')
          .select('*')
          .neq('type', 'Custom')
          .order('id', { ascending: false })
          .limit(1);

        let nextCounter = 1;
        if (latestRows && latestRows.length > 0) {
          const lastNum = latestRows[0].raw_number || 0;
          nextCounter = lastNum >= 1000 ? 1 : lastNum + 1;
        }

        // Formata o número (ex: N001 para normal ou P001 para preferencial)
        const prefix = isPref ? 'P' : 'N';
        const formattedNumber = `${prefix}${String(nextCounter).padStart(3, '0')}`;

        // Insere com desk = 'Aguardando' para que fique apenas na fila de espera da recepção
        const { data: inserted, error: insErr } = await supabaseAdmin
          .from('tickets')
          .insert([{
            call_id: 0, // 0 indica que ainda não foi chamado na TV
            number: formattedNumber,
            raw_number: nextCounter,
            desk: 'Aguardando',
            type: isPref ? 'Preferencial' : 'Normal'
          }])
          .select();

        if (insErr) throw insErr;

        const now = new Date();
        const issuedTicket = {
          id: inserted && inserted[0] ? inserted[0].id : Date.now(),
          number: formattedNumber,
          rawNumber: nextCounter,
          type: isPref ? 'Preferencial' : 'Normal',
          desk: 'Aguardando',
          timestamp: formatBrasiliaTime(now),
          date: now.toLocaleDateString('pt-BR')
        };

        const state = await getSupabaseState();
        return res.status(200).json({
          success: true,
          ticket: issuedTicket,
          state
        });
      } catch (err) {
        console.error('[Issue Ticket Error]', err);
        return res.status(500).json({ error: err.message });
      }
    }

    // 3. DEFINIR SENHA INICIAL (1 a 1000)
    if (action === 'set-initial-ticket' && targetInitial !== undefined && targetInitial !== null) {
      const num = parseInt(targetInitial, 10);
      if (!isNaN(num) && num >= 1 && num <= 1000) {
        try {
          if (num === 1) {
            await supabaseAdmin.from('tickets').delete().gt('id', 0);
            await supabaseAdmin.from('tickets').delete().gte('raw_number', 0);
          } else {
            await supabaseAdmin.from('tickets').delete().gte('raw_number', num);

            const { data: latestRemaining } = await supabase
              .from('tickets')
              .select('*')
              .order('id', { ascending: false })
              .limit(1);

            const lastCallId = latestRemaining && latestRemaining[0] ? (latestRemaining[0].call_id || latestRemaining[0].id) : 0;
            const lastRaw = latestRemaining && latestRemaining[0] ? latestRemaining[0].raw_number : -1;

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

    // 4. RECHAMAR SENHA
    if (action === 'repeat') {
      try {
        const { data: latestRows } = await supabase
          .from('tickets')
          .select('*')
          .neq('desk', 'Aguardando')
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

    // 5. CHAMAR NÚMERO ESPECÍFICO (CUSTOM)
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

        const seqRow = (latestRows || []).find(r => r.type !== 'Custom');
        const currentQueueCounter = seqRow ? seqRow.raw_number : 0;

        const { data: inserted } = await supabaseAdmin
          .from('tickets')
          .insert([{
            call_id: nextCallId,
            number: formattedNumber,
            raw_number: currentQueueCounter,
            desk: desk,
            type: ticketType || 'Custom'
          }])
          .select();

        const customTicket = {
          id: inserted && inserted[0] ? inserted[0].id : Date.now(),
          callId: nextCallId,
          number: formattedNumber,
          rawNumber: currentQueueCounter,
          desk: desk,
          type: ticketType || 'Custom',
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

    // 6. CHAMAR SENHA ESPECÍFICA DA FILA DE ESPERA (Por ID do ticket)
    if (action === 'call-waiting-ticket' && ticketId) {
      try {
        // Busca o ticket aguardando
        const { data: targetTicketData } = await supabase
          .from('tickets')
          .select('*')
          .eq('id', ticketId)
          .single();

        if (targetTicketData) {
          const { data: latestAnyRows } = await supabase
            .from('tickets')
            .select('*')
            .order('id', { ascending: false })
            .limit(1);

          const maxCallId = latestAnyRows && latestAnyRows[0] ? (latestAnyRows[0].call_id || latestAnyRows[0].id) : 0;
          const nextCallId = maxCallId + 1;

          // Atualiza o ticket para o guichê e callId ativo
          const { data: updated } = await supabaseAdmin
            .from('tickets')
            .update({
              call_id: nextCallId,
              desk: desk
            })
            .eq('id', ticketId)
            .select();

          const calledTicket = {
            id: targetTicketData.id,
            callId: nextCallId,
            number: targetTicketData.number,
            rawNumber: targetTicketData.raw_number,
            desk: desk,
            type: targetTicketData.type,
            timestamp: formatBrasiliaTime(),
            isRepeat: false
          };

          const state = await getSupabaseState();
          return res.status(200).json({
            success: true,
            ticket: calledTicket,
            state
          });
        }
      } catch (err) {
        console.error('[Call Waiting Ticket Error]', err);
      }
    }

    // 7. CHAMAR PRÓXIMA SENHA (Se houver senhas aguardando no Totem, chama a prioritária/próxima; senão, avança a sequência tradicional)
    try {
      // 7.1 Verifica se há senhas aguardando atendimento do Totem
      const { data: waitingTickets } = await supabase
        .from('tickets')
        .select('*')
        .eq('desk', 'Aguardando')
        .order('id', { ascending: true });

      if (waitingTickets && waitingTickets.length > 0) {
        // Dá prioridade para 'Preferencial', depois por ordem cronológica (menor ID)
        const priorityTicket = waitingTickets.find(t => t.type === 'Preferencial') || waitingTickets[0];

        const { data: latestAnyRows } = await supabase
          .from('tickets')
          .select('*')
          .order('id', { ascending: false })
          .limit(1);

        const maxCallId = latestAnyRows && latestAnyRows[0] ? (latestAnyRows[0].call_id || latestAnyRows[0].id) : 0;
        const nextCallId = maxCallId + 1;

        // Atualiza a senha aguardando para chamada no guichê selecionado
        await supabaseAdmin
          .from('tickets')
          .update({
            call_id: nextCallId,
            desk: desk
          })
          .eq('id', priorityTicket.id);

        const calledTicket = {
          id: priorityTicket.id,
          callId: nextCallId,
          number: priorityTicket.number,
          rawNumber: priorityTicket.raw_number,
          desk: desk,
          type: priorityTicket.type,
          timestamp: formatBrasiliaTime(),
          isRepeat: false
        };

        const state = await getSupabaseState();
        return res.status(200).json({
          success: true,
          ticket: calledTicket,
          state
        });
      }

      // 7.2 Se não houver fila no Totem, segue a numeração sequencial tradicional
      const { data: latestRows } = await supabase
        .from('tickets')
        .select('*')
        .neq('type', 'Custom')
        .order('id', { ascending: false })
        .limit(1);

      let nextCounter = 1;
      if (latestRows && latestRows.length > 0) {
        const lastNum = latestRows[0].raw_number;
        nextCounter = lastNum >= 1000 ? 1 : lastNum + 1;
      }

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
