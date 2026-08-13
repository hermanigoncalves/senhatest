import { io } from 'socket.io-client';

const isVercel = window.location.hostname.includes('vercel.app') || window.location.hostname !== 'localhost' && !window.location.hostname.match(/^\d+\.\d+\.\d+\.\d+$/);

const URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3001'
  : `http://${window.location.hostname}:3001`;

export const socket = io(URL, {
  autoConnect: !isVercel,
  reconnectionAttempts: 5,
  reconnectionDelay: 2000
});

// Utilitários Vercel / HTTP REST Fallback
export async function fetchVercelState() {
  try {
    const res = await fetch('/api/ticket');
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    return null;
  }
}

export async function callNextVercel(desk, ticketType) {
  try {
    const res = await fetch('/api/ticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'call-next', desk, ticketType })
    });
    return await res.json();
  } catch (err) {
    console.error('Erro na chamada Vercel:', err);
  }
}

export async function callCustomVercel(customNumber, desk, ticketType) {
  try {
    const res = await fetch('/api/ticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'call-custom', customNumber, desk, ticketType })
    });
    return await res.json();
  } catch (err) {
    console.error('Erro na chamada custom Vercel:', err);
  }
}

export async function repeatCallVercel(currentTicket) {
  if (!currentTicket) return;
  try {
    const res = await fetch('/api/ticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'repeat', desk: currentTicket.desk, customNumber: currentTicket.number, ticketType: currentTicket.type })
    });
    return await res.json();
  } catch (err) {
    console.error('Erro na rechamada Vercel:', err);
  }
}

export async function resetQueueVercel() {
  try {
    await fetch('/api/reset', { method: 'POST' });
  } catch (err) {
    console.error('Erro ao zerar fila Vercel:', err);
  }
}
