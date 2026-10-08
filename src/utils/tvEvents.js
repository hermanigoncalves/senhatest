const timeLabel = (value) =>
  new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

// Chave estável: o mesmo evento sempre gera a mesma chave, mesmo sem event_key/id no payload.
// (Antes usava Date.now(), o que fazia cada consulta parecer um evento novo e repetia o anúncio.)
export function stableEventKey(e) {
  if (e.event_key) return String(e.event_key);
  if (e.id) return `t${e.id}`;
  const parts = [
    e.kind || 'ticket',
    e.display_number || e.number || e.patient_name || e.patientName || '',
    e.destination || e.desk || e.officeName || '',
    e.at || '',
  ];
  return `x:${parts.join('|')}`;
}

export function normalizeTvEvent(e) {
  if (!e) return null;
  const key = stableEventKey(e);
  return {
    id: key,
    event_key: key,
    kind: e.kind || 'ticket',
    isRepeat: Boolean(e.is_recall || e.isRepeat),
    number: e.display_number || e.number || '',
    patientName: e.patient_name || e.patientName || '',
    desk: e.destination || e.desk || e.officeName || 'Guichê',
    officeName: e.destination || e.officeName || e.desk || 'Guichê',
    t0_timestamp: e.t0_timestamp || null,
    t3_timestamp: e.t3_timestamp || null,
    source: e.source || 'unknown',
    timestamp: e.at ? timeLabel(e.at) : e.timestamp || timeLabel(Date.now()),
  };
}
