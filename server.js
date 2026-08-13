import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { supabase, supabaseAdmin } from './src/utils/supabaseClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Estado da Fila em Memória / Cache
let queueState = {
  counter: 0,
  callSequence: 0,
  currentTicket: null,
  history: [],
  desks: ['Guichê 01', 'Guichê 02', 'Guichê 03', 'Guichê 04', 'Recepção CMIP']
};

const formatBrasiliaTime = (dateObj = new Date()) => {
  return dateObj.toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit'
  });
};

async function initDatabase() {
  try {
    const { data: rows, error } = await supabase
      .from('tickets')
      .select('*')
      .order('id', { ascending: false })
      .limit(10);

    if (!error && rows && rows.length > 0) {
      queueState.counter = rows[0].raw_number || 0;
      queueState.callSequence = rows[0].call_id || rows[0].id || 0;
      queueState.currentTicket = {
        id: rows[0].id,
        callId: rows[0].call_id || rows[0].id,
        number: rows[0].number,
        rawNumber: rows[0].raw_number,
        desk: rows[0].desk,
        type: rows[0].type,
        timestamp: formatBrasiliaTime(new Date(rows[0].created_at))
      };
      queueState.history = rows.map(r => ({
        id: r.id,
        callId: r.call_id || r.id,
        number: r.number,
        rawNumber: r.raw_number,
        desk: r.desk,
        type: r.type,
        timestamp: formatBrasiliaTime(new Date(r.created_at))
      }));
      console.log(`[Supabase Conectado] Última senha do banco: ${queueState.currentTicket.number} (callId: ${queueState.callSequence})`);
    } else {
      console.log('[Supabase Ready] Tabela pronta ou sem senhas gravadas ainda.');
    }
  } catch (err) {
    console.error('[Supabase Init Error]', err.message);
  }
}

initDatabase();

function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses;
}

app.use(express.json());

app.get('/api/info', (req, res) => {
  res.json({
    state: queueState,
    ips: getLocalIpAddresses(),
    port: process.env.PORT || 3001
  });
});

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

// Socket.IO Handlers
io.on('connection', (socket) => {
  console.log(`[Socket.IO] Cliente conectado: ${socket.id}`);
  socket.emit('state-update', queueState);

  socket.on('set-initial-ticket', async (data) => {
    const num = parseInt(data.number, 10);
    if (!isNaN(num) && num >= 1 && num <= 1000) {
      queueState.counter = num - 1;
      queueState.callSequence += 1;
      try {
        if (num === 1) {
          await supabaseAdmin.from('tickets').delete().neq('id', -1);
          queueState.currentTicket = null;
          queueState.history = [];
        } else {
          await supabaseAdmin.from('tickets').delete().gte('raw_number', num);

          const { data: remaining } = await supabase
            .from('tickets')
            .select('*')
            .order('id', { ascending: false })
            .limit(10);

          if (remaining && remaining.length > 0) {
            queueState.currentTicket = {
              id: remaining[0].id,
              callId: remaining[0].call_id || remaining[0].id,
              number: remaining[0].number,
              rawNumber: remaining[0].raw_number,
              desk: remaining[0].desk,
              type: remaining[0].type,
              timestamp: formatBrasiliaTime(new Date(remaining[0].created_at))
            };
            queueState.history = remaining.map(r => ({
              id: r.id,
              callId: r.call_id || r.id,
              number: r.number,
              rawNumber: r.raw_number,
              desk: r.desk,
              type: r.type,
              timestamp: formatBrasiliaTime(new Date(r.created_at))
            }));
          } else {
            queueState.currentTicket = null;
            queueState.history = [];
          }
        }
      } catch (dbErr) {
        console.error('[Supabase Delete Higher Error]', dbErr.message);
      }
      io.emit('state-update', queueState);
      console.log(`[Contador CMIP] Senha inicial definida para começar em: ${num}`);
    }
  });

  socket.on('call-next', async (data = {}) => {
    const desk = data.desk || queueState.desks[0];

    if (queueState.counter >= 1000) {
      queueState.counter = 1;
    } else {
      queueState.counter += 1;
    }

    queueState.callSequence += 1;
    const formattedNumber = String(queueState.counter).padStart(4, '0');
    const nowStr = formatBrasiliaTime();

    const newTicket = {
      id: Date.now(),
      callId: queueState.callSequence,
      number: formattedNumber,
      rawNumber: queueState.counter,
      desk: desk,
      timestamp: nowStr,
      isRepeat: false
    };

    queueState.currentTicket = newTicket;
    queueState.history = [newTicket, ...queueState.history.slice(0, 9)];

    try {
      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from('tickets')
        .insert([{
          call_id: queueState.callSequence,
          number: formattedNumber,
          raw_number: queueState.counter,
          desk: desk,
          type: 'Normal'
        }])
        .select();

      if (!insertErr && inserted && inserted[0]) {
        newTicket.id = inserted[0].id;
        newTicket.callId = inserted[0].call_id || queueState.callSequence;
      }
    } catch (dbErr) {
      console.error('[Supabase DB Error]', dbErr.message);
    }

    io.emit('ticket-called', newTicket);
    io.emit('state-update', queueState);
    console.log(`[Chamada CMIP] Senha ${formattedNumber} chamada para ${desk} (callId: ${queueState.callSequence})`);
  });

  socket.on('call-custom', async (data) => {
    if (!data.number) return;

    const desk = data.desk || queueState.desks[0];
    const nowStr = formatBrasiliaTime();

    let formattedNumber = String(data.number).trim();
    if (!isNaN(formattedNumber)) {
      formattedNumber = String(parseInt(formattedNumber, 10)).padStart(4, '0');
    }

    queueState.callSequence += 1;
    const newTicket = {
      id: Date.now(),
      callId: queueState.callSequence,
      number: formattedNumber,
      desk: desk,
      timestamp: nowStr,
      isRepeat: false
    };

    queueState.currentTicket = newTicket;
    queueState.history = [newTicket, ...queueState.history.slice(0, 9)];

    try {
      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from('tickets')
        .insert([{
          call_id: queueState.callSequence,
          number: formattedNumber,
          raw_number: 0,
          desk: desk,
          type: 'Normal'
        }])
        .select();

      if (!insertErr && inserted && inserted[0]) {
        newTicket.id = inserted[0].id;
        newTicket.callId = inserted[0].call_id || queueState.callSequence;
      }
    } catch (dbErr) {
      console.error('[Supabase DB Error]', dbErr.message);
    }

    io.emit('ticket-called', newTicket);
    io.emit('state-update', queueState);
  });

  socket.on('repeat-call', async (data = {}) => {
    if (!queueState.currentTicket) return;

    const desk = data.desk || queueState.currentTicket.desk || queueState.desks[0];
    queueState.callSequence += 1;
    const repeatedTicket = {
      ...queueState.currentTicket,
      id: Date.now(),
      callId: queueState.callSequence,
      desk: desk,
      isRepeat: true,
      timestamp: formatBrasiliaTime()
    };

    queueState.currentTicket = repeatedTicket;

    try {
      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from('tickets')
        .insert([{
          call_id: queueState.callSequence,
          number: repeatedTicket.number,
          raw_number: repeatedTicket.rawNumber || queueState.counter,
          desk: desk,
          type: repeatedTicket.type || 'Normal'
        }])
        .select();

      if (!insertErr && inserted && inserted[0]) {
        repeatedTicket.id = inserted[0].id;
        repeatedTicket.callId = inserted[0].call_id || queueState.callSequence;
      }
    } catch (dbErr) {
      console.error('[Supabase DB Error em Rechamada]', dbErr.message);
    }

    io.emit('ticket-called', repeatedTicket);
    io.emit('state-update', queueState);
    console.log(`[Rechamada CMIP] Senha ${repeatedTicket.number} rechamada para ${desk} (callId: ${queueState.callSequence})`);
  });

  socket.on('reset-queue', async () => {
    queueState.counter = 0;
    queueState.callSequence = 0;
    queueState.currentTicket = null;
    queueState.history = [];

    try {
      await supabaseAdmin.from('tickets').delete().neq('id', -1);
    } catch (dbErr) {
      console.error('[Supabase Delete Error]', dbErr.message);
    }

    io.emit('queue-reset');
    io.emit('state-update', queueState);
    console.log(`[Fila CMIP] Fila zerada por atendente no Supabase e memória.`);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, '0.0.0.0', () => {
  const localIps = getLocalIpAddresses();
  console.log(`\n==================================================`);
  console.log(`🚀 CMIP SERVIDOR DE SENHAS (1 A 1000) RODANDO!`);
  console.log(`📍 Backend: http://localhost:${PORT}`);
  localIps.forEach(ip => {
    console.log(`   👉 http://${ip}:5173/tv`);
  });
  console.log(`==================================================\n`);
});
