// Rótulos em português para valores que vêm do banco em inglês (status da fila e perfis).
const QUEUE_STATUS = Object.freeze({
  waiting: 'Aguardando',
  called: 'Chamado',
  in_service: 'Em atendimento',
  absent: 'Ausente',
  finished: 'Finalizado',
  cancelled: 'Cancelado',
});

const ROLES = Object.freeze({
  receptionist: 'Recepção',
  doctor: 'Médico',
  admin: 'Administrador',
  master: 'Master',
});

export const statusLabel = (status) => QUEUE_STATUS[status] || String(status ?? '');
export const roleLabel = (role) => ROLES[role] || String(role ?? '');
