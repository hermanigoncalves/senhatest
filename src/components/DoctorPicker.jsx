import React from 'react';
import { Button } from './ui';

// Lista única de médicos disponíveis para encaminhar (por senha ou por paciente cadastrado).
export function DoctorPicker({ doctors, busy, onPick }) {
  if (doctors.length === 0) return <p className="text-cmip-100/60">Nenhum médico disponível no momento.</p>;
  return (
    <ul className="divide-y divide-cmip-600/30 border-y border-cmip-600/30">
      {doctors.map((d) => (
        <li key={d.doctor_id} className="flex items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <b>{d.doctor_name}</b>
            <p className="text-xs text-cmip-100/60">
              {d.specialty || 'Especialidade não informada'} · {d.office_name}
            </p>
          </div>
          <Button disabled={busy} onClick={() => onPick(d.doctor_id)}>
            Encaminhar
          </Button>
        </li>
      ))}
    </ul>
  );
}
