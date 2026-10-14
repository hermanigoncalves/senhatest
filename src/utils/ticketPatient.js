// Encaminhamento por senha: em vez de cadastrar o paciente, a recepção encaminha a senha ao médico.
// Internamente a senha vira um "paciente" de nome SENHA-0045 (uma palavra só, sem espaço). Assim a fila médica,
// a transferência e a auditoria continuam iguais, e a máscara pública da TV (primeiro nome + inicial) devolve
// o nome sem alterar, porque só mascara nomes com mais de uma palavra.

export const MAX_TICKET_NUMBER = 9999;
export const TICKET_PATIENT_BIRTH_DATE = '1900-01-01';

const TICKET_NAME = /^SENHA-(\d{1,4})$/i;

export function parseTicketNumber(value) {
  const n = Number(String(value ?? '').trim());
  return Number.isInteger(n) && n >= 1 && n <= MAX_TICKET_NUMBER ? n : null;
}

export function ticketPatientName(value) {
  const n = parseTicketNumber(value);
  return n ? `SENHA-${String(n).padStart(4, '0')}` : null;
}

// Devolve o número da senha ("0045") se o nome for um paciente-senha; senão null.
export function ticketNumberFromPatientName(name) {
  const m = TICKET_NAME.exec(String(name ?? '').trim());
  return m ? m[1].padStart(4, '0') : null;
}

// Nome para telas internas: "Senha 0045" para paciente-senha, o próprio nome nos demais casos.
export function patientLabel(name) {
  const n = ticketNumberFromPatientName(name);
  return n ? `Senha ${n}` : name;
}
