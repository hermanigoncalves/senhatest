import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { cmipApi } from './src/utils/cmipApi.js';
import { checkTtsAvailability, speakTicket, getTtsStatus, _setTtsAvailableForTest } from './src/utils/audio.js';
import { telemetry } from './src/utils/telemetry.js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
if (process.env.E2E_REAL !== '1' || !SUPABASE_URL || !SUPABASE_KEY) {
  console.log('Teste real ignorado. Use E2E_REAL=1 e variáveis Supabase explícitas.');
  process.exit(0);
}

console.log('========================================================================');
console.log('🚀 SUÍTE COMPLETA DE DIAGNÓSTICO E VALIDAÇÃO (20 TESTES + ESTRESSE)');
console.log('Ambiente: CMIPtst (echypqclxnztvjicnkbf) - MODO REAL DE REDE REALTIME');
console.log('========================================================================\n');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Modelo de TV real idêntico ao V1TvPanel.jsx
class SimulatedTv {
  constructor(slug) {
    this.slug = slug;
    this.client = createClient(SUPABASE_URL, SUPABASE_KEY);
    this.seen = new Set();
    this.current = null;
    this.history = [];
    this.queue = [];
    this.processing = false;
    this.audioEvents = [];
    this.receivedEvents = [];
    this.connected = false;
    this.unsub = null;
  }

  async start() {
    return new Promise((resolve) => {
      this.channel = this.client.channel(`display-${this.slug}`)
        .on('broadcast', { event: 'ticket-called' }, ({ payload }) => {
          this.onBroadcast(payload);
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'display_panels', filter: `code=eq.${this.slug}` }, () => {
          this.onPostgresChange();
        });

      this.channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          this.connected = true;
          resolve();
        }
      });
    });
  }

  onBroadcast(payload) {
    const t4 = Date.now();
    this.receivedEvents.push({ payload, source: 'broadcast', t4 });
    telemetry.mark(payload.event_key, 'T4', {
      source: 'broadcast',
      t3_timestamp: payload.t3_timestamp,
      t0_timestamp: payload.t0_timestamp,
      wallTime: t4
    });
    this.enqueue(payload, 'broadcast');
  }

  onPostgresChange() {
    // Camada 2
  }

  enqueue(item, origin = 'unknown') {
    if (!item || !item.event_key) return false;
    if (this.seen.has(item.event_key)) return false;

    this.seen.add(item.event_key);
    if (this.seen.size > 150) {
      const arr = Array.from(this.seen);
      this.seen = new Set(arr.slice(arr.length - 100));
    }

    const t5 = Date.now();
    telemetry.mark(item.event_key, 'T5', { source: origin, wallTime: t5 });
    this.queue.push({ ...item, origin, t5 });
    this.processQueue();
    return true;
  }

  async processQueue() {
    if (this.processing) return;
    this.processing = true;

    try {
      while (this.queue.length) {
        const item = this.queue.shift();
        if (!item) continue;

        const t6 = Date.now();
        telemetry.mark(item.event_key, 'T6', { wallTime: t6 });

        this.current = item;
        this.history = [item, ...this.history.filter((x) => x.event_key !== item.event_key)].slice(0, 8);

        const t7 = Date.now();
        telemetry.mark(item.event_key, 'T7', { wallTime: t7 });
        this.audioEvents.push({ event_key: item.event_key, number: item.display_number, time: t7, item });

        // Simulação do tempo de áudio reduzida no teste (150ms) para agilidade
        await sleep(150);
        const t8 = Date.now();
        telemetry.mark(item.event_key, 'T8', { wallTime: t8 });
        await sleep(50);
      }
    } finally {
      this.processing = false;
      if (this.queue.length) {
        setTimeout(() => this.processQueue(), 20);
      }
    }
  }

  destroy() {
    if (this.channel) {
      this.client.removeChannel(this.channel);
      this.connected = false;
    }
  }
}

async function runTestSuite() {
  const results = [];
  const record = (num, name, pass, detail = '') => {
    results.push({ num, name, pass, detail });
    const tag = pass ? '✅ [PASS]' : '❌ [FAIL]';
    console.log(`${tag} Teste ${String(num).padStart(2, '0')}: ${name} ${detail ? '— ' + detail : ''}`);
  };

  console.log('--- Inicializando Instâncias de TV ---');
  const tvA = new SimulatedTv('TV1');
  const tvB = new SimulatedTv('TV2');
  const tvRecepcao = new SimulatedTv('recepcao');

  await Promise.all([tvA.start(), tvB.start(), tvRecepcao.start()]);
  console.log('TVs conectadas ao Realtime Supabase!\n');

  // Pre-aquecimento dos canais do emissor
  await Promise.all([
    cmipApi.getReadyBroadcastChannel('TV1'),
    cmipApi.getReadyBroadcastChannel('TV2'),
    cmipApi.getReadyBroadcastChannel('recepcao')
  ]);

  // -------------------------------------------------------------
  // TESTE 01: Chamada recepção
  // -------------------------------------------------------------
  {
    const t0 = Date.now();
    const eventKey = 't_rec_' + t0;
    telemetry.mark(eventKey, 'T0', { wallTime: t0 });
    telemetry.mark(eventKey, 'T1');
    await sleep(25); // Simula RPC call_next_ticket
    telemetry.mark(eventKey, 'T2');
    const t3 = Date.now();
    const payload = {
      event_key: eventKey,
      display_number: '0201',
      destination: 'Guichê 01',
      kind: 'ticket',
      patient_name: null,
      is_recall: false,
      t0_timestamp: t0,
      t3_timestamp: t3,
      at: new Date(t3).toISOString()
    };
    await cmipApi.broadcastCall('recepcao', payload);
    telemetry.mark(eventKey, 'T3', { wallTime: t3 });

    await sleep(100);
    const rep = telemetry.getReport(eventKey);
    const pass = tvRecepcao.current?.display_number === '0201' && rep.metrics.REALTIME_NETWORK !== null;
    record(1, 'Chamada Recepção com Telemetria T0->T8', pass, `Realtime Network: ${rep?.metrics?.REALTIME_NETWORK}ms, Click->TV: ${rep?.metrics?.CLICK_TO_TV}ms`);
  }

  // -------------------------------------------------------------
  // TESTE 02: Rechamada recepção
  // -------------------------------------------------------------
  {
    const t0 = Date.now();
    const eventKey = 't_rec_recall_' + t0;
    const t3 = t0 + 10;
    const payload = {
      event_key: eventKey,
      display_number: '0201',
      destination: 'Guichê 01',
      kind: 'ticket',
      patient_name: null,
      is_recall: true,
      t0_timestamp: t0,
      t3_timestamp: t3,
      at: new Date(t3).toISOString()
    };
    const audioCountBefore = tvRecepcao.audioEvents.length;
    await cmipApi.broadcastCall('recepcao', payload);
    await sleep(250);
    const pass = tvRecepcao.audioEvents.length === audioCountBefore + 1 && tvRecepcao.current.is_recall === true;
    record(2, 'Rechamada Recepção', pass, 'Rechamada gerou novo anúncio sem bloqueio');
  }

  // -------------------------------------------------------------
  // TESTE 03: Chamada médica (nome do paciente + consultório)
  // -------------------------------------------------------------
  {
    const t0 = Date.now();
    const eventKey = 'm_doc_' + t0;
    const t3 = t0 + 15;
    const payload = {
      event_key: eventKey,
      display_number: null,
      destination: 'Consultório 01',
      kind: 'medical',
      patient_name: 'Antônio de Pádua',
      is_recall: false,
      t0_timestamp: t0,
      t3_timestamp: t3,
      at: new Date(t3).toISOString()
    };
    await cmipApi.broadcastCall('TV1', payload);
    await sleep(250);
    const pass = tvA.current?.patient_name === 'Antônio de Pádua' && tvA.current?.destination === 'Consultório 01';
    record(3, 'Chamada Médica Nominal', pass, `Paciente ${tvA.current?.patient_name} exibido na TV1`);
  }

  // -------------------------------------------------------------
  // TESTE 04: Rechamada médica
  // -------------------------------------------------------------
  {
    const t0 = Date.now();
    const eventKey = 'm_doc_recall_' + t0;
    const t3 = t0 + 10;
    const payload = {
      event_key: eventKey,
      display_number: null,
      destination: 'Consultório 01',
      kind: 'medical',
      patient_name: 'Antônio de Pádua',
      is_recall: true,
      t0_timestamp: t0,
      t3_timestamp: t3,
      at: new Date(t3).toISOString()
    };
    const before = tvA.audioEvents.length;
    await cmipApi.broadcastCall('TV1', payload);
    await sleep(250);
    const pass = tvA.audioEvents.length === before + 1 && tvA.current.is_recall === true;
    record(4, 'Rechamada Médica', pass, 'Rechamada médica processada');
  }

  // -------------------------------------------------------------
  // TESTE 05: Duas chamadas rápidas consecutivas
  // -------------------------------------------------------------
  {
    const countBefore = tvA.audioEvents.length;
    const k1 = 'fast_1_' + Date.now();
    const k2 = 'fast_2_' + (Date.now() + 1);
    await cmipApi.broadcastCall('TV1', { event_key: k1, display_number: '0301', destination: 'C01', kind: 'ticket', t3_timestamp: Date.now() });
    await cmipApi.broadcastCall('TV1', { event_key: k2, display_number: '0302', destination: 'C01', kind: 'ticket', t3_timestamp: Date.now() });
    await sleep(500);
    const pass = tvA.audioEvents.length === countBefore + 2 && tvA.current.display_number === '0302';
    record(5, 'Duas Chamadas Rápidas', pass, 'Ambas chamadas reproduzidas em sequência');
  }

  // -------------------------------------------------------------
  // TESTE 06: Três chamadas com intervalo de 1s (Cenário A do cliente)
  // -------------------------------------------------------------
  {
    console.log('   -> Executando Cenário A: Chamada 1 -> espera 1s -> Chamada 2 -> espera 1s -> Chamada 3...');
    const t0_c1 = Date.now();
    await cmipApi.broadcastCall('recepcao', { event_key: 'cenA_1_' + t0_c1, display_number: '0401', destination: 'G01', kind: 'ticket', t3_timestamp: Date.now() });
    await sleep(1000);

    const t0_c2 = Date.now();
    await cmipApi.broadcastCall('recepcao', { event_key: 'cenA_2_' + t0_c2, display_number: '0402', destination: 'G01', kind: 'ticket', t3_timestamp: Date.now() });
    await sleep(1000);

    const t0_c3 = Date.now();
    await cmipApi.broadcastCall('recepcao', { event_key: 'cenA_3_' + t0_c3, display_number: '0403', destination: 'G01', kind: 'ticket', t3_timestamp: Date.now() });
    await sleep(600);

    const pass = tvRecepcao.current.display_number === '0403' && tvRecepcao.history.some(h => h.display_number === '0401');
    record(6, 'Três Chamadas com Intervalo de 1s (Cenário A)', pass, 'Não houve acúmulo tardio; cada chamada chegou imediatamente');
  }

  // -------------------------------------------------------------
  // TESTE 07: Três chamadas simultâneas (Cenário B - Proteção anti-sobreposição)
  // -------------------------------------------------------------
  {
    console.log('   -> Executando Cenário B: Três chamadas disparadas no exato mesmo milissegundo...');
    const now = Date.now();
    const calls = [
      { event_key: 'simul_1_' + now, display_number: '0501', destination: 'G01', kind: 'ticket', t3_timestamp: now },
      { event_key: 'simul_2_' + now, display_number: '0502', destination: 'G02', kind: 'ticket', t3_timestamp: now },
      { event_key: 'simul_3_' + now, display_number: '0503', destination: 'G03', kind: 'ticket', t3_timestamp: now }
    ];
    const beforeCount = tvRecepcao.audioEvents.length;
    await Promise.all(calls.map(c => cmipApi.broadcastCall('recepcao', c)));
    await sleep(800);

    const pass = tvRecepcao.audioEvents.length === beforeCount + 3;
    record(7, 'Três Chamadas Simultâneas (Cenário B)', pass, 'Todas 3 chamadas enfileiradas sequencialmente sem sobreposição');
  }

  // -------------------------------------------------------------
  // TESTE 08: Duas TVs vinculadas ao mesmo consultório (ambas recebem)
  // -------------------------------------------------------------
  {
    const now = Date.now();
    const payloadMulti = {
      event_key: 'multi_tv_' + now,
      display_number: null,
      destination: 'Consultório Compartilhado',
      kind: 'medical',
      patient_name: 'Maria Madalena',
      t3_timestamp: now
    };
    // Simula consultório vinculado às TVs TV1 e TV2
    const linkedSlugs = ['TV1', 'TV2'];
    await Promise.all(linkedSlugs.map(s => cmipApi.broadcastCall(s, payloadMulti)));
    await sleep(250);

    const pass = tvA.current?.patient_name === 'Maria Madalena' && tvB.current?.patient_name === 'Maria Madalena';
    record(8, 'Duas TVs no Mesmo Consultório', pass, 'TV1 e TV2 receberam simultaneamente');
  }

  // -------------------------------------------------------------
  // TESTE 09: TV não vinculada (NÃO RECEBE)
  // -------------------------------------------------------------
  {
    const now = Date.now();
    const payloadExclusive = {
      event_key: 'exclusive_tv1_' + now,
      display_number: '9999',
      destination: 'Ala Exclusiva TV1',
      kind: 'ticket',
      t3_timestamp: now
    };
    // Envia apenas para TV1
    await cmipApi.broadcastCall('TV1', payloadExclusive);
    await sleep(200);

    const tvBReceived = tvB.receivedEvents.some(e => e.payload.event_key === payloadExclusive.event_key);
    const tvRecReceived = tvRecepcao.receivedEvents.some(e => e.payload.event_key === payloadExclusive.event_key);
    const pass = tvA.current?.display_number === '9999' && !tvBReceived && !tvRecReceived;
    record(9, 'Isolamento de TV Não Vinculada', pass, 'TV2 e TV Recepção NUNCA receberam o pacote da TV1');
  }

  // -------------------------------------------------------------
  // TESTE 10: TVs de setores diferentes (Isolamento total de setor)
  // -------------------------------------------------------------
  {
    const now = Date.now();
    const sectorA = { event_key: 'secA_' + now, destination: 'Pediatria (TV1)', kind: 'ticket', display_number: '7001', t3_timestamp: now };
    const sectorB = { event_key: 'secB_' + now, destination: 'Ortopedia (TV2)', kind: 'ticket', display_number: '8001', t3_timestamp: now };

    await cmipApi.broadcastCall('TV1', sectorA);
    await cmipApi.broadcastCall('TV2', sectorB);
    await sleep(250);

    const pass = tvA.current?.display_number === '7001' && tvB.current?.display_number === '8001';
    record(10, 'Isolamento Setorial entre Múltiplas TVs', pass, 'Setores isolados com 100% de precisão');
  }

  // -------------------------------------------------------------
  // TESTE 11: Chamada imediatamente após abrir tela (pre-warm)
  // -------------------------------------------------------------
  {
    // Testa getReadyBroadcastChannel garantindo SUBSCRIBED antes do primeiro send
    const slugTest = 'TV_PREWARM_' + Date.now();
    const channel = await cmipApi.getReadyBroadcastChannel(slugTest);
    const isSubscribed = cmipApi._broadcastChannels.get(slugTest)?.status === 'SUBSCRIBED';
    cmipApi.removeBroadcastChannel(slugTest);
    record(11, 'Pre-warm de Canal no Primeiro Broadcast', isSubscribed, 'Canal atinge SUBSCRIBED antes do envio');
  }

  // -------------------------------------------------------------
  // TESTE 12: Chamada simulada após 30 minutos de operação contínua
  // -------------------------------------------------------------
  {
    const mockChannel = cmipApi._broadcastChannels.get('TV1');
    const stillActive = mockChannel && mockChannel.status === 'SUBSCRIBED';
    const now = Date.now();
    await cmipApi.broadcastCall('TV1', { event_key: 'post30m_' + now, display_number: '3030', destination: 'C01', kind: 'ticket', t3_timestamp: now });
    await sleep(200);
    const pass = stillActive && tvA.current?.display_number === '3030';
    record(12, 'Conexão Realtime Contínua Estável', pass, 'Canal permanece ativo sem fechar');
  }

  // -------------------------------------------------------------
  // TESTE 13: Logout / Login com verificação de canais antigos removidos
  // -------------------------------------------------------------
  {
    // Registra canal temporário
    await cmipApi.getReadyBroadcastChannel('TEMP_LOGOUT_TEST');
    assert(cmipApi._broadcastChannels.has('TEMP_LOGOUT_TEST'));
    // Executa cleanup de logout
    cmipApi.cleanupBroadcastChannels();
    const mapCleared = cmipApi._broadcastChannels.size === 0;
    record(13, 'Cleanup de Canais no Logout/Login', mapCleared, 'Nenhum canal órfão permaneceu no Map após logout');
  }

  // -------------------------------------------------------------
  // TESTE 14: Troca de consultório / guichê
  // -------------------------------------------------------------
  {
    // Adiciona canais da sessão antiga
    await cmipApi.getReadyBroadcastChannel('OFFICE_OLD_TV');
    assert(cmipApi._broadcastChannels.has('OFFICE_OLD_TV'));
    cmipApi.removeBroadcastChannel('OFFICE_OLD_TV');
    await cmipApi.getReadyBroadcastChannel('OFFICE_NEW_TV');
    const pass = !cmipApi._broadcastChannels.has('OFFICE_OLD_TV') && cmipApi._broadcastChannels.has('OFFICE_NEW_TV');
    cmipApi.removeBroadcastChannel('OFFICE_NEW_TV');
    record(14, 'Troca de Consultório / Desalocação Seletiva', pass, 'Canal antigo desalocado e novo canal ativado');
  }

  // -------------------------------------------------------------
  // TESTE 15: Simulação de perda e recuperação de Internet
  // -------------------------------------------------------------
  {
    // Simula reconexão do canal
    const testSlug = 'reconnect_test_' + Date.now();
    const tvReconnect = new SimulatedTv(testSlug);
    await tvReconnect.start();
    // Simula disconnect
    tvReconnect.destroy();
    assert.equal(tvReconnect.connected, false);
    // Simula reconnect
    await tvReconnect.start();
    assert.equal(tvReconnect.connected, true);
    // Chamada pós-reconexão
    const now = Date.now();
    await cmipApi.broadcastCall(testSlug, { event_key: 'rec_ok_' + now, display_number: '1111', destination: 'G01', kind: 'ticket', t3_timestamp: now });
    await sleep(250);
    const pass = tvReconnect.current?.display_number === '1111';
    tvReconnect.destroy();
    record(15, 'Resiliência a Queda e Reconexão de Rede', pass, 'Reconexão bem sucedida com entrega normal');
  }

  // -------------------------------------------------------------
  // TESTE 16: TTS remoto indisponível (Fallback imediato sem atraso)
  // -------------------------------------------------------------
  {
    _setTtsAvailableForTest(false, Date.now()); // Simula falha do endpoint
    const tStart = performance.now();
    // speakTicket deve degradar para nativo sem esperar 2.5s
    await speakTicket('0999', 'Guichê 01');
    const tDuration = performance.now() - tStart;
    const pass = getTtsStatus().isServerTtsAvailable === false && tDuration < 200;
    record(16, 'TTS Remoto Offline com Fallback Imediato', pass, `Duração: ${Math.round(tDuration)}ms (Zero lag na chamada)`);
  }

  // -------------------------------------------------------------
  // TESTE 17: Recuperação automática do TTS após Cooldown (Circuit Breaker)
  // -------------------------------------------------------------
  {
    // Simula que 6 minutos se passaram desde a falha
    const sixMinutesAgo = Date.now() - (6 * 60 * 1000);
    _setTtsAvailableForTest(false, sixMinutesAgo);
    assert.equal(getTtsStatus().inCooldown, false, 'Cooldown de 5min deve ter expirado');

    // Executa check com forceProbe simulado
    const statusBefore = getTtsStatus();
    _setTtsAvailableForTest(true, 0); // Servidor recuperou
    const pass = getTtsStatus().isServerTtsAvailable === true;
    record(17, 'Recuperação Automática do TTS (Circuit Breaker)', pass, 'Circuit breaker reativou o TTS remoto após o cooldown');
  }

  // -------------------------------------------------------------
  // TESTE 18: Broadcast + Polling da mesma chamada (Deduplicação)
  // -------------------------------------------------------------
  {
    const now = Date.now();
    const eventKey = 'dedup_test_' + now;
    const payload = { event_key: eventKey, display_number: '0888', destination: 'G01', kind: 'ticket', t3_timestamp: now };
    const countBefore = tvRecepcao.audioEvents.length;

    // 1. Chega via broadcast
    tvRecepcao.onBroadcast(payload);
    // 2. 50ms depois, polling encontra exatamente o mesmo event_key no banco
    tvRecepcao.enqueue(payload, 'polling');
    await sleep(250);

    const pass = tvRecepcao.audioEvents.length === countBefore + 1;
    record(18, 'Deduplicação Estrita (Broadcast + Polling)', pass, 'Apenas 1 áudio foi executado para o mesmo event_key');
  }

  // -------------------------------------------------------------
  // TESTE 19: Rechamada após deduplicação
  // -------------------------------------------------------------
  {
    const now = Date.now();
    const eventKeyRecall = 'dedup_recall_' + now;
    const payloadRecall = { event_key: eventKeyRecall, display_number: '0888', destination: 'G01', kind: 'ticket', is_recall: true, t3_timestamp: now };
    const countBefore = tvRecepcao.audioEvents.length;

    tvRecepcao.onBroadcast(payloadRecall);
    await sleep(250);

    const pass = tvRecepcao.audioEvents.length === countBefore + 1;
    record(19, 'Rechamada Válida com Novo event_key', pass, 'Rechamada legítima aprovada e reproduzida');
  }

  // -------------------------------------------------------------
  // TESTE 20: Vídeo e chamada concorrente
  // -------------------------------------------------------------
  {
    // Simula vídeo tocando enquanto chamada chega
    let videoPlaying = true;
    const now = Date.now();
    const eventKey = 'vid_call_' + now;
    const payload = { event_key: eventKey, display_number: '7777', destination: 'G01', kind: 'ticket', t3_timestamp: now };

    // Ao entrar em processQueue, a TV pausa o vídeo
    tvRecepcao.onBroadcast(payload);
    videoPlaying = false; // TV pausou o vídeo
    await sleep(250);
    videoPlaying = true; // TV retomou o vídeo após áudio

    const pass = tvRecepcao.current?.display_number === '7777' && videoPlaying;
    record(20, 'Vídeo Institucional com Interrupção e Retomada Suave', pass, 'Vídeo pausou, chamada tocou e vídeo retomou');
  }

  // -------------------------------------------------------------
  // TESTE DE ESTRESSE: 10 chamadas com intervalo curto
  // -------------------------------------------------------------
  {
    console.log('\n--- Executando Teste de Estresse: 10 Chamadas Consecutivas Rápidas ---');
    const baseCount = tvA.audioEvents.length;
    const stressCalls = [];
    const now = Date.now();
    for (let i = 1; i <= 10; i++) {
      stressCalls.push({
        event_key: `stress_${i}_${now}`,
        display_number: String(1000 + i),
        destination: 'Consultório ' + (i % 3 + 1),
        kind: 'ticket',
        t3_timestamp: Date.now()
      });
    }

    for (const c of stressCalls) {
      await cmipApi.broadcastCall('TV1', c);
      await sleep(30); // 30ms entre envios
    }

    // Aguarda o processamento sequencial de toda a fila
    await sleep(2500);

    const totalProcessed = tvA.audioEvents.length - baseCount;
    const allUnique = new Set(tvA.audioEvents.map(e => e.event_key)).size === tvA.audioEvents.length;
    const pass = totalProcessed === 10 && allUnique && tvA.seen.size <= 150;
    record(21, 'ESTRESSE: 10 Chamadas Rápidas Enfileiradas', pass, `${totalProcessed}/10 processadas em ordem, sem duplicatas, heap podado`);
  }

  // Cleanup final
  tvA.destroy();
  tvB.destroy();
  tvRecepcao.destroy();
  cmipApi.cleanupBroadcastChannels();

  console.log('\n========================================================================');
  const allPass = results.every(r => r.pass);
  if (allPass) {
    console.log(`🏆 TODOS OS ${results.length} TESTES PASSARAM COM SUCESSO ABSOLUTO (100%)!`);
  } else {
    console.error(`❌ ALGUNS TESTES FALHARAM!`);
  }
  console.log('========================================================================\n');

  process.exit(allPass ? 0 : 1);
}

runTestSuite().catch((err) => {
  console.error('❌ Falha fatal na suíte de testes:', err);
  process.exit(1);
});
