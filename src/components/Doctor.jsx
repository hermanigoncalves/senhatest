import React, { useEffect, useRef, useState } from 'react';
import { cmipApi } from '../utils/cmipApi';
import { telemetry } from '../utils/telemetry';
import { createTicker } from '../utils/ticker';
import { createLatestGuard } from '../utils/latest';
import { patientLabel } from '../utils/ticketPatient';
import { freeOffices, pickDeviceSession, readDoctorOffice, saveDoctorOffice } from '../utils/doctorOffice';
import { Shell } from './Shell';
import { OfficeTicketList } from './OfficeTicketList';
import { pendingTicketsWarning } from '../utils/officeTicketCall';
import { statusLabel } from '../utils/labels';
import { RotateCcw, Stethoscope, CheckCheck, UserX, Undo2, Megaphone, MoreHorizontal } from 'lucide-react';
import { Button, Card, err, publicPatientName, buttonColors } from './ui';

export function Doctor({ profile, actingDoctor = null }) {
  const [offices, setOffices] = useState([]),
    [queue, setQueue] = useState([]),
    [pendingOffice, setPendingOffice] = useState(''),
    [session, setSession] = useState(null),
    [msg, setMsg] = useState(''),
    [loadError, setLoadError] = useState(''),
    [busy, setBusy] = useState(false),
    [actionBusy, setActionBusy] = useState(''),
    [presence, setPresence] = useState('offline'),
    [changingOffice, setChangingOffice] = useState(false);
  const heartbeatFailures = useRef(0);
  const loadGuard = useRef(createLatestGuard());
  const delegated = Boolean(actingDoctor?.doctor_id),
    doctorId = actingDoctor?.doctor_id;
  // O consultório deste aparelho fica salvo e é reativado sozinho ao abrir a tela. O mesmo login pode ter
  // consultórios abertos em outros computadores: esta tela só enxerga e mexe no seu.
  const officeOwner = doctorId || profile.id;
  const deviceOffice = useRef(readDoctorOffice(officeOwner));
  const autoStartTried = useRef(false);
  // Erro de carregamento (ex.: queda de internet) fica separado das mensagens de ação e some sozinho:
  // nova tentativa a cada 5 s até a conexão voltar.
  const retryTimer = useRef(null);

  const load = async () => {
    const mine = loadGuard.current.next();
    clearTimeout(retryTimer.current);
    try {
      const [o, q, sessions] = await Promise.all([
        delegated ? cmipApi.delegatedOffices(doctorId) : cmipApi.offices(),
        delegated ? cmipApi.delegatedDoctorQueue(doctorId) : cmipApi.doctorQueue(),
        delegated ? cmipApi.delegatedDoctorSessions(doctorId) : cmipApi.myDoctorSessions(),
      ]);
      // Resposta antiga (Realtime/timer/ação ao mesmo tempo) não pode sobrescrever uma mais nova.
      if (!loadGuard.current.isLatest(mine)) return;
      setLoadError('');
      const s = pickDeviceSession(sessions, deviceOffice.current);
      // Ordem natural: Consultório 2 antes do Consultório 10.
      const free = freeOffices(o, sessions, deviceOffice.current).sort((a, b) =>
        String(a.name).localeCompare(String(b.name), 'pt-BR', { numeric: true })
      );
      setOffices(free);
      setQueue(q || []);
      setSession(s);
      if (s?.office_id) setPendingOffice(s.office_id);
      if (!s) setPresence('offline');
      return { offices: free, session: s };
    } catch (e) {
      if (loadGuard.current.isLatest(mine)) {
        setLoadError(err(e));
        retryTimer.current = setTimeout(load, 5000);
      }
    }
  };

  useEffect(() => {
    load().then((state) => {
      if (!state || state.session || autoStartTried.current) return;
      autoStartTried.current = true;
      const saved = deviceOffice.current;
      const officeId = state.offices.some((o) => o.id === saved)
        ? saved
        : state.offices.length === 1
          ? state.offices[0].id
          : '';
      if (officeId) start(officeId);
    });
    return cmipApi.subscribe(
      `doctor-queue-${doctorId || 'self'}`,
      ['medical_queue', 'doctor_sessions'],
      load
    );
  }, [doctorId]);

  useEffect(
    () => () => {
      clearTimeout(retryTimer.current);
      cmipApi.cleanupBroadcastChannels();
    },
    []
  );

  useEffect(() => {
    if (!session) {
      setPresence('offline');
      heartbeatFailures.current = 0;
      return;
    }
    let stopped = false;
    const beat = async () => {
      try {
        if (delegated) await cmipApi.delegatedDoctorHeartbeat(doctorId, session.office_id);
        else await cmipApi.doctorHeartbeat(session.office_id);
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

  const start = async (officeId) => {
    if (!officeId || busy) return;
    setPendingOffice(officeId);
    setBusy(true);
    setMsg('');
    const previousOffice = session?.office_id;
    try {
      // Senha chamada/aguardando no consultório que vai ser deixado: pergunta antes de trocar.
      // Sem internet a verificação falha e a troca segue sem perguntar.
      if (previousOffice && previousOffice !== officeId) {
        let pending = [];
        try {
          pending = (await cmipApi.officeTicketOfficeQueue(previousOffice)) || [];
        } catch (e) {
          console.warn('Falha ao verificar senhas pendentes antes da troca de consultório', e);
        }
        const warning = pendingTicketsWarning(pending, session.office_name);
        if (warning && !window.confirm(warning)) {
          setPendingOffice(previousOffice);
          return;
        }
      }
      if (delegated) await cmipApi.startDelegatedDoctorSession(doctorId, officeId);
      else await cmipApi.startSession(officeId);
      deviceOffice.current = officeId;
      saveDoctorOffice(officeOwner, officeId);
      // Troca de consultório: o banco não fecha mais o anterior sozinho (o login pode estar em vários).
      if (previousOffice && previousOffice !== officeId) {
        try {
          if (delegated) await cmipApi.endDelegatedDoctorSession(doctorId, previousOffice);
          else await cmipApi.endSession(previousOffice);
        } catch (e) {
          console.warn('Falha ao fechar o consultório anterior; o heartbeat expira em 45s', e);
        }
      }
      setPresence('reconnecting');
      await load();
      setChangingOffice(false);
    } catch (e) {
      console.error('Falha ao iniciar/mudar sessão médica', e);
      // A seleção volta ao consultório que continua aberto (sem internet, nenhum recarregamento corrige).
      setPendingOffice(previousOffice || '');
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
      const officeId = session?.office_id || deviceOffice.current;
      if (delegated) await cmipApi.endDelegatedDoctorSession(doctorId, officeId);
      else await cmipApi.endSession(officeId);
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
      called: ['recall', 'finish', 'absent', 'return'],
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
      const run = (a) =>
        delegated ? cmipApi.delegatedDoctorQueueAction(doctorId, id, a) : cmipApi.queueAction(id, a);
      // Sem etapa "Iniciar": finalizar um paciente chamado passa por "em atendimento" automaticamente.
      if (action === 'finish' && targetItem.status === 'called') await run('start');
      await run(action);

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
    ? 'Nenhum consultório ativo'
    : presence === 'online'
      ? `Online • ${session.office_name}`
      : presence === 'reconnecting'
        ? `Reconectando • ${session.office_name}`
        : `Sem conexão • ${session.office_name}`;
  const presenceClass =
    presence === 'online'
      ? 'text-cmip-400'
      : presence === 'reconnecting'
        ? 'text-amber-300'
        : 'text-rose-300';
  const showOfficePicker = !session || changingOffice;
  const nextWaitingId = queue.find((q) => q.status === 'waiting')?.id;

  return (
    <Shell
      profile={profile}
      onBeforeLogout={
        delegated
          ? async () => {
              const officeId = session?.office_id || deviceOffice.current;
              if (officeId) await cmipApi.endDelegatedDoctorSession(doctorId, officeId);
            }
          : null
      }
    >
      <Card>
        {delegated && (
          <p className="mb-5 text-sm text-amber-200">
            Atuando por {actingDoctor.doctor_name} · ações registradas em nome de {profile.full_name}
          </p>
        )}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-black flex gap-2">
              <Stethoscope /> {delegated ? `Fila de ${actingDoctor.doctor_name}` : 'Minha fila'}
            </h2>
            <p className={`text-sm mt-2 flex items-center gap-2 ${presenceClass}`}>
              <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-current" />
              {presenceLabel}
            </p>
          </div>
          {showOfficePicker ? (
            <div className="flex flex-wrap gap-2">
              <select
                aria-label="Consultório"
                className="bg-cmip-950 border border-cmip-600/50 p-3 rounded-xl"
                value={pendingOffice}
                disabled={busy}
                onChange={(e) => start(e.target.value)}
              >
                <option value="">Selecione consultório</option>
                {offices.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
              {session && (
                <Button className={buttonColors.neutral} onClick={() => setChangingOffice(false)}>
                  Cancelar
                </Button>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button className={buttonColors.switch} onClick={() => setChangingOffice(true)}>
                Trocar consultório
              </Button>
              <Button disabled={busy} className={buttonColors.end} onClick={end}>
                Encerrar
              </Button>
            </div>
          )}
        </div>
        {loadError && (
          <p className="mt-4 text-amber-300" role="status">
            {loadError}
          </p>
        )}
        {msg && (
          <p className="mt-4 text-amber-300" role="status">
            {msg}
          </p>
        )}
        {!session && queue.length > 0 && (
          <p className="mt-4 text-sm text-cmip-100/70">Escolha o consultório para começar a chamar.</p>
        )}
        {queue.length === 0 ? (
          <p className="mt-6 text-cmip-100/60">Nenhum paciente na fila.</p>
        ) : (
          <ul className="mt-5 divide-y divide-cmip-600/30 border-y border-cmip-600/30">
            {queue.map((q) => (
              <QueueRow
                key={q.id}
                item={q}
                isNext={q.id === nextWaitingId}
                busy={Boolean(actionBusy)}
                canCall={Boolean(session)}
                onAct={(action) => act(q.id, action)}
              />
            ))}
          </ul>
        )}
        {session?.office_id && (
          <OfficeTicketList officeId={session.office_id} officeName={session.office_name || 'consultório'} />
        )}
      </Card>
    </Shell>
  );
}

// Uma ação principal por status; as demais ficam no menu "Mais ações".
const PRIMARY = {
  waiting: { action: 'call', label: 'Chamar', icon: Megaphone },
  called: { action: 'finish', label: 'Finalizar', icon: CheckCheck },
  in_service: { action: 'finish', label: 'Finalizar', icon: CheckCheck },
  absent: { action: 'return', label: 'Voltar para a fila', icon: Undo2 },
};
const SECONDARY = {
  waiting: [{ action: 'absent', label: 'Marcar ausente', icon: UserX }],
  called: [
    { action: 'recall', label: 'Rechamar paciente', icon: RotateCcw },
    { action: 'absent', label: 'Marcar ausente', icon: UserX },
    { action: 'return', label: 'Voltar para aguardando', icon: Undo2 },
  ],
};
const CALL_ACTIONS = ['call', 'recall'];

function QueueRow({ item, isNext, busy, canCall, onAct }) {
  const primary = PRIMARY[item.status];
  const secondary = SECONDARY[item.status] || [];
  const menuRef = useRef(null);
  const blocked = (action) => busy || (CALL_ACTIONS.includes(action) && !canCall);
  const runSecondary = (action) => {
    menuRef.current?.removeAttribute('open');
    onAct(action);
  };
  const PrimaryIcon = primary?.icon;
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-4">
      <div className="min-w-0">
        <p className="flex items-center gap-2">
          <b className="text-lg">{patientLabel(item.patient_name)}</b>
          {isNext && (
            <span className="rounded-md bg-cmip-500/20 px-2 py-0.5 text-xs font-bold text-cmip-400">
              Próximo
            </span>
          )}
        </p>
        <p className="text-sm text-cmip-100/60">{statusLabel(item.status)}</p>
      </div>
      <div className="flex items-center gap-2">
        {primary && (
          <Button
            disabled={blocked(primary.action)}
            onClick={() => onAct(primary.action)}
            className="flex items-center gap-2"
          >
            <PrimaryIcon className="w-4" aria-hidden="true" /> {primary.label}
          </Button>
        )}
        {secondary.length > 0 && (
          <details ref={menuRef} className="relative">
            <summary
              aria-label="Mais ações"
              className="list-none cursor-pointer rounded-xl bg-cmip-900 p-3 text-cmip-100 hover:bg-cmip-800 [&::-webkit-details-marker]:hidden"
            >
              <MoreHorizontal className="w-5" aria-hidden="true" />
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-60 overflow-hidden rounded-xl border border-cmip-600/40 bg-cmip-900 shadow-lg">
              {secondary.map(({ action, label, icon: Icon }) => (
                <button
                  key={action}
                  aria-label={label}
                  disabled={blocked(action)}
                  onClick={() => runSecondary(action)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left font-bold hover:bg-cmip-800 disabled:opacity-40"
                >
                  <Icon className="w-4" aria-hidden="true" /> {label}
                </button>
              ))}
            </div>
          </details>
        )}
      </div>
    </li>
  );
}
