import React, { useEffect, useRef, useState } from 'react';
import { cmipApi } from '../utils/cmipApi';
import { createLatestGuard } from '../utils/latest';
import { runOfficeTicketAction } from '../utils/officeTicketCall';
import { Megaphone, Check, X } from 'lucide-react';
import { Button, err } from './ui';

// Tela do médico: senhas que a recepção encaminhou ao consultório da sessão ativa.
export function OfficeTicketList({ officeId, officeName }) {
  const [items, setItems] = useState([]),
    [busy, setBusy] = useState(''),
    [msg, setMsg] = useState('');
  const guard = useRef(createLatestGuard());
  const load = async () => {
    const mine = guard.current.next();
    try {
      const list = await cmipApi.officeTicketOfficeQueue(officeId);
      if (!guard.current.isLatest(mine)) return;
      setItems(list || []);
    } catch (e) {
      if (guard.current.isLatest(mine)) setMsg(err(e));
    }
  };
  useEffect(() => {
    setItems([]);
    load();
    const poll = setInterval(load, 15000);
    const off = cmipApi.subscribe(`doctor-office-tickets-${officeId}`, ['office_ticket_queue'], load);
    return () => {
      clearInterval(poll);
      off();
    };
  }, [officeId]);

  const act = async (item, action) => {
    if (busy) return;
    setBusy(`${item.id}:${action}`);
    setMsg('');
    try {
      setMsg(await runOfficeTicketAction(officeId, item, action));
      await load();
    } catch (e) {
      setMsg(err(e));
    } finally {
      setBusy('');
    }
  };

  return (
    <section aria-label="Senhas do consultório" className="mt-8">
      <h3 className="text-lg font-black">Senhas encaminhadas a {officeName}</h3>
      {items.length === 0 ? (
        <p className="mt-3 text-cmip-100/60">Nenhuma senha encaminhada ao consultório.</p>
      ) : (
        <ul className="mt-3 divide-y divide-cmip-600/30 border-y border-cmip-600/30">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div>
                <b className="text-lg">Senha {item.display_number}</b>
                <p className="text-sm text-cmip-100/60">
                  {item.status === 'called' ? 'Chamada' : 'Aguardando'}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  disabled={Boolean(busy)}
                  onClick={() => act(item, 'call')}
                  className="flex items-center gap-2"
                >
                  <Megaphone className="w-4" aria-hidden="true" />{' '}
                  {item.status === 'called' ? 'Rechamar' : 'Chamar'}
                </Button>
                <Button
                  disabled={Boolean(busy)}
                  onClick={() => act(item, 'finish')}
                  className="flex items-center gap-2 bg-slate-700 text-white hover:bg-slate-600"
                  aria-label={`Confirmar senha ${item.display_number}`}
                >
                  <Check className="w-4" aria-hidden="true" /> Confirmar
                </Button>
                <Button
                  disabled={Boolean(busy)}
                  onClick={() => {
                    if (window.confirm(`Cancelar a senha ${item.display_number}?`)) act(item, 'cancel');
                  }}
                  className="flex items-center gap-2 bg-cmip-red text-white hover:opacity-90"
                  aria-label={`Cancelar senha ${item.display_number}`}
                >
                  <X className="w-4" aria-hidden="true" /> Cancelar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {msg && (
        <p className="mt-3 text-amber-300" role="status">
          {msg}
        </p>
      )}
    </section>
  );
}
