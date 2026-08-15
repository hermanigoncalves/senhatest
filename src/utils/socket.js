import { io } from 'socket.io-client';

const isVercel = typeof window !== 'undefined' && (
  window.location.hostname.includes('vercel.app') || 
  (window.location.hostname !== 'localhost' && !window.location.hostname.match(/^\d+\.\d+\.\d+\.\d+$/))
);

const URL = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:3001'
  : (typeof window !== 'undefined' ? `http://${window.location.hostname}:3001` : 'http://localhost:3001');

export const socket = io(URL, {
  autoConnect: !isVercel,
  reconnectionAttempts: 5,
  reconnectionDelay: 2000
});

// ==========================================
// FUNÇÕES DE SINCRONIZAÇÃO DAS 3 TVs (CMIP)
// ==========================================

/**
 * Busca o estado da TV para o canal específico:
 * - 'recepcao': Somente senhas numéricas dos guichês
 * - '1': Somente chamadas médicas da TV 01 (Térreo)
 * - '2': Somente chamadas médicas da TV 02 (1º Andar)
 * - 'all': Todas as chamadas
 */
export async function fetchTvState(channel = 'all') {
  try {
    const url = `/api/medical?view=tv&channel=${encodeURIComponent(channel)}`;
    const res = await fetch(url);
    if (res.ok) return await res.json();
    return null;
  } catch (err) {
    return null;
  }
}

export async function fetchVercelState(channel = 'all') {
  return await fetchTvState(channel);
}

/**
 * Emite uma nova senha a partir do Totem (Tablet).
 */
export async function issueTotemTicket(ticketType = 'Normal') {
  if (!isVercel && socket.connected) {
    return new Promise((resolve) => {
      socket.emit('issue-totem-ticket', { ticketType }, (response) => {
        resolve(response);
      });
    });
  }

  try {
    const res = await fetch('/api/ticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'issue-ticket', ticketType })
    });
    return await res.json();
  } catch (err) {
    console.error('Erro ao emitir senha no Totem:', err);
    return null;
  }
}

export async function setInitialTicketVercel(initialNumber) {
  try {
    const res = await fetch('/api/ticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set-initial-ticket', initialNumber, number: initialNumber })
    });
    return await res.json();
  } catch (err) {
    console.error('Erro ao definir senha inicial:', err);
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
    console.error('Erro na chamada de senha:', err);
  }
}

export async function callWaitingTicketVercel(ticketId, desk) {
  try {
    const res = await fetch('/api/ticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'call-waiting-ticket', ticketId, desk })
    });
    return await res.json();
  } catch (err) {
    console.error('Erro ao chamar senha da fila:', err);
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
    console.error('Erro na chamada customizada:', err);
  }
}

export async function repeatCallVercel(currentTicket, desk) {
  if (!currentTicket) return;
  const targetDesk = desk || currentTicket.desk;
  try {
    const res = await fetch('/api/ticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        action: 'repeat', 
        desk: targetDesk, 
        customNumber: currentTicket.number, 
        ticketType: currentTicket.type 
      })
    });
    return await res.json();
  } catch (err) {
    console.error('Erro na rechamada:', err);
  }
}

export async function resetQueueVercel() {
  try {
    const res = await fetch('/api/ticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset' })
    });
    return await res.json();
  } catch (err) {
    console.error('Erro ao zerar fila:', err);
  }
}

// ==========================================
// FLUXO MÉDICO, RECEPÇÃO, ADMIN & MULTI-TV
// ==========================================

export async function fetchOfficesAndDoctors() {
  try {
    const res = await fetch('/api/medical?view=setup');
    if (res.ok) return await res.json();
    return { offices: [], doctors: [] };
  } catch (e) {
    return { offices: [], doctors: [] };
  }
}

// --- CRUD MÉDICOS ---
export async function fetchDoctorsList() {
  try {
    const res = await fetch('/api/medical', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list-doctors' })
    });
    return await res.json();
  } catch (e) {
    return { success: false, doctors: [] };
  }
}

export async function createDoctor(payload) {
  try {
    const res = await fetch('/api/medical', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create-doctor', payload })
    });
    return await res.json();
  } catch (e) {
    return { success: false, message: e.message };
  }
}

export async function updateDoctor(payload) {
  try {
    const res = await fetch('/api/medical', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update-doctor', payload })
    });
    return await res.json();
  } catch (e) {
    return { success: false, message: e.message };
  }
}

export async function deleteDoctor(id, hardDelete = false) {
  try {
    const res = await fetch('/api/medical', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete-doctor', payload: { id, hardDelete } })
    });
    return await res.json();
  } catch (e) {
    return { success: false, message: e.message };
  }
}

// --- CRUD CONSULTÓRIOS (com Multi-TV) ---
export async function fetchOfficesList() {
  try {
    const res = await fetch('/api/medical', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list-offices' })
    });
    return await res.json();
  } catch (e) {
    return { success: false, offices: [] };
  }
}

export async function createOffice(payload) {
  try {
    const res = await fetch('/api/medical', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create-office', payload })
    });
    return await res.json();
  } catch (e) {
    return { success: false, message: e.message };
  }
}

export async function updateOffice(payload) {
  try {
    const res = await fetch('/api/medical', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update-office', payload })
    });
    return await res.json();
  } catch (e) {
    return { success: false, message: e.message };
  }
}

export async function deleteOffice(id) {
  try {
    const res = await fetch('/api/medical', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete-office', payload: { id } })
    });
    return await res.json();
  } catch (e) {
    return { success: false, message: e.message };
  }
}

// --- CRUD USUÁRIOS ---
export async function fetchUsersList() {
  try {
    const res = await fetch('/api/medical', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list-users' })
    });
    return await res.json();
  } catch (e) {
    return { success: false, users: [] };
  }
}

export async function createUser(payload) {
  try {
    const res = await fetch('/api/medical', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create-user', payload })
    });
    return await res.json();
  } catch (e) {
    return { success: false, message: e.message };
  }
}

export async function updateUser(payload) {
  try {
    const res = await fetch('/api/medical', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update-user', payload })
    });
    return await res.json();
  } catch (e) {
    return { success: false, message: e.message };
  }
}

// --- FLUXO DE FILAS E ATENDIMENTO ---
export async function registerPatientCall(payload) {
  try {
    const res = await fetch('/api/medical', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'register-patient-call', payload })
    });
    return await res.json();
  } catch (e) {
    return { success: false, message: e.message };
  }
}

export async function fetchDoctorQueue(doctorId) {
  try {
    const res = await fetch(`/api/medical?view=doctor-queue&doctorId=${doctorId}`);
    if (res.ok) return await res.json();
    return { success: false, queue: [] };
  } catch (e) {
    return { success: false, queue: [] };
  }
}

export async function callPatient(callId, doctorId) {
  try {
    const res = await fetch('/api/medical', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'call-patient', payload: { callId, doctorId } })
    });
    return await res.json();
  } catch (e) {
    return { success: false, message: e.message };
  }
}

export async function repeatPatientCall(callId) {
  try {
    const res = await fetch('/api/medical', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'repeat-call', payload: { callId } })
    });
    return await res.json();
  } catch (e) {
    return { success: false, message: e.message };
  }
}

export async function updatePatientStatus(callId, status) {
  try {
    const res = await fetch('/api/medical', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update-status', payload: { callId, status } })
    });
    return await res.json();
  } catch (e) {
    return { success: false, message: e.message };
  }
}

export async function resetAllQueues() {
  try {
    const res = await fetch('/api/medical', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset-all' })
    });
    return await res.json();
  } catch (e) {
    return { success: false, message: e.message };
  }
}

export async function loginUser(username, password) {
  try {
    const res = await fetch('/api/medical', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', payload: { username, password } })
    });
    return await res.json();
  } catch (e) {
    return { success: false, message: e.message };
  }
}
