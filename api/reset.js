import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    if (process.env.POSTGRES_URL) {
      try {
        await sql`TRUNCATE TABLE tickets;`;
      } catch (e) {
        console.error('[DB Truncate Error]', e);
      }
    }
    return res.status(200).json({ success: true, message: 'Fila zerada com sucesso.' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
