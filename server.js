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
  if (!sql || !process.env.POSTGRES_URL) return;
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS tickets (
        id SERIAL PRIMARY KEY,
        call_id INT,
        number VARCHAR(20) NOT NULL,
        raw_number INT NOT NULL,
        desk VARCHAR(50) NOT NULL,
        type VARCHAR(20) DEFAULT 'Normal',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    console.log('[Vercel Postgres] Tabela "tickets" pronta no banco Vercel!');

    // Restaura o contador e o estado mais recente do banco ao iniciar o servidor
    const { rows } = await sql`SELECT * FROM tickets ORDER BY id DESC LIMIT 10;`;
    if (rows && rows.length > 0) {
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
      console.log(`[Contador Restaurado] Última senha do banco: ${queueState.currentTicket.number} (callId: ${queueState.callSequence})`);
    }
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

  socket.on('set-initial-ticket', (data) => {
    const num = parseInt(data.number, 10);
    if (!isNaN(num) && num >= 1 && num <= 1000) {
      queueState.counter = num - 1;
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

    if (sql && process.env.POSTGRES_URL) {
      try {
        const { rows } = await sql`
          INSERT INTO tickets (call_id, number, raw_number, desk, type)
          VALUES (${queueState.callSequence}, ${formattedNumber}, ${queueState.counter}, ${desk}, 'Normal')
          RETURNING id;
        `;
        if (rows[0]) {
          newTicket.id = rows[0].id;
        }
      } catch (dbErr) {
        console.error('[Vercel DB Error]', dbErr.message);
      }
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

    if (sql && process.env.POSTGRES_URL) {
      try {
        const { rows } = await sql`
          INSERT INTO tickets (call_id, number, raw_number, desk, type)
          VALUES (${queueState.callSequence}, ${formattedNumber}, 0, ${desk}, 'Normal')
          RETURNING id;
        `;
        if (rows[0]) {
          newTicket.id = rows[0].id;
        }
      } catch (dbErr) {
        console.error('[Vercel DB Error]', dbErr.message);
      }
    }

    io.emit('ticket-called', newTicket);
    io.emit('state-update', queueState);
  });

  socket.on('repeat-call', () => {
    if (!queueState.currentTicket) return;

    queueState.callSequence += 1;
    const repeatedTicket = {
      ...queueState.currentTicket,
      id: Date.now(),
      callId: queueState.callSequence,
      isRepeat: true,
      timestamp: formatBrasiliaTime()
    };

    queueState.currentTicket = repeatedTicket;
    io.emit('ticket-called', repeatedTicket);
    io.emit('state-update', queueState);
    console.log(`[Rechamada CMIP] Senha ${repeatedTicket.number} rechamada para ${repeatedTicket.desk} (callId: ${queueState.callSequence})`);
  });

  socket.on('reset-queue', async () => {
    queueState.counter = 0;
    queueState.callSequence = 0;
    queueState.currentTicket = null;
    queueState.history = [];

    if (sql && process.env.POSTGRES_URL) {
      try {
        await sql`TRUNCATE TABLE tickets;`;
      } catch (dbErr) {
        console.error('[Vercel DB Truncate Error]', dbErr.message);
      }
    }

    io.emit('queue-reset');
    io.emit('state-update', queueState);
    console.log(`[Fila CMIP] Fila zerada por atendente no banco e memória.`);
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
