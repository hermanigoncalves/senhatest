import React, { useEffect, useRef, useState } from 'react';
import { cmipApi } from '../utils/cmipApi';
import { createLatestGuard } from '../utils/latest';
import { MAX_TICKET_NUMBER, parseTicketNumber } from '../utils/ticketPatient';
import { Button, Field, Card, err } from './ui';

// Uma caixa por consultório: a recepção encaminha a senha para o consultório e chama de lá.
// Não depende de médico logado.
export function OfficeTicketBoard() {
  const [offices, setOffices] = useState([]),
    [ticketNumber, setTicketNumber] = useState(''),
    [picking, setPicking] = useState(false),
    [moveTargets, setMoveTargets] = useState({}),
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

  // A recepção só troca o consultório; chamar, confirmar e cancelar é do médico do consultório.
  const move = async (item) => {
    const target = offices.find((o) => o.office_id === moveTargets[item.id]);
    if (!target || busy) return;
    setBusy(`${item.id}:move`);
    setMsg('');
    try {
      await cmipApi.officeTicketMove(item.id, target.office_id);
      setMoveTargets((t) => ({ ...t, [item.id]: '' }));
      setMsg(`Senha ${item.display_number} trocada para ${target.office_name}.`);
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
        Digite a senha e escolha o consultório. Não é preciso o médico estar logado: a senha fica esperando e
        aparece para o médico quando ele entrar no consultório. Quem chama, confirma ou cancela é o médico.
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
                    <select
                      aria-label={`Novo consultório da senha ${item.display_number}`}
                      className="bg-cmip-950 border border-cmip-600/50 p-3 rounded-xl"
                      value={moveTargets[item.id] || ''}
                      onChange={(e) => setMoveTargets({ ...moveTargets, [item.id]: e.target.value })}
                    >
                      <option value="">Trocar consultório</option>
                      {offices
                        .filter((o) => o.office_id !== office.office_id)
                        .map((o) => (
                          <option key={o.office_id} value={o.office_id}>
                            {o.office_name}
                          </option>
                        ))}
                    </select>
                    <Button
                      className="px-3 py-2"
                      disabled={!moveTargets[item.id] || Boolean(busy)}
                      onClick={() => move(item)}
                    >
                      Trocar
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
