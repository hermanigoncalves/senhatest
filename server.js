import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { supabase } from './src/utils/supabaseClient.js';
import medicalHandler from './api/medical.js';
import ticketHandler from './api/ticket.js';

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

let queueState = {
  counter: 0,
  callSequence: 0,
  currentTicket: null,
  history: [],
  waitingQueue: [],
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
    const { data: rows } = await supabase
      .from('tickets')
      .select('*')
      .order('id', { ascending: false })
      .limit(30);

    if (rows && rows.length > 0) {
      const realRows = rows.filter(r => r.type !== 'Sistema' && r.desk !== 'Aguardando');
      const waitingRows = rows.filter(r => r.desk === 'Aguardando').reverse();
      const latestOverall = rows[0];

      queueState.counter = latestOverall.raw_number || 0;
      queueState.callSequence = latestOverall.call_id || latestOverall.id || 0;

      if (realRows.length > 0) {
        queueState.currentTicket = {
          id: realRows[0].id,
          callId: realRows[0].call_id || realRows[0].id,
          number: realRows[0].number,
          rawNumber: realRows[0].raw_number,
          desk: realRows[0].desk,
          type: realRows[0].type,
          timestamp: formatBrasiliaTime(new Date(realRows[0].created_at))
        };
        queueState.history = realRows.slice(0, 10).map(r => ({
          id: r.id,
          callId: r.call_id || r.id,
          number: r.number,
          rawNumber: r.raw_number,
          desk: r.desk,
          type: r.type,
          timestamp: formatBrasiliaTime(new Date(r.created_at))
        }));
      }

      queueState.waitingQueue = waitingRows.map(r => ({
        id: r.id,
        number: r.number,
        rawNumber: r.raw_number,
        type: r.type,
        timestamp: formatBrasiliaTime(new Date(r.created_at))
      }));
    }
  } catch (err) {
    console.error('[Init DB Error]', err.message);
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

app.all('/api/medical', (req, res) => medicalHandler(req, res));
app.all('/api/ticket', (req, res) => ticketHandler(req, res));

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

  // 1. EMISSÃO DE SENHA NO TOTEM (Fica na fila de espera, NÃO vai para a TV)
  socket.on('issue-totem-ticket', (data = {}, callback) => {
    const isPref = data.ticketType === 'Preferencial' || data.type === 'Preferencial';
    queueState.counter = queueState.counter >= 1000 ? 1 : queueState.counter + 1;

    const prefix = isPref ? 'P' : 'N';
    const formattedNumber = `${prefix}${String(queueState.counter).padStart(3, '0')}`;
    const now = new Date();

    const newWaitingTicket = {
      id: Date.now(),
      number: formattedNumber,
      rawNumber: queueState.counter,
      type: isPref ? 'Preferencial' : 'Normal',
      desk: 'Aguardando',
      timestamp: formatBrasiliaTime(now),
      date: now.toLocaleDateString('pt-BR')
    };

    queueState.waitingQueue.push(newWaitingTicket);

    console.log(`[Totem] Nova senha emitida: ${formattedNumber} (${newWaitingTicket.type})`);
    
    // Atualiza os painéis de atendimento (recepção vê a fila), mas a TV não toca
    io.emit('state-update', queueState);

    if (typeof callback === 'function') {
      callback({ success: true, ticket: newWaitingTicket, state: queueState });
    }
  });

  // 2. DEFINIR SENHA INICIAL
  socket.on('set-initial-ticket', (data) => {
    const num = parseInt(data.number || data.initialNumber, 10);
    if (!isNaN(num) && num >= 1 && num <= 1000) {
      queueState.counter = num - 1;
      io.emit('state-update', queueState);
      console.log(`[Definir Senha] Próxima senha começará em: ${num}`);
    }
  });

  // 3. CHAMAR PRÓXIMA SENHA (Prioriza fila do Totem se houver)
  socket.on('call-next', (data = {}) => {
    const desk = data.desk || queueState.desks[0];
    queueState.callSequence += 1;

    let ticketToCall = null;

    if (queueState.waitingQueue && queueState.waitingQueue.length > 0) {
      // Prioriza Preferencial se existir na fila
      const prefIndex = queueState.waitingQueue.findIndex(t => t.type === 'Preferencial');
      if (prefIndex !== -1) {
        ticketToCall = queueState.waitingQueue.splice(prefIndex, 1)[0];
      } else {
        ticketToCall = queueState.waitingQueue.shift();
      }

      ticketToCall = {
        ...ticketToCall,
        callId: queueState.callSequence,
        desk: desk,
        timestamp: formatBrasiliaTime(),
        isRepeat: false
      };
    } else {
      // Avança a contagem tradicional
      queueState.counter = queueState.counter >= 1000 ? 1 : queueState.counter + 1;
      const formattedNumber = String(queueState.counter).padStart(4, '0');
      ticketToCall = {
        id: Date.now(),
        callId: queueState.callSequence,
        number: formattedNumber,
        rawNumber: queueState.counter,
        desk: desk,
        type: data.ticketType || 'Normal',
        timestamp: formatBrasiliaTime(),
        isRepeat: false
      };
    }

    queueState.currentTicket = ticketToCall;
    queueState.history = [ticketToCall, ...queueState.history.slice(0, 9)];

    console.log(`[Chamada TV] Senha ${ticketToCall.number} chamada para ${desk}`);
    io.emit('ticket-called', ticketToCall);
    io.emit('state-update', queueState);
  });

  // 4. CHAMAR SENHA ESPECÍFICA DA FILA DE ESPERA
  socket.on('call-waiting-ticket', (data = {}) => {
    const { ticketId, desk = queueState.desks[0] } = data;
    const index = queueState.waitingQueue.findIndex(t => t.id === ticketId);

    if (index !== -1) {
      const waiting = queueState.waitingQueue.splice(index, 1)[0];
      queueState.callSequence += 1;

      const ticketToCall = {
        ...waiting,
        callId: queueState.callSequence,
        desk: desk,
        timestamp: formatBrasiliaTime(),
        isRepeat: false
      };

      queueState.currentTicket = ticketToCall;
      queueState.history = [ticketToCall, ...queueState.history.slice(0, 9)];

      io.emit('ticket-called', ticketToCall);
      io.emit('state-update', queueState);
    }
  });

  // 5. RECHAMAR SENHA
  socket.on('repeat-call', (data = {}) => {
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
    io.emit('ticket-called', repeatedTicket);
    io.emit('state-update', queueState);
  });

  // 6. CHAMAR NÚMERO CUSTOMIZADO
  socket.on('call-custom', (data = {}) => {
    if (!data.number) return;
    const desk = data.desk || queueState.desks[0];
    let formatted = String(data.number).trim();
    if (!isNaN(formatted)) {
      formatted = String(parseInt(formatted, 10)).padStart(4, '0');
    }

    queueState.callSequence += 1;
    const newTicket = {
      id: Date.now(),
      callId: queueState.callSequence,
      number: formatted,
      rawNumber: queueState.counter,
      desk: desk,
      type: data.ticketType || 'Custom',
      timestamp: formatBrasiliaTime(),
      isRepeat: false
    };

    queueState.currentTicket = newTicket;
    queueState.history = [newTicket, ...queueState.history.slice(0, 9)];

    io.emit('ticket-called', newTicket);
    io.emit('state-update', queueState);
  });

  // 7. ZERAR FILA
  socket.on('reset-queue', () => {
    queueState.counter = 0;
    queueState.callSequence = 0;
    queueState.currentTicket = null;
    queueState.history = [];
    queueState.waitingQueue = [];
    io.emit('queue-reset');
    io.emit('state-update', queueState);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, '0.0.0.0', () => {
  const localIps = getLocalIpAddresses();
  console.log(`\n==================================================`);
  console.log(`🚀 CMIP SERVIDOR DE SENHAS & TOTEM RODANDO!`);
  console.log(`📍 Backend: http://localhost:${PORT}`);
  localIps.forEach(ip => {
    console.log(`   👉 Totem (Tablet): http://${ip}:5173/tablet`);
    console.log(`   👉 TV:            http://${ip}:5173/tv`);
    console.log(`   👉 Atendente:     http://${ip}:5173/`);
  });
  console.log(`==================================================\n`);
});
