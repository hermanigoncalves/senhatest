import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

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

let sql = null;
if (process.env.POSTGRES_URL) {
  try {
    const postgresModule = await import('@vercel/postgres');
    sql = postgresModule.sql;
    console.log('[Postgres] Módulo @vercel/postgres carregado com sucesso.');
  } catch (e) {
    console.log('[Postgres] Executando em memória local.');
  }
}

// Estado da Fila em Memória / Cache
let queueState = {
  counter: 0, // Varia de 1 a 1000
  currentTicket: null,
  history: [],
  desks: ['Guichê 01', 'Guichê 02', 'Guichê 03', 'Guichê 04', 'Recepção CMIP']
};

async function initDatabase() {
  if (!sql || !process.env.POSTGRES_URL) return;
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS tickets (
        id SERIAL PRIMARY KEY,
        number VARCHAR(20) NOT NULL,
        raw_number INT NOT NULL,
        desk VARCHAR(50) NOT NULL,
        type VARCHAR(20) DEFAULT 'Normal',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    console.log('[Vercel Postgres] Tabela "tickets" pronta no banco Vercel!');
  } catch (err) {
    console.error('[Vercel Postgres Error]', err.message);
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

  // Evento: Definir Senha Inicial / Contador Inicial
  socket.on('set-initial-ticket', (data) => {
    const num = parseInt(data.number, 10);
    if (!isNaN(num) && num >= 1 && num <= 1000) {
      // Define para que a próxima chamada seja este número exatamente
      queueState.counter = num - 1;
      io.emit('state-update', queueState);
      console.log(`[Contador CMIP] Senha inicial definida para começar em: ${num}`);
    }
  });

  // Evento: Chamar Próxima Senha (1 a 1000)
  socket.on('call-next', async (data = {}) => {
    const desk = data.desk || queueState.desks[0];

    if (queueState.counter >= 1000) {
      queueState.counter = 1;
    } else {
      queueState.counter += 1;
    }

    const formattedNumber = String(queueState.counter).padStart(4, '0');
    const nowStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const newTicket = {
      id: Date.now(),
      number: formattedNumber,
      rawNumber: queueState.counter,
      desk: desk,
      timestamp: nowStr,
      isRepeat: false
    };

    queueState.currentTicket = newTicket;
    queueState.history = [newTicket, ...queueState.history.slice(0, 9)];

    if (sql && process.env.POSTGRES_URL) {
      try {
        await sql`
          INSERT INTO tickets (number, raw_number, desk, type)
          VALUES (${formattedNumber}, ${queueState.counter}, ${desk}, 'Normal');
        `;
      } catch (dbErr) {
        console.error('[Vercel DB Error]', dbErr.message);
      }
    }

    io.emit('ticket-called', newTicket);
    io.emit('state-update', queueState);
    console.log(`[Chamada CMIP] Senha ${formattedNumber} chamada para ${desk}`);
  });

  socket.on('call-custom', async (data) => {
    if (!data.number) return;

    const desk = data.desk || queueState.desks[0];
    const nowStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    let formattedNumber = String(data.number).trim();
    if (!isNaN(formattedNumber)) {
      formattedNumber = String(parseInt(formattedNumber, 10)).padStart(4, '0');
    }

    const newTicket = {
      id: Date.now(),
      number: formattedNumber,
      desk: desk,
      timestamp: nowStr,
      isRepeat: false
    };

    queueState.currentTicket = newTicket;
    queueState.history = [newTicket, ...queueState.history.slice(0, 9)];

    if (sql && process.env.POSTGRES_URL) {
      try {
        await sql`
          INSERT INTO tickets (number, raw_number, desk, type)
          VALUES (${formattedNumber}, 0, ${desk}, 'Normal');
        `;
      } catch (dbErr) {
        console.error('[Vercel DB Error]', dbErr.message);
      }
    }

    io.emit('ticket-called', newTicket);
    io.emit('state-update', queueState);
  });

  socket.on('repeat-call', () => {
    if (!queueState.currentTicket) return;

    const repeatedTicket = {
      ...queueState.currentTicket,
      isRepeat: true,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    };

    io.emit('ticket-called', repeatedTicket);
    console.log(`[Rechamada CMIP] Senha ${repeatedTicket.number} rechamada`);
  });

  socket.on('reset-queue', () => {
    queueState.counter = 0;
    queueState.currentTicket = null;
    queueState.history = [];
    io.emit('queue-reset');
    io.emit('state-update', queueState);
    console.log(`[Fila CMIP] Fila zerada por atendente.`);
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
