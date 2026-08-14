import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { supabase } from './src/utils/supabaseClient.js';

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
    const { data: calls } = await supabase
      .from('patient_calls')
      .select('*')
      .order('id', { ascending: false })
      .limit(10);

    if (calls && calls.length > 0) {
      const latest = calls[0];
      queueState.currentTicket = {
        id: latest.id,
        callId: latest.call_id || latest.id,
        patientName: latest.patient_name,
        doctorName: latest.doctor_name,
        officeName: latest.office_name,
        type: latest.type,
        status: latest.status,
        timestamp: formatBrasiliaTime(new Date(latest.called_at || latest.created_at))
      };
      queueState.history = calls.map(c => ({
        id: c.id,
        callId: c.call_id || c.id,
        patientName: c.patient_name,
        doctorName: c.doctor_name,
        officeName: c.office_name,
        type: c.type,
        status: c.status,
        timestamp: formatBrasiliaTime(new Date(c.called_at || c.created_at))
      }));
      console.log(`[Supabase Conectado] Última chamada: ${queueState.currentTicket.patientName || queueState.currentTicket.number}`);
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

  // Eventos Médicos
  socket.on('patient-registered', (data) => {
    console.log(`[Socket.IO] Paciente cadastrado:`, data?.patient_name);
    io.emit('patient-registered', data);
  });

  socket.on('patient-called', (ticket) => {
    console.log(`[Socket.IO] Paciente chamado na TV:`, ticket?.patientName || ticket?.number);
    queueState.currentTicket = ticket;
    queueState.history = [ticket, ...queueState.history.slice(0, 9)];
    io.emit('patient-called', ticket);
    io.emit('ticket-called', ticket);
    io.emit('state-update', queueState);
  });

  socket.on('status-updated', (data) => {
    io.emit('status-updated', data);
  });

  socket.on('queue-reset', () => {
    queueState.counter = 0;
    queueState.callSequence = 0;
    queueState.currentTicket = null;
    queueState.history = [];
    io.emit('queue-reset');
    io.emit('state-update', queueState);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, '0.0.0.0', () => {
  const localIps = getLocalIpAddresses();
  console.log(`\n==================================================`);
  console.log(`🚀 CMIP SERVIDOR DE ATENDIMENTO MÉDICO & SENHAS RODANDO!`);
  console.log(`📍 Backend: http://localhost:${PORT}`);
  localIps.forEach(ip => {
    console.log(`   👉 http://${ip}:5173/tv`);
  });
  console.log(`==================================================\n`);
});
