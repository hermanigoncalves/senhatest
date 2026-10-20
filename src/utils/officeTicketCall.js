import { cmipApi } from './cmipApi.js';
import { telemetry } from './telemetry.js';

// Painel usado apenas quando o consultório ainda não tem nenhuma TV vinculada.
export const DEFAULT_PANEL = 'recepcao';

// Executa uma ação sobre uma senha da caixa do consultório (recepção e médico usam o mesmo caminho).
// action: 'call' (chama ou rechama; avisa a TV na hora), 'finish' ou 'cancel'. Devolve a mensagem para a tela.
export async function runOfficeTicketAction(officeId, item, action) {
  const t0_timestamp = Date.now();
  const ev = await cmipApi.officeTicketAction(item.id, action);
  if (action === 'finish') return `Senha ${item.display_number} concluída.`;
  if (action === 'cancel') return `Senha ${item.display_number} removida.`;
  if (!ev?.event_key) return `Senha ${item.display_number} chamada.`;
  const linked = await cmipApi.panelsForOffice(officeId);
  const panels = linked.length ? linked : [DEFAULT_PANEL];
  const t3_timestamp = Date.now();
  const payload = { ...ev, patient_name: null, t0_timestamp, t3_timestamp };
  const results = await Promise.all(panels.map((s) => cmipApi.broadcastCall(s, payload)));
  const ok = results.every(Boolean);
  telemetry.mark(ev.event_key, 'T3', { broadcastSent: ok, targetPanels: panels, wallTime: t3_timestamp });
  return ok
    ? `Senha ${ev.display_number} chamada para ${ev.destination}.`
    : `Senha ${ev.display_number} registrada; a TV deve exibir em alguns segundos.`;
}
