import React, { useEffect, useRef, useState } from 'react';
import { cmipApi } from '../utils/cmipApi';
import { createLatestGuard } from '../utils/latest';
import { telemetry } from '../utils/telemetry';
import { MAX_TICKET_NUMBER, parseTicketNumber } from '../utils/ticketPatient';
import { Megaphone, Check, X } from 'lucide-react';
import { Button, Field, Card, err } from './ui';

// Painel usado apenas quando o consultório ainda não tem nenhuma TV vinculada.
const DEFAULT_PANEL = 'recepcao';

// Uma caixa por consultório: a recepção encaminha a senha para o consultório e chama de lá.
// Não depende de médico logado.
export function OfficeTicketBoard() {
  const [offices, setOffices] = useState([]),
    [numbers, setNumbers] = useState({}),
    [busy, setBusy] = useState(''),
    [msg, setMsg] = useState('');
  const guard = useRef(createLatestGuard());
  const load = async () => {
    const mine = guard.current.next();
    try {
      const list = await cmipApi.officeTicketQueues();
      if (guard.current.isLatest(mine)) setOffices(list || []);
    } catch (e) {
      if (guard.current.isLatest(mine)) setMsg(err(e));
    }
  };
  useEffect(() => {
    load();
    const poll = setInterval(load, 15000);
    const off = cmipApi.subscribe('reception-office-tickets', ['office_ticket_queue'], load);
    return () => {
      clearInterval(poll);
      off();
    };
  }, []);

  const enqueue = async (office) => {
    const n = parseTicketNumber(numbers[office.office_id]);
    if (!n) {
      setMsg(`Informe uma senha entre 1 e ${MAX_TICKET_NUMBER}.`);
      return;
    }
    if (busy) return;
    setBusy(`enqueue:${office.office_id}`);
    setMsg('');
    try {
      const r = await cmipApi.officeTicketEnqueue(office.office_id, n);
      setNumbers((x) => ({ ...x, [office.office_id]: '' }));
      setMsg(`Senha ${r?.display_number || n} encaminhada para ${office.office_name}.`);
      await load();
    } catch (e) {
      setMsg(err(e));
    } finally {
      setBusy('');
    }
  };

  const act = async (office, item, action) => {
    if (busy) return;
    if (
      action === 'cancel' &&
      !window.confirm(`Remover a senha ${item.display_number} de ${office.office_name}?`)
    )
      return;
    setBusy(`${item.id}:${action}`);
    setMsg('');
    const t0_timestamp = Date.now();
    try {
      const ev = await cmipApi.officeTicketAction(item.id, action);
      if (action === 'call' && ev?.event_key) {
        const linked = await cmipApi.panelsForOffice(office.office_id);
        const panels = linked.length ? linked : [DEFAULT_PANEL];
        const t3_timestamp = Date.now();
        const payload = { ...ev, patient_name: null, t0_timestamp, t3_timestamp };
        const results = await Promise.all(panels.map((s) => cmipApi.broadcastCall(s, payload)));
        telemetry.mark(ev.event_key, 'T3', {
          broadcastSent: results.every(Boolean),
          targetPanels: panels,
          wallTime: t3_timestamp,
        });
        setMsg(
          results.every(Boolean)
            ? `Senha ${ev.display_number} chamada para ${ev.destination}.`
            : `Senha ${ev.display_number} registrada; a TV deve exibir em alguns segundos.`
        );
      } else if (action === 'finish') setMsg(`Senha ${item.display_number} concluída.`);
      else if (action === 'cancel') setMsg(`Senha ${item.display_number} removida.`);
      await load();
    } catch (e) {
      setMsg(err(e));
    } finally {
      setBusy('');
    }
  };

  return (
    <Card className="lg:col-span-2">
      <h2 className="text-xl font-black">Encaminhar senha para consultório</h2>
      <p className="text-xs text-cmip-100/60 mt-1">
        Digite a senha na caixa do consultório. Não é preciso o médico estar logado: chame a senha por aqui e
        a TV anuncia o número e o consultório.
      </p>
      {offices.length === 0 ? (
        <p className="text-cmip-100/60 mt-4">Nenhum consultório ativo cadastrado.</p>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4 mt-4">
          {offices.map((office) => (
            <div
              key={office.office_id}
              aria-label={`Caixa ${office.office_name}`}
              className="rounded-2xl border border-cmip-600/40 bg-cmip-950 p-4 flex flex-col gap-3"
            >
              <div className="flex justify-between items-center">
                <h3 className="font-black text-lg">{office.office_name}</h3>
                <span className="text-xs text-cmip-100/60">{office.items.length} na fila</span>
              </div>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  enqueue(office);
                }}
              >
                <Field
                  aria-label={`Senha para ${office.office_name}`}
                  type="number"
                  min="1"
                  max={MAX_TICKET_NUMBER}
                  placeholder="Nº da senha"
                  value={numbers[office.office_id] || ''}
                  onChange={(e) => setNumbers({ ...numbers, [office.office_id]: e.target.value })}
                />
                <Button disabled={!numbers[office.office_id] || Boolean(busy)}>Encaminhar</Button>
              </form>
              {office.items.length === 0 ? (
                <p className="text-xs text-cmip-100/50">Nenhuma senha aguardando.</p>
              ) : (
                <ul className="divide-y divide-cmip-600/30">
                  {office.items.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-2 py-2">
                      <div>
                        <b className="text-lg">Senha {item.display_number}</b>
                        <p
                          className={`text-xs ${item.status === 'called' ? 'text-amber-300' : 'text-cmip-100/60'}`}
                        >
                          {item.status === 'called' ? 'Chamada' : 'Aguardando'}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          className="px-3 py-2"
                          disabled={Boolean(busy)}
                          onClick={() => act(office, item, 'call')}
                        >
                          <Megaphone className="w-4 inline" />{' '}
                          {item.status === 'called' ? 'Rechamar' : 'Chamar'}
                        </Button>
                        <Button
                          className="px-3 py-2 bg-slate-700 text-white hover:bg-slate-600"
                          aria-label={`Concluir senha ${item.display_number}`}
                          title="Concluir"
                          disabled={Boolean(busy)}
                          onClick={() => act(office, item, 'finish')}
                        >
                          <Check className="w-4" />
                        </Button>
                        <Button
                          className="px-3 py-2 bg-cmip-red text-white hover:opacity-90"
                          aria-label={`Remover senha ${item.display_number}`}
                          title="Remover"
                          disabled={Boolean(busy)}
                          onClick={() => act(office, item, 'cancel')}
                        >
                          <X className="w-4" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
      {msg && (
        <p className="mt-4 text-amber-200" role="status">
          {msg}
        </p>
      )}
    </Card>
  );
}
