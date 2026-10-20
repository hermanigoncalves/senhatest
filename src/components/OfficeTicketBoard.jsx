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
    [ticketNumber, setTicketNumber] = useState(''),
    [picking, setPicking] = useState(false),
    [busy, setBusy] = useState(''),
    [msg, setMsg] = useState(''),
    [loadError, setLoadError] = useState(''),
    [loaded, setLoaded] = useState(false);
  const guard = useRef(createLatestGuard());
  const load = async () => {
    const mine = guard.current.next();
    try {
      const list = await cmipApi.officeTicketQueues();
      if (!guard.current.isLatest(mine)) return;
      // Ordem natural: Consultório 2 antes do Consultório 10.
      setOffices(
        [...(list || [])].sort((a, b) =>
          String(a.office_name).localeCompare(String(b.office_name), 'pt-BR', { numeric: true })
        )
      );
      setLoadError('');
      setLoaded(true);
    } catch (e) {
      if (!guard.current.isLatest(mine)) return;
      // Função ausente no banco = migration 20261020120000_office_ticket_queue.sql ainda não aplicada.
      const missing = e?.code === 'PGRST202' || /office_ticket_queues/.test(e?.message || '');
      setLoadError(
        missing
          ? 'As caixas de consultório ainda não estão disponíveis: falta aplicar a atualização do banco (office_ticket_queue).'
          : `Não foi possível carregar os consultórios. ${err(e)}`
      );
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
    const n = parseTicketNumber(ticketNumber);
    if (!n) {
      setMsg(`Informe uma senha entre 1 e ${MAX_TICKET_NUMBER}.`);
      return;
    }
    if (busy) return;
    setBusy(`enqueue:${office.office_id}`);
    setMsg('');
    try {
      const r = await cmipApi.officeTicketEnqueue(office.office_id, n);
      setTicketNumber('');
      setPicking(false);
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

  const validNumber = parseTicketNumber(ticketNumber);
  const queued = offices.filter((o) => o.items.length > 0);

  return (
    <Card className="lg:col-span-2">
      <h2 className="text-xl font-black">Encaminhar senha para consultório</h2>
      <p className="text-xs text-cmip-100/60 mt-1">
        Digite a senha e escolha o consultório. Não é preciso o médico estar logado: chame a senha por aqui e
        a TV anuncia o número e o consultório.
      </p>
      {loadError && (
        <p className="mt-4 text-amber-200" role="alert">
          {loadError}
        </p>
      )}
      <form
        className="flex gap-2 mt-4 max-w-md"
        onSubmit={(e) => {
          e.preventDefault();
          if (!validNumber) setMsg(`Informe uma senha entre 1 e ${MAX_TICKET_NUMBER}.`);
          else if (offices.length) setPicking(true);
        }}
      >
        <Field
          aria-label="Número da senha"
          type="number"
          min="1"
          max={MAX_TICKET_NUMBER}
          placeholder="Nº da senha"
          value={ticketNumber}
          onChange={(e) => setTicketNumber(e.target.value)}
        />
        <Button disabled={!ticketNumber || !loaded || offices.length === 0}>Encaminhar</Button>
      </form>
      {loaded && offices.length === 0 && !loadError && (
        <p className="text-cmip-100/60 mt-3">Nenhum consultório ativo cadastrado.</p>
      )}

      {queued.length > 0 && (
        <div className="mt-6">
          <h3 className="font-black mb-2">Senhas nos consultórios</h3>
          <ul className="divide-y divide-cmip-600/30 border-y border-cmip-600/30">
            {queued.flatMap((office) =>
              office.items.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <b className="text-lg">Senha {item.display_number}</b>
                    <p className="text-xs text-cmip-100/60">
                      {office.office_name} ·{' '}
                      <span className={item.status === 'called' ? 'text-amber-300' : ''}>
                        {item.status === 'called' ? 'Chamada' : 'Aguardando'}
                      </span>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      className="px-3 py-2"
                      disabled={Boolean(busy)}
                      onClick={() => act(office, item, 'call')}
                    >
                      <Megaphone className="w-4 inline" /> {item.status === 'called' ? 'Rechamar' : 'Chamar'}
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
              ))
            )}
          </ul>
        </div>
      )}
      {msg && (
        <p className="mt-4 text-amber-200" role="status">
          {msg}
        </p>
      )}

      {picking && validNumber && (
        <div
          className="fixed inset-0 z-50 bg-black/70 grid place-items-center p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) setPicking(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Escolher consultório"
            className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl border border-cmip-600/30 bg-cmip-900 p-6 shadow-xl"
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-black">
                Encaminhar Senha {String(validNumber).padStart(4, '0')} para:
              </h2>
              <button
                onClick={() => setPicking(false)}
                disabled={Boolean(busy)}
                className="text-2xl"
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {offices.map((office) => (
                <button
                  key={office.office_id}
                  disabled={Boolean(busy)}
                  onClick={() => enqueue(office)}
                  className="rounded-2xl border border-cmip-600/40 bg-cmip-950 hover:border-cmip-400 disabled:opacity-40 p-4 text-left"
                >
                  <b className="block">{office.office_name}</b>
                  <span className="text-xs text-cmip-100/60">
                    {office.items.length === 0 ? 'Livre' : `${office.items.length} na fila`}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
