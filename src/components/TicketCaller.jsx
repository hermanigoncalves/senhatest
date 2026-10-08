import React, { useEffect, useRef, useState } from 'react';
import { cmipApi } from '../utils/cmipApi';
import { telemetry, latencyLog } from '../utils/telemetry';
import { Bell, RotateCcw, Play, Hash, SlidersHorizontal } from 'lucide-react';
import { Button, Field, Card, err } from './ui';

// Painel usado apenas quando o guichê ainda não tem nenhuma TV vinculada.
const DEFAULT_PANEL = 'recepcao';

export function TicketCaller() {
  const [points, setPoints] = useState([]),
    [point, setPoint] = useState(''),
    [linkedPanels, setLinkedPanels] = useState([]),
    [initialNumber, setInitialNumber] = useState(''),
    [specificNumber, setSpecificNumber] = useState(''),
    [msg, setMsg] = useState(''),
    [counter, setCounter] = useState({ current_number: 0, next_number: 1, display_next: '0001' }),
    [current, setCurrent] = useState(null),
    [history, setHistory] = useState([]),
    [busy, setBusy] = useState(false);
  const lastEventKey = useRef(null);
  const stateSeq = useRef(0);

  const loadState = async (id = point, panels = linkedPanels) => {
    if (!id) return;
    const mySeq = ++stateSeq.current;
    try {
      const nextCounter = await cmipApi.ticketCounterState(id);
      const tv = await cmipApi.panelState(panels[0] || DEFAULT_PANEL);
      // Resposta antiga não sobrescreve uma atualização mais recente.
      if (mySeq !== stateSeq.current) return;
      setCounter(nextCounter);
      setCurrent(tv?.current?.kind === 'ticket' ? tv.current : null);
      setHistory((tv?.history || []).filter((x) => x.kind === 'ticket'));
    } catch (e) {
      if (mySeq !== stateSeq.current) return;
      console.warn('Falha ao atualizar estado do chamador', e);
      setMsg(`A chamada pode ter sido registrada, mas o estado do painel não pôde ser atualizado. ${err(e)}`);
    }
  };

  useEffect(() => {
    cmipApi
      .servicePoints()
      .then((x) => {
        setPoints(x || []);
        if (x?.[0]) setPoint(x[0].id);
      })
      .catch((e) => setMsg(err(e)));
  }, []);

  useEffect(() => () => cmipApi.cleanupBroadcastChannels(), []);

  useEffect(() => {
    if (!point) {
      setLinkedPanels([]);
      return;
    }
    let active = true;
    cmipApi.panelsForServicePoint(point).then((slugs) => {
      if (!active) return;
      setLinkedPanels(slugs);
      slugs.forEach((s) => cmipApi.getReadyBroadcastChannel(s));
      loadState(point, slugs);
    });
    return () => {
      active = false;
    };
  }, [point]);

  const setInitial = async () => {
    if (!point || !initialNumber || busy) return;
    setBusy(true);
    setMsg('');
    try {
      await cmipApi.setNextTicket(point, initialNumber);
      setMsg(`Próxima senha definida como ${String(Number(initialNumber)).padStart(4, '0')}.`);
      setInitialNumber('');
      await loadState(point, linkedPanels);
    } catch (e) {
      setMsg(err(e));
    } finally {
      setBusy(false);
    }
  };

  const runCall = async (fn, isRecall = false) => {
    if (busy || !point) return;
    setBusy(true);
    setMsg('');
    const clickTime = performance.now();
    latencyLog('click', clickTime);
    const t0_timestamp = Date.now();
    const operationKey = `ticket-op-${t0_timestamp}`;
    telemetry.mark(operationKey, 'T0', { action: isRecall ? 'recall' : 'call', wallTime: t0_timestamp });
    try {
      telemetry.mark(operationKey, 'T1');
      const r = await fn();
      const rpcResolvedTime = performance.now();
      latencyLog('rpc-resolved', rpcResolvedTime, `${(rpcResolvedTime - clickTime).toFixed(2)}ms`);

      const ticketId = r?.id || r?.ticket_id;
      let eventKey = ticketId ? `t${ticketId}` : `t${t0_timestamp}`;
      // Se a rechamada devolver o mesmo id da chamada anterior, a TV a descartaria como duplicada.
      // Um sufixo único faz a TV anunciar de novo; o polling continua deduplicando pela chave original.
      if (isRecall && eventKey === (lastEventKey.current ?? current?.event_key))
        eventKey = `${eventKey}-r${t0_timestamp}`;
      else lastEventKey.current = eventKey;
      const fallbackNumber = isRecall
        ? current?.display_number || counter.current_number
        : counter.next_number || 1;
      const displayNumber =
        r?.display_number ||
        (r?.ticket_number
          ? String(r.ticket_number).padStart(4, '0')
          : String(fallbackNumber || 1).padStart(4, '0'));
      telemetry.mark(eventKey, 'T2', { displayNumber });

      const panelsToSend = linkedPanels && linkedPanels.length > 0 ? linkedPanels : [DEFAULT_PANEL];
      const pointObj = points.find((p) => p.id === point);
      const pointName = pointObj?.name || 'Guichê';
      const t3_timestamp = Date.now();

      const broadcastPayload = {
        event_key: eventKey,
        display_number: displayNumber,
        destination: pointName,
        kind: 'ticket',
        patient_name: null,
        is_recall: isRecall,
        t0_timestamp,
        t3_timestamp,
        at: new Date(t3_timestamp).toISOString(),
      };

      // Disparo imediato do Broadcast sem esperar get_display_state
      if (panelsToSend.length) {
        panelsToSend.forEach((slug) => {
          cmipApi.broadcastCall(slug, broadcastPayload).catch((e) => console.warn('[Broadcast Error]', e));
        });
        latencyLog('broadcast-sent', performance.now(), eventKey, displayNumber);
        telemetry.mark(eventKey, 'T3', {
          broadcastSent: true,
          targetPanels: panelsToSend,
          wallTime: t3_timestamp,
        });
      }

      setMsg(`Senha ${displayNumber} chamada`);
      setSpecificNumber('');

      // Libera imediatamente a interface e atualiza estado em background
      setBusy(false);
      loadState(point, panelsToSend).catch(() => {});
    } catch (e) {
      setMsg(err(e));
      setBusy(false);
    }
  };

  return (
    <div className="lg:col-span-2 grid lg:grid-cols-12 gap-6">
      <div className="lg:col-span-7 space-y-5">
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <h2 className="text-sm font-bold text-cmip-100 uppercase tracking-wider flex items-center gap-2 mb-3">
              <Bell className="w-4 h-4 text-cmip-400" />
              Guichê / Local
            </h2>
            <select
              className="w-full bg-cmip-950 border border-cmip-500/50 text-white rounded-xl px-4 py-3 font-bold"
              value={point}
              onChange={(e) => setPoint(e.target.value)}
            >
              {points.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Card>
          <Card>
            <h2 className="text-sm font-bold text-cmip-100 uppercase tracking-wider flex items-center gap-2 mb-3">
              <SlidersHorizontal className="w-4 h-4 text-cmip-400" />
              Definir Senha Inicial
            </h2>
            <div className="flex gap-2">
              <Field
                aria-label="Senha inicial"
                type="number"
                min="1"
                max="1000"
                placeholder="Ex: 150"
                value={initialNumber}
                onChange={(e) => setInitialNumber(e.target.value)}
              />
              <Button disabled={!initialNumber || busy} onClick={setInitial}>
                Definir
              </Button>
            </div>
          </Card>
        </div>
        <div className="p-8 bg-gradient-to-br from-cmip-800/80 via-cmip-900/90 to-cmip-950 border border-cmip-500/40 rounded-3xl text-center space-y-6">
          <div>
            <span className="text-xs font-bold tracking-widest text-cmip-400 uppercase">
              Próxima Senha a Ser Chamada:{' '}
              <strong className="text-white text-sm bg-cmip-950 px-3 py-1 rounded-lg border border-cmip-500/30">
                {counter.display_next || String(counter.next_number || 1).padStart(4, '0')}
              </strong>
            </span>
            <h3 className="text-3xl font-black text-white mt-3">Chamar Próximo Paciente</h3>
            <p className="text-xs text-cmip-100/80 mt-1">Praticidade e agilidade no atendimento.</p>
          </div>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <button
              onClick={() => runCall(() => cmipApi.callNextTicket(point))}
              disabled={busy}
              className="px-10 py-5 bg-gradient-to-r from-cmip-500 to-cmip-600 text-cmip-950 rounded-2xl font-black text-xl flex items-center justify-center gap-3 disabled:opacity-50"
            >
              <Play className="w-7 h-7 fill-cmip-950" />
              CHAMAR PRÓXIMA
            </button>
            <button
              onClick={() => runCall(() => cmipApi.recallTicket(point), true)}
              disabled={busy || !(current || counter.current_number > 0)}
              className="px-6 py-5 bg-cmip-red disabled:opacity-40 text-white rounded-2xl font-bold flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-5 h-5" />
              RECHAMAR
            </button>
          </div>
        </div>
        <Card>
          <h3 className="text-sm font-bold text-cmip-100 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Hash className="w-4 h-4 text-cmip-400" />
            Chamar Número Específico
          </h3>
          <div className="flex gap-3">
            <Field
              aria-label="Senha específica"
              type="number"
              min="1"
              max="1000"
              placeholder="Ex: 45 ou 500"
              value={specificNumber}
              onChange={(e) => setSpecificNumber(e.target.value)}
            />
            <Button
              disabled={!specificNumber || busy}
              onClick={() => runCall(() => cmipApi.callSpecificTicket(point, specificNumber))}
            >
              Chamar
            </Button>
          </div>
        </Card>
        {msg && (
          <p className="text-cmip-200" role="status">
            {msg}
          </p>
        )}
      </div>
      <div className="lg:col-span-5 space-y-5">
        <Card className="text-center">
          <span className="text-xs font-bold text-cmip-400 uppercase tracking-widest">
            Senha Exibida na TV
          </span>
          <div className="my-6">
            <div className="text-6xl font-black">{current?.display_number || '---'}</div>
            <div className="text-lg font-bold text-amber-300 mt-2">
              {current?.destination || 'Aguardando...'}
            </div>
          </div>
          <div className="pt-4 border-t border-cmip-600/30 text-xs text-cmip-100/70">
            Contador atual: <strong>{counter.current_number || 0} / 1000</strong>
          </div>
        </Card>
        <Card>
          <h3 className="font-black mb-3">Últimas chamadas</h3>
          <div className="space-y-2">
            {history.slice(0, 5).map((h) => (
              <div
                key={h.event_key || h.id || `${h.display_number}-${h.at}`}
                className="flex justify-between bg-cmip-950 rounded-xl p-3"
              >
                <b>{h.display_number}</b>
                <span className="text-xs text-cmip-100/60">{h.destination}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
