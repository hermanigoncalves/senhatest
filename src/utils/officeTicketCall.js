import { cmipApi } from './cmipApi.js';
import { telemetry } from './telemetry.js';

// "Senha 0045" ou, quando só o nome foi informado, o próprio nome do paciente.
export const ticketLabel = (item) =>
  item?.display_number ? `Senha ${item.display_number}` : item?.patient_name || 'Paciente';

// Executa uma ação sobre uma senha da caixa do consultório (recepção e médico usam o mesmo caminho).
// action: 'call' (chama ou rechama; avisa a TV na hora), 'finish' ou 'cancel'. Devolve a mensagem para a tela.
export async function runOfficeTicketAction(officeId, item, action) {
  const t0_timestamp = Date.now();
  const ev = await cmipApi.officeTicketAction(item.id, action);
  if (action === 'finish') return `${ticketLabel(item)} concluída.`;
  if (action === 'cancel') return `${ticketLabel(item)} removida.`;
  if (!ev?.event_key) return `${ticketLabel(item)} chamada.`;
  // Só as TVs ligadas ao consultório recebem o aviso instantâneo. Sem TV vinculada (ou se a consulta falhar)
  // nenhuma outra TV é usada no lugar: o banco continua entregando pela consulta periódica de cada painel.
  const panels = await cmipApi.panelsForOffice(officeId);
  if (!panels.length) return `${ticketLabel(ev)} registrada; nenhuma TV vinculada a ${ev.destination} recebeu o aviso imediato.`;
  const t3_timestamp = Date.now();
  // patient_name é o nome completo informado pela recepção (decisão do CMIP); só a voz local da TV o fala.
  const payload = { ...ev, patient_name: ev.patient_name || null, t0_timestamp, t3_timestamp };
  const results = await Promise.all(panels.map((s) => cmipApi.broadcastCall(s, payload)));
  const ok = results.every(Boolean);
  telemetry.mark(ev.event_key, 'T3', { broadcastSent: ok, targetPanels: panels, wallTime: t3_timestamp });
  return ok
    ? `${ticketLabel(ev)} chamada para ${ev.destination}.`
    : `${ticketLabel(ev)} registrada; a TV deve exibir em alguns segundos.`;
}
