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
// FUNÇÕES DA API MÉDICA (CMIP)
// ==========================================

export async function fetchTvState() {
  try {
    const res = await fetch('/api/medical');
    if (!res.ok) {
      // Fallback para api/ticket
      const fb = await fetch('/api/ticket');
      if (fb.ok) return await fb.json();
      return null;
    }
    return await res.json();
  } catch (err) {
    return null;
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
  } catch (err) {
    console.error('Erro no login:', err);
    return { success: false, message: 'Erro de conexão com o servidor.' };
  }
}

export async function fetchOfficesAndDoctors() {
  try {
    const res = await fetch('/api/medical', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get-offices-doctors' })
    });
    return await res.json();
  } catch (err) {
    console.error('Erro ao buscar consultórios e médicos:', err);
    return { success: false, offices: [], doctors: [] };
  }
}

export async function registerPatientCall(payload) {
  try {
    const res = await fetch('/api/medical', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'register-patient-call', payload })
    });
    const data = await res.json();
    if (socket.connected) {
      socket.emit('patient-registered', data.call);
    }
    return data;
  } catch (err) {
    console.error('Erro ao cadastrar paciente:', err);
    return { success: false, message: 'Erro ao cadastrar paciente.' };
  }
}

export async function fetchDoctorQueue(doctorId) {
  try {
    const res = await fetch(`/api/medical?view=doctor-queue&doctorId=${doctorId}`);
    if (!res.ok) return { success: false, queue: [] };
    return await res.json();
  } catch (err) {
    console.error('Erro ao buscar fila do médico:', err);
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
    const data = await res.json();
    if (socket.connected && data.ticket) {
      socket.emit('patient-called', data.ticket);
    }
    return data;
  } catch (err) {
    console.error('Erro ao chamar paciente:', err);
    return { success: false, message: 'Erro ao chamar paciente.' };
  }
}

export async function repeatPatientCall(callId) {
  try {
    const res = await fetch('/api/medical', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'repeat-call', payload: { callId } })
    });
    const data = await res.json();
    if (socket.connected && data.ticket) {
      socket.emit('patient-called', data.ticket);
    }
    return data;
  } catch (err) {
    console.error('Erro ao rechamar paciente:', err);
    return { success: false, message: 'Erro ao rechamar paciente.' };
  }
}

export async function updatePatientStatus(callId, status) {
  try {
    const res = await fetch('/api/medical', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update-status', payload: { callId, status } })
    });
    const data = await res.json();
    if (socket.connected) {
      socket.emit('status-updated', { callId, status });
    }
    return data;
  } catch (err) {
    console.error('Erro ao atualizar status:', err);
    return { success: false };
  }
}

export async function resetAllQueues() {
  try {
    const res = await fetch('/api/medical', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset-all' })
    });
    if (socket.connected) {
      socket.emit('queue-reset');
    }
    return await res.json();
  } catch (err) {
    console.error('Erro ao resetar filas:', err);
    return { success: false };
  }
}

// ==========================================
// FUNÇÕES LEGADAS DE SENHA NUMÉRICA
// ==========================================
export async function fetchVercelState() {
  return await fetchTvState();
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
  return await resetAllQueues();
}
