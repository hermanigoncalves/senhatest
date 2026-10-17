import React, { useEffect, useRef, useState } from 'react';
import { cmipApi } from '../utils/cmipApi';
import { formatCpf, isValidCpf, digits } from '../utils/validation';
import { CAPABILITIES, hasCapability } from '../utils/capabilities';
import { createLatestGuard } from '../utils/latest';
import { Shell } from './Shell';
import { TicketCaller } from './TicketCaller';
import { MAX_TICKET_NUMBER, patientLabel, ticketPatientName } from '../utils/ticketPatient';
import { statusLabel } from '../utils/labels';
import { Search, Ticket, UserPlus } from 'lucide-react';
import { DoctorPicker } from './DoctorPicker';
import { Button, Field, Card, err } from './ui';

const emptyPatient = {
  full_name: '',
  birth_date: '',
  cpf: '',
  phone: '',
  zip_code: '',
  street: '',
  street_number: '',
  complement: '',
  district: '',
  city: '',
  state: '',
};
function PatientFlow({ profile }) {
  const [query, setQuery] = useState(''),
    [patients, setPatients] = useState([]),
    [selected, setSelected] = useState(null),
    [form, setForm] = useState(emptyPatient),
    [doctors, setDoctors] = useState([]),
    [ticketNumber, setTicketNumber] = useState(''),
    [modal, setModal] = useState(false),
    [msg, setMsg] = useState(''),
    [busy, setBusy] = useState(false);
  const doctorsGuard = useRef(createLatestGuard());
  const loadDoctors = async () => {
    const mine = doctorsGuard.current.next();
    try {
      const list = await cmipApi.availableDoctors();
      if (doctorsGuard.current.isLatest(mine)) setDoctors(list);
    } catch (e) {
      if (doctorsGuard.current.isLatest(mine)) setMsg(err(e));
    }
  };
  useEffect(() => {
    loadDoctors();
    const poll = setInterval(loadDoctors, 15000);
    const off = cmipApi.subscribe('reception-doctors', ['doctor_sessions'], loadDoctors);
    return () => {
      clearInterval(poll);
      off();
    };
  }, []);
  const search = async () => {
    try {
      setMsg('');
      setPatients(await cmipApi.searchPatients(query));
    } catch (e) {
      setMsg(err(e));
    }
  };
  const cep = async () => {
    const z = digits(form.zip_code);
    if (z.length !== 8) return;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${z}/json/`, { signal: AbortSignal.timeout(6000) }),
        d = await r.json();
      if (!d.erro)
        setForm((p) => ({
          ...p,
          street: d.logradouro || p.street,
          district: d.bairro || p.district,
          city: d.localidade || p.city,
          state: d.uf || p.state,
        }));
      else setMsg('CEP não encontrado; preencha o endereço manualmente.');
    } catch {
      setMsg('CEP indisponível; preencha o endereço manualmente.');
    }
  };
  const create = async (e) => {
    e.preventDefault();
    if (form.cpf && !isValidCpf(form.cpf)) {
      setMsg('CPF inválido.');
      return;
    }
    setBusy(true);
    try {
      const saved = await cmipApi.savePatient({ ...form, cpf: digits(form.cpf) || null });
      setSelected(saved);
      setForm(emptyPatient);
      setModal(false);
      setPatients([]);
      setMsg(`${saved.full_name} cadastrado e selecionado.`);
    } catch (e) {
      setMsg(err(e));
    } finally {
      setBusy(false);
    }
  };
  const enqueueTicket = async (doctorId) => {
    const name = ticketPatientName(ticketNumber);
    if (!name || busy) {
      if (!name) setMsg(`Informe uma senha entre 1 e ${MAX_TICKET_NUMBER}.`);
      return;
    }
    setBusy(true);
    try {
      await cmipApi.enqueueByTicket(
        ticketNumber,
        doctorId,
        hasCapability(profile.role, CAPABILITIES.RECEPTION_SUPERUSER)
      );
      setMsg(`${patientLabel(name)} encaminhada com sucesso.`);
      setTicketNumber('');
      await loadDoctors();
    } catch (e) {
      setMsg(err(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="lg:col-span-2">
      <div className="mb-6 pb-6 border-b border-cmip-600/30">
        <h2 className="text-xl font-black flex gap-2">
          <Ticket /> Encaminhar por senha
        </h2>
        <p className="text-xs text-cmip-100/60 mt-1">
          O paciente é chamado pelo número da senha, na TV, na voz e no consultório.
        </p>
        <div className="flex gap-2 mt-3 max-w-xs">
          <Field
            aria-label="Número da senha"
            type="number"
            min="1"
            max={MAX_TICKET_NUMBER}
            placeholder="Nº da senha"
            value={ticketNumber}
            onChange={(e) => setTicketNumber(e.target.value)}
          />
        </div>
        {ticketNumber !== '' && !ticketPatientName(ticketNumber) && (
          <p className="text-xs text-amber-200 mt-2">Senha deve ser um número de 1 a {MAX_TICKET_NUMBER}.</p>
        )}
        {ticketPatientName(ticketNumber) && (
          <div className="mt-3">
            <p className="text-sm font-bold mb-2">
              Encaminhar {patientLabel(ticketPatientName(ticketNumber))} para:
            </p>
            <DoctorPicker doctors={doctors} busy={busy} onPick={enqueueTicket} />
          </div>
        )}
      </div>
      <div className="flex flex-wrap justify-between gap-3 items-center">
        <h2 className="text-xl font-black flex gap-2">
          <UserPlus /> Cadastro de pacientes
        </h2>
        <Button
          className="bg-slate-700 text-white"
          onClick={() => {
            setForm(emptyPatient);
            setModal(true);
          }}
        >
          + Cadastrar paciente
        </Button>
      </div>
      <div className="flex gap-2 mt-5">
        <Field
          placeholder="Nome ou CPF"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') search();
          }}
        />
        <Button onClick={search}>
          <Search className="w-4" /> Buscar
        </Button>
      </div>
      {patients.length > 0 && (
        <div className="grid md:grid-cols-2 gap-2 mt-3">
          {patients.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setSelected(p);
                setPatients([]);
              }}
              className="text-left p-3 bg-cmip-950 hover:border-cmip-400 border border-cmip-600/30 rounded-xl"
            >
              <b>{p.full_name}</b>
              <p className="text-xs text-cmip-100/60">
                {p.birth_date ? new Date(`${p.birth_date}T12:00`).toLocaleDateString('pt-BR') : ''}
              </p>
            </button>
          ))}
        </div>
      )}
      {selected && (
        <div className="mt-5 space-y-5">
          <div aria-label="Paciente selecionado">
            <h3 className="text-xl font-black">{selected.full_name}</h3>
            <div className="text-sm text-cmip-100/70 mt-2 flex flex-wrap gap-x-5 gap-y-1">
              <span>
                Nascimento:{' '}
                {selected.birth_date
                  ? new Date(`${selected.birth_date}T12:00`).toLocaleDateString('pt-BR')
                  : '—'}
              </span>
              {selected.cpf && <span>CPF: {formatCpf(selected.cpf)}</span>}
              {selected.phone && <span>Telefone: {selected.phone}</span>}
            </div>
          </div>
        </div>
      )}
      {msg && <p className="mt-4 text-amber-200">{msg}</p>}
      {modal && (
        <div
          className="fixed inset-0 z-50 bg-black/70 grid place-items-center p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModal(false);
          }}
        >
          <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-black">Cadastrar paciente</h2>
              <button onClick={() => setModal(false)} className="text-2xl" aria-label="Fechar">
                ×
              </button>
            </div>
            <form className="grid md:grid-cols-2 gap-3" onSubmit={create}>
              <Field
                required
                placeholder="Nome completo *"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              />
              <Field
                required
                type="date"
                value={form.birth_date}
                onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
              />
              <Field
                placeholder="CPF"
                value={form.cpf || ''}
                onChange={(e) => setForm({ ...form, cpf: formatCpf(e.target.value) })}
              />
              <Field
                placeholder="Telefone"
                value={form.phone || ''}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
              <Field
                placeholder="CEP"
                value={form.zip_code || ''}
                onBlur={cep}
                onChange={(e) => setForm({ ...form, zip_code: e.target.value })}
              />
              <Field
                placeholder="Endereço"
                value={form.street || ''}
                onChange={(e) => setForm({ ...form, street: e.target.value })}
              />
              <Field
                placeholder="Número"
                value={form.street_number || ''}
                onChange={(e) => setForm({ ...form, street_number: e.target.value })}
              />
              <Field
                placeholder="Complemento"
                value={form.complement || ''}
                onChange={(e) => setForm({ ...form, complement: e.target.value })}
              />
              <Field
                placeholder="Bairro"
                value={form.district || ''}
                onChange={(e) => setForm({ ...form, district: e.target.value })}
              />
              <Field
                placeholder="Cidade"
                value={form.city || ''}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
              <Field
                placeholder="UF"
                maxLength="2"
                value={form.state || ''}
                onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })}
              />
              <div className="md:col-span-2 flex justify-end gap-2">
                <Button type="button" className="bg-slate-700 text-white" onClick={() => setModal(false)}>
                  Cancelar
                </Button>
                <Button disabled={busy}>{busy ? 'Salvando…' : 'Salvar paciente'}</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </Card>
  );
}
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
        <PatientFlow profile={profile} />
        <TransferQueue />
      </div>
    </Shell>
  );
}
