// Consultório de CADA aparelho. Um mesmo login de médico (ex.: "medico", compartilhado) pode ter um consultório
// aberto em cada computador; o aparelho guarda o seu e só mexe nele (heartbeat, troca, encerramento, logout).

// Mesma janela de presença do backend: sem heartbeat há 45s, o consultório é considerado livre.
export const PRESENCE_WINDOW_MS = 45000;

export const doctorOfficeKey = (doctorOrProfileId) => `cmip_doctor_office_${doctorOrProfileId}`;

export function readDoctorOffice(doctorOrProfileId) {
  try {
    return localStorage.getItem(doctorOfficeKey(doctorOrProfileId)) || '';
  } catch {
    return '';
  }
}

export function saveDoctorOffice(doctorOrProfileId, officeId) {
  try {
    localStorage.setItem(doctorOfficeKey(doctorOrProfileId), officeId);
  } catch {
    /* sem armazenamento: o médico escolhe o consultório de novo na próxima vez */
  }
}

// Sessão deste aparelho entre as sessões abertas do médico (nunca a de outro computador).
export function pickDeviceSession(sessions, deviceOfficeId) {
  if (!deviceOfficeId) return null;
  return (sessions || []).find((s) => s.office_id === deviceOfficeId) || null;
}

// Consultórios que este aparelho pode escolher: tira os que o mesmo login está usando em outro computador.
export function freeOffices(offices, sessions, deviceOfficeId, now = Date.now()) {
  const busy = new Set(
    (sessions || [])
      .filter(
        (s) =>
          s.office_id !== deviceOfficeId &&
          s.last_seen_at &&
          now - Date.parse(s.last_seen_at) < PRESENCE_WINDOW_MS
      )
      .map((s) => s.office_id)
  );
  return (offices || []).filter((o) => !busy.has(o.id));
}
