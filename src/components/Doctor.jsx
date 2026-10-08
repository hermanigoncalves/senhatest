import React, { useEffect, useRef, useState } from 'react';
import { cmipApi } from '../utils/cmipApi';
import { telemetry } from '../utils/telemetry';
import { createTicker } from '../utils/ticker';
import { createLatestGuard } from '../utils/latest';
import { Shell } from './Shell';
import { RotateCcw, Stethoscope, Check, UserX } from 'lucide-react';
import { Button, Card, err, publicPatientName } from './ui';

export function Doctor({ profile, actingDoctor = null }) {
  const [offices, setOffices] = useState([]),
    [queue, setQueue] = useState([]),
    [pendingOffice, setPendingOffice] = useState(''),
    [session, setSession] = useState(null),
    [msg, setMsg] = useState(''),
    [busy, setBusy] = useState(false),
    [actionBusy, setActionBusy] = useState(''),
    [presence, setPresence] = useState('offline');
  const heartbeatFailures = useRef(0);
  const loadGuard = useRef(createLatestGuard());
  const delegated = Boolean(actingDoctor?.doctor_id),
    doctorId = actingDoctor?.doctor_id;

  const load = async () => {
    const mine = loadGuard.current.next();
    try {
      const [o, q, s] = await Promise.all([
        delegated ? cmipApi.delegatedOffices(doctorId) : cmipApi.offices(),
        delegated ? cmipApi.delegatedDoctorQueue(doctorId) : cmipApi.doctorQueue(),
        delegated ? cmipApi.delegatedDoctorSession(doctorId) : cmipApi.myDoctorSession(),
      ]);
      // Resposta antiga (Realtime/timer/ação ao mesmo tempo) não pode sobrescrever uma mais nova.
      if (!loadGuard.current.isLatest(mine)) return;
      setOffices(o || []);
      setQueue(q || []);
      setSession(s || null);
      if (s?.office_id) setPendingOffice(s.office_id);
      if (!s) setPresence('offline');
    } catch (e) {
      if (loadGuard.current.isLatest(mine)) setMsg(err(e));
    }
  };

  useEffect(() => {
    load();
    return cmipApi.subscribe(
      `doctor-queue-${doctorId || 'self'}`,
      ['medical_queue', 'doctor_sessions'],
      load
    );
  }, [doctorId]);

  useEffect(() => () => cmipApi.cleanupBroadcastChannels(), []);

  useEffect(() => {
    if (!session) {
      setPresence('offline');
      heartbeatFailures.current = 0;
      return;
    }
    let stopped = false;
    const beat = async () => {
      try {
        if (delegated) await cmipApi.delegatedDoctorHeartbeat(doctorId);
        else await cmipApi.doctorHeartbeat();
        if (!stopped) {
          heartbeatFailures.current = 0;
          setPresence('online');
        }
      } catch (e) {
        if (!stopped) {
          heartbeatFailures.current += 1;
          setPresence(heartbeatFailures.current >= 2 ? 'offline' : 'reconnecting');
          console.warn('Heartbeat médico falhou', e);
        }
      }
    };
    setPresence('reconnecting');
    beat();
    // Ticker em Worker: aba em segundo plano não é estrangulada (a janela de presença no backend é de 45s).
    const stopTicker = createTicker(beat, 15000);
    return () => {
      stopped = true;
      stopTicker();
    };
  }, [session?.session_id, doctorId]);

  const start = async () => {
    if (!pendingOffice || busy) return;
    setBusy(true);
    setMsg('');
    try {
      if (delegated) await cmipApi.startDelegatedDoctorSession(doctorId, pendingOffice);
      else await cmipApi.startSession(pendingOffice);
      setPresence('reconnecting');
      await load();
      setMsg('Atendimento iniciado. Você está disponível para a Recepção.');
    } catch (e) {
      console.error('Falha ao iniciar/mudar sessão médica', e);
      setMsg(`Não foi possível iniciar o atendimento neste consultório. ${err(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const end = async () => {
    if (busy) return;
    setBusy(true);
    setMsg('');
    try {
      if (delegated) await cmipApi.endDelegatedDoctorSession(doctorId);
      else await cmipApi.endSession();
      setPresence('offline');
      await load();
      setMsg('Atendimento encerrado.');
    } catch (e) {
      console.error('Falha ao encerrar sessão médica', e);
      setMsg(`Não foi possível encerrar o atendimento. ${err(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const allowed = (status, action) => {
    const map = {
      waiting: ['call', 'absent'],
      called: ['recall', 'start', 'absent', 'return'],
      in_service: ['finish'],
      absent: ['return'],
    };
    return (map[String(status)] || []).includes(action);
  };

  const act = async (id, action) => {
    const targetItem = queue.find((x) => x.id === id);
    if (!targetItem || actionBusy || !allowed(targetItem.status, action)) return;
    const isCall = action === 'call' || action === 'recall';
    if (isCall && !session) {
      setMsg('Inicie uma sessão médica antes de chamar.');
      return;
    }
    setActionBusy(`${id}:${action}`);
    setMsg('');
    const t0_timestamp = Date.now();
    try {
      if (delegated) await cmipApi.delegatedDoctorQueueAction(doctorId, id, action);
      else await cmipApi.queueAction(id, action);

      if (isCall) {
        // A sessão já foi validada antes da ação; evita uma segunda RPC sequencial.
        const activeSession = session;
        if (!activeSession?.office_id) throw new Error('Sessão médica ativa não encontrada após a chamada.');

        // Depois que a ação foi persistida, painel-alvo e evento canônico podem ser buscados em paralelo.
        const panelsPromise = cmipApi.panelsForOffice(activeSession.office_id);
        const canonicalPromise = cmipApi.latestMedicalCallEvent(id).catch((e) => {
          console.warn('RPC de evento canônico ainda não disponível', e);
          return null;
        });
        const [targetPanels, initialCanonical] = await Promise.all([panelsPromise, canonicalPromise]);
        let canonical = initialCanonical;

        if (!canonical && targetPanels[0]) {
          try {
            const state = await cmipApi.panelState(targetPanels[0]);
            canonical =
              [state?.current, ...(state?.history || [])]
                .filter(Boolean)
                .find(
                  (e) =>
                    e.kind === 'medical' &&
                    e.patient_name === targetItem.patient_name &&
                    (!e.at || Date.parse(e.at) >= t0_timestamp - 3000)
                ) || null;
          } catch (e) {
            console.warn('Falha ao localizar evento médico canônico', e);
          }
        }

        if (canonical?.event_key && targetPanels.length) {
          const t3_timestamp = Date.now();
          const broadcastPayload = {
            event_key: canonical.event_key,
            display_number: null,
            destination: canonical.destination || activeSession.office_name || 'Consultório',
            kind: 'medical',
            patient_name: publicPatientName(canonical.patient_name || targetItem.patient_name || 'Paciente'),
            is_recall: action === 'recall',
            t0_timestamp,
            t3_timestamp,
            at: canonical.at || new Date(t3_timestamp).toISOString(),
          };
          const results = await Promise.all(
            targetPanels.map((s) => cmipApi.broadcastCall(s, broadcastPayload))
          );
          const broadcastOk = results.every(Boolean);
          telemetry.mark(canonical.event_key, 'T3', {
            broadcastSent: broadcastOk,
            targetPanels,
            wallTime: t3_timestamp,
          });
          if (!broadcastOk)
            setMsg(
              'Chamada registrada, mas o envio instantâneo à TV falhou; o painel deve recuperar pelo Realtime/polling.'
            );
        }
      }
      await load();
    } catch (e) {
      setMsg(err(e));
    } finally {
      setActionBusy('');
    }
  };

  const presenceLabel = !session
    ? 'Offline'
    : presence === 'online'
      ? `Online • ${session.office_name}`
      : presence === 'reconnecting'
        ? `Reconectando • ${session.office_name}`
        : `Offline • sessão sem heartbeat confirmado`;
  const presenceClass =
    presence === 'online'
      ? 'text-emerald-300'
      : presence === 'reconnecting'
        ? 'text-amber-300'
        : 'text-rose-300';

  return (
    <Shell
      profile={profile}
      onBeforeLogout={delegated ? () => cmipApi.endDelegatedDoctorSession(doctorId) : null}
    >
      <Card>
        {delegated && (
          <div className="mb-5 rounded-2xl border border-amber-500/40 bg-amber-950/40 p-4">
            <b className="text-amber-200">Contexto delegado</b>
            <p className="text-sm text-amber-100/80">
              Médico responsável: {actingDoctor.doctor_name}. Executor auditado: {profile.full_name}.
            </p>
          </div>
        )}
        <div className="flex flex-wrap justify-between gap-3">
          <div>
            <h2 className="text-xl font-black flex gap-2">
              <Stethoscope /> {delegated ? `Fila de ${actingDoctor.doctor_name}` : 'Minha fila'}
            </h2>
            <p className={`text-sm mt-2 ${presenceClass}`}>{presenceLabel}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              aria-label="Consultório"
              className="bg-cmip-950 p-3 rounded-xl"
              value={pendingOffice}
              onChange={(e) => setPendingOffice(e.target.value)}
            >
              <option value="">Selecione consultório</option>
              {offices.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <Button disabled={!pendingOffice || busy} onClick={start}>
              {busy ? 'Aguarde…' : 'Iniciar/mudar'}
            </Button>
            <Button disabled={busy || !session} className="bg-slate-700 text-white" onClick={end}>
              Encerrar
            </Button>
          </div>
        </div>
        {msg && (
          <p className="my-3 text-amber-300" role="status">
            {msg}
          </p>
        )}
        <div className="space-y-3 mt-5">
          {queue.map((q) => {
            const isBusy = Boolean(actionBusy);
            return (
              <div
                key={q.id}
                className="p-4 bg-cmip-950 rounded-2xl flex flex-wrap justify-between items-center gap-2"
              >
                <div>
                  <b>{q.patient_name}</b>
                  <p className="text-xs text-cmip-100/60">
                    {q.status} • {q.office_name || session?.office_name || 'sessão não iniciada'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={isBusy || !allowed(q.status, 'call') || !session}
                    onClick={() => act(q.id, 'call')}
                  >
                    Chamar
                  </Button>
                  <Button
                    disabled={isBusy || !allowed(q.status, 'recall') || !session}
                    aria-label="Rechamar paciente"
                    onClick={() => act(q.id, 'recall')}
                  >
                    <RotateCcw className="w-4" />
                  </Button>
                  <Button disabled={isBusy || !allowed(q.status, 'start')} onClick={() => act(q.id, 'start')}>
                    <Check className="w-4" /> Iniciar
                  </Button>
                  <Button
                    disabled={isBusy || !allowed(q.status, 'absent')}
                    aria-label="Marcar ausente"
                    onClick={() => act(q.id, 'absent')}
                  >
                    <UserX className="w-4" />
                  </Button>
                  <Button
                    disabled={isBusy || !allowed(q.status, 'finish')}
                    onClick={() => act(q.id, 'finish')}
                  >
                    Finalizar
                  </Button>
                  <Button
                    disabled={isBusy || !allowed(q.status, 'return')}
                    onClick={() => act(q.id, 'return')}
                  >
                    Aguardando
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </Shell>
  );
}
