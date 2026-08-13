import { sql } from '@vercel/postgres';

// Memória de backup se Vercel Postgres não estiver conectado ainda
let memoryState = {
  counter: 0,
  currentTicket: null,
  history: [],
  desks: ['Guichê 01', 'Guichê 02', 'Guichê 03', 'Guichê 04', 'Recepção']
};

export default async function handler(req, res) {
  // Configuração de CORS para requisições de qualquer origem
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

  // GET: Retorna o estado atual da fila
  if (req.method === 'GET') {
    if (process.env.POSTGRES_URL) {
      try {
        const { rows } = await sql`SELECT * FROM tickets ORDER BY id DESC LIMIT 10;`;
        const current = rows[0] ? {
          id: rows[0].id,
          number: rows[0].number,
          rawNumber: rows[0].raw_number,
          desk: rows[0].desk,
          type: rows[0].type,
          timestamp: new Date(rows[0].created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        } : null;

        const history = rows.map(r => ({
          id: r.id,
          number: r.number,
          rawNumber: r.raw_number,
          desk: r.desk,
          type: r.type,
          timestamp: new Date(r.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        }));

        const counter = rows[0] ? rows[0].raw_number : 0;

        return res.status(200).json({
          counter,
          currentTicket: current,
          history,
          desks: memoryState.desks
        });
      } catch (err) {
        console.error('[Vercel DB Error]', err);
      }
    }
    return res.status(200).json(memoryState);
  }

  // POST: Chamar próxima senha (1 a 1000)
  if (req.method === 'POST') {
    const { action, desk = 'Guichê 01', ticketType = 'Normal', customNumber } = req.body || {};

    let formattedNumber = '';
    let nextCounter = 0;

    if (action === 'call-custom' && customNumber) {
      formattedNumber = String(customNumber).trim();
      if (!isNaN(formattedNumber)) {
        formattedNumber = String(parseInt(formattedNumber, 10)).padStart(4, '0');
      }
      nextCounter = memoryState.counter;
    } else {
      // Incrementar 1 a 1000
      if (process.env.POSTGRES_URL) {
        try {
          const { rows } = await sql`SELECT raw_number FROM tickets ORDER BY id DESC LIMIT 1;`;
          const lastNum = rows[0] ? rows[0].raw_number : 0;
          nextCounter = lastNum >= 1000 ? 1 : lastNum + 1;
        } catch (e) {
          nextCounter = memoryState.counter >= 1000 ? 1 : memoryState.counter + 1;
        }
      } else {
        nextCounter = memoryState.counter >= 1000 ? 1 : memoryState.counter + 1;
      }
      formattedNumber = String(nextCounter).padStart(4, '0');
    }

    const nowStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const newTicket = {
      id: Date.now(),
      number: formattedNumber,
      rawNumber: nextCounter,
      desk,
      type: ticketType,
      timestamp: nowStr,
      isRepeat: action === 'repeat'
    };

    memoryState.counter = nextCounter;
    memoryState.currentTicket = newTicket;
    memoryState.history = [newTicket, ...memoryState.history.slice(0, 9)];

    if (process.env.POSTGRES_URL) {
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
        await sql`
          INSERT INTO tickets (number, raw_number, desk, type)
          VALUES (${formattedNumber}, ${nextCounter}, ${desk}, ${ticketType});
        `;
      } catch (err) {
        console.error('[DB Insert Error]', err);
      }
    }

    return res.status(200).json({
      success: true,
      ticket: newTicket,
      state: memoryState
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
