import React, { useEffect, useState } from 'react';
import { cmipApi } from '../utils/cmipApi';
import { operationalModules } from '../utils/capabilities';
import { Doctor } from './Doctor';
import { Reception } from './Reception';
import { Admin } from './Admin';
import { Card, err } from './ui';

function DelegatedDoctorModule({ profile, doctorId, onDoctorChange }) {
  const [doctors, setDoctors] = useState([]),
    [msg, setMsg] = useState('');
  useEffect(() => {
    cmipApi
      .delegatedDoctors()
      .then((rows) => setDoctors(rows || []))
      .catch((e) => setMsg(err(e)));
  }, []);
  const actingDoctor = doctors.find((d) => d.doctor_id === doctorId);
  return (
    <div className="bg-cmip-950 text-white">
      <div className="max-w-7xl mx-auto px-4 md:px-8 pt-6">
        <Card>
          <label
            className="block text-sm font-black uppercase tracking-wider text-cmip-200 mb-2"
            htmlFor="acting-doctor"
          >
            Atuar como médico
          </label>
          <select
            id="acting-doctor"
            className="w-full bg-cmip-950 border border-cmip-500/50 text-white rounded-xl px-4 py-3 font-bold"
            value={doctorId}
            onChange={(e) => onDoctorChange(e.target.value)}
          >
            <option value="">Selecione um médico ativo</option>
            {doctors.map((d) => (
              <option key={d.doctor_id} value={d.doctor_id}>
                {d.doctor_name}
                {d.specialty ? ` — ${d.specialty}` : ''}
              </option>
            ))}
          </select>
          {msg && <p className="mt-3 text-rose-200">{msg}</p>}
          {doctors.length === 0 && !msg && (
            <p className="mt-3 text-cmip-100/60">Nenhum médico ativo disponível para delegação.</p>
          )}
        </Card>
      </div>
      {actingDoctor && <Doctor key={actingDoctor.doctor_id} profile={profile} actingDoctor={actingDoctor} />}
    </div>
  );
}

export function SuperuserWorkspace({ profile }) {
  const modules = operationalModules(profile.role),
    [active, setActive] = useState(modules[0]?.id || 'administration'),
    [delegatedDoctorId, setDelegatedDoctorId] = useState('');

  const changeDoctor = async (nextId) => {
    if (delegatedDoctorId && delegatedDoctorId !== nextId) {
      try {
        await cmipApi.endDelegatedDoctorSession(delegatedDoctorId);
      } catch (e) {
        console.warn('Falha ao encerrar sessão delegada anterior', e);
      }
    }
    setDelegatedDoctorId(nextId);
  };

  const changeModule = async (nextId) => {
    if (active === 'doctor' && nextId !== 'doctor' && delegatedDoctorId) {
      try {
        await cmipApi.endDelegatedDoctorSession(delegatedDoctorId);
      } catch (e) {
        console.warn('Falha ao encerrar sessão delegada ao trocar de módulo', e);
      }
      setDelegatedDoctorId('');
    }
    setActive(nextId);
  };

  return (
    <div className="min-h-screen bg-cmip-950">
      <nav
        aria-label="Módulos operacionais"
        className="sticky top-0 z-50 border-b border-cmip-600/40 bg-cmip-950/95 px-4 py-3 backdrop-blur"
      >
        <div className="mx-auto flex max-w-7xl flex-wrap gap-2">
          {modules.map((module) => (
            <button
              key={module.id}
              aria-current={active === module.id ? 'page' : undefined}
              onClick={() => changeModule(module.id)}
              className={`rounded-xl px-4 py-2 text-sm font-black transition ${active === module.id ? 'bg-cmip-500 text-cmip-950' : 'bg-cmip-900 text-cmip-100 hover:bg-cmip-800'}`}
            >
              {module.label}
            </button>
          ))}
        </div>
      </nav>
      {active === 'reception' ? (
        <Reception profile={profile} />
      ) : active === 'doctor' ? (
        <DelegatedDoctorModule profile={profile} doctorId={delegatedDoctorId} onDoctorChange={changeDoctor} />
      ) : (
        <Admin profile={profile} />
      )}
    </div>
  );
}
