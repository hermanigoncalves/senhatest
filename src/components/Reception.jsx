import React, { useEffect, useRef, useState } from 'react';
import { cmipApi } from '../utils/cmipApi';
import { CAPABILITIES, hasCapability } from '../utils/capabilities';
import { createLatestGuard } from '../utils/latest';
import { Shell } from './Shell';
import { TicketCaller } from './TicketCaller';
import { patientLabel } from '../utils/ticketPatient';
import { statusLabel } from '../utils/labels';
import { OfficeTicketBoard } from './OfficeTicketBoard';
import { Button, Card, err } from './ui';

function TransferQueue() {
  const [rows, setRows] = useState([]),
    [doctors, setDoctors] = useState([]),
    [targets, setTargets] = useState({}),
    [msg, setMsg] = useState('');
  const [transferring, setTransferring] = useState('');
  const guard = useRef(createLatestGuard());
  const load = () => {
    const mine = guard.current.next();
    return Promise.all([cmipApi.receptionQueue(), cmipApi.availableDoctors()])
      .then(([q, d]) => {
        if (!guard.current.isLatest(mine)) return;
        setRows(q.filter((x) => !['finished', 'cancelled'].includes(x.status)));
        setDoctors(d);
      })
      .catch((e) => {
        if (guard.current.isLatest(mine)) setMsg(err(e));
      });
  };
  useEffect(() => {
    load();
    const poll = setInterval(load, 15000);
    const off = cmipApi.subscribe('reception-transfer', ['medical_queue', 'doctor_sessions'], load);
    return () => {
      clearInterval(poll);
      off();
    };
  }, []);
  const transfer = async (row) => {
    const target = targets[row.id];
    if (!target || target === row.doctor_id || transferring) return;
    setTransferring(row.id);
    try {
      await cmipApi.transfer(row.id, target, null);
      setTargets((t) => ({ ...t, [row.id]: '' }));
      setMsg(`${patientLabel(row.patient_name)} transferido com sucesso.`);
      await load();
    } catch (e) {
      setMsg(err(e));
    } finally {
      setTransferring('');
    }
  };
  return (
    <Card className="lg:col-span-2">
      <h2 className="text-xl font-black mb-4">Transferência de pacientes</h2>
      {rows.length === 0 ? (
        <p className="text-cmip-100/60">Nenhum paciente ativo na fila.</p>
      ) : (
        <div className="divide-y divide-cmip-600/30 border-y border-cmip-600/30">
          {rows.map((row) => (
            <div key={row.id} className="grid md:grid-cols-[1fr_1fr_auto] gap-2 items-center py-3">
              <div>
                <b>{patientLabel(row.patient_name)}</b>
                <p className="text-xs text-cmip-100/60">
                  {row.doctor_name} · {statusLabel(row.status)}
                </p>
              </div>
              <select
                className="bg-cmip-900 rounded-xl p-3"
                value={targets[row.id] || ''}
                onChange={(e) => setTargets({ ...targets, [row.id]: e.target.value })}
              >
                <option value="">Novo médico</option>
                {doctors
                  .filter((d) => d.doctor_id !== row.doctor_id)
                  .map((d) => (
                    <option key={d.doctor_id} value={d.doctor_id}>
                      {d.doctor_name} — {d.office_name}
                    </option>
                  ))}
              </select>
              <Button
                disabled={!targets[row.id] || targets[row.id] === row.doctor_id || Boolean(transferring)}
                onClick={() => transfer(row)}
              >
                Transferir
              </Button>
            </div>
          ))}
        </div>
      )}
      {msg && <p className="mt-3">{msg}</p>}
    </Card>
  );
}
export function Reception({ profile }) {
  return (
    <Shell profile={profile}>
      <div className="grid lg:grid-cols-2 gap-6">
        <TicketCaller canResetHistory={hasCapability(profile.role, CAPABILITIES.RECEPTION_SUPERUSER)} />
        <OfficeTicketBoard />
        <TransferQueue />
      </div>
    </Shell>
  );
}
