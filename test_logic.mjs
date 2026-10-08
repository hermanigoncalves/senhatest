import './test_env.mjs';
import assert from 'node:assert/strict';
import { isRemoteTtsPhraseAllowed } from './src/utils/ttsPolicy.js';
import { formatTextForSpeech, destinationPhrase, pickVoices, speakTicketViaEndpoint, chimeDataUri } from './src/utils/audio.js';
import { normalizeTvEvent, stableEventKey } from './src/utils/tvEvents.js';
import { isTvPath, tvSlug } from './src/utils/routes.js';
import { createLatestGuard } from './src/utils/latest.js';
import { createTicker } from './src/utils/ticker.js';
import { telemetry } from './src/utils/telemetry.js';
import { cmipApi, functionErrorMessage } from './src/utils/cmipApi.js';
import { supabase } from './src/utils/supabaseClient.js';
import { publicPatientName } from './src/utils/patient.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let count = 0;
const test = async (name, fn) => {
  try {
    await fn();
    count += 1;
  } catch (e) {
    console.error(`✗ ${name}`);
    throw e;
  }
};

// ---------------------------------------------------------------------------------------------------------
// TTS: nomes de pacientes nunca saem do aparelho
// ---------------------------------------------------------------------------------------------------------
await test('política de TTS aceita somente frases de senha', () => {
  for (const ok of [
    'Senha 45. Guichê 1.',
    'Senha 0045. Guichê 01.',
    'Atenção, atendimento preferencial. Senha 7. Guichê 2.',
    'Senha 150. Recepção 1.',
    '1',
    '0045',
  ]) assert.equal(isRemoteTtsPhraseAllowed(ok), true, ok);

  for (const bad of [
    '',
    '   ',
    'Atenção. Paciente João S., dirigir-se ao Consultório 1.',
    'Atenção. Paciente Maria Aparecida, dirigir-se à Sala 3.',
    'Paciente João',
    'Senha 45. Guichê 1. Paciente João Silva.',
    'Senha 45. Guichê (1).',
    'Senha 45. Guichê 1, João.',
    'Olá mundo',
    'x'.repeat(500),
  ]) assert.equal(isRemoteTtsPhraseAllowed(bad), false, bad);
  assert.equal(isRemoteTtsPhraseAllowed(null), false);
  assert.equal(isRemoteTtsPhraseAllowed(undefined), false);
});

await test('frase falada de senha é permitida e de paciente é bloqueada (ponta a ponta)', () => {
  const ticket = formatTextForSpeech({ number: '0045', desk: 'Guichê 01' });
  assert.equal(ticket, 'Senha 45. Guichê 1.');
  assert.equal(isRemoteTtsPhraseAllowed(ticket), true);

  const medical = formatTextForSpeech({ patientName: 'João S.', officeName: 'Consultório 2' });
  assert.equal(medical, 'Atenção. Paciente João S., dirigir-se ao Consultório 2.');
  assert.equal(isRemoteTtsPhraseAllowed(medical), false);
});

await test('speakTicketViaEndpoint recusa frase com nome sem tocar a rede', async () => {
  await assert.rejects(() => speakTicketViaEndpoint(formatTextForSpeech({ patientName: 'Maria S.', officeName: 'Sala 3' })), /dados pessoais/);
});

await test('concordância: "ao Consultório" / "à Sala"', () => {
  assert.equal(destinationPhrase('Consultório 1'), 'ao Consultório 1');
  assert.equal(destinationPhrase('Guichê 3'), 'ao Guichê 3');
  assert.equal(destinationPhrase('Sala 3'), 'à Sala 3');
  assert.equal(destinationPhrase('Recepção'), 'à Recepção');
  assert.equal(destinationPhrase('Clínica Geral 2'), 'à Clínica Geral 2');
  assert.equal(formatTextForSpeech({ patientName: 'Ana P.', officeName: 'Sala 3' }), 'Atenção. Paciente Ana P., dirigir-se à Sala 3.');
});

await test('voz: prefere voz local; voz de rede só serve como alternativa', () => {
  const remote = { name: 'Google português do Brasil', lang: 'pt-BR', localService: false };
  const local = { name: 'Microsoft Maria', lang: 'pt-BR', localService: true };
  const en = { name: 'English', lang: 'en-US', localService: true };
  assert.equal(pickVoices([remote, local, en]).local, local);
  assert.equal(pickVoices([remote, en]).local, null, 'sem voz local, nenhuma voz é usada para frases com nome');
  assert.equal(pickVoices([remote, en]).any, remote);
  assert.deepEqual(pickVoices([en]), { local: null, any: null });
  assert.deepEqual(pickVoices([]), { local: null, any: null });
});

await test('campainha: WAV válido, sem clipping, ding e dong presentes', () => {
  const bytes = Buffer.from(chimeDataUri.split(',')[1], 'base64');
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  const samples = new Int16Array(bytes.buffer, bytes.byteOffset + 44, (bytes.length - 44) / 2);
  const rate = 22050;
  const peak = (from, to) => {
    let m = 0;
    for (let i = Math.floor(from * rate); i < Math.floor(to * rate); i += 1) m = Math.max(m, Math.abs(samples[i]));
    return m;
  };
  assert(peak(0, 1.2) < 32767, 'sem clipping');
  assert(peak(0, 0.2) > 5000, 'ding audível');
  assert(peak(0.5, 0.8) > 3000, 'dong audível depois do ding');
  assert(Math.abs(samples[samples.length - 1]) < 50, 'termina sem corte brusco');
});

// ---------------------------------------------------------------------------------------------------------
// TV: chave de evento estável (sem Date.now()) e normalização
// ---------------------------------------------------------------------------------------------------------
await test('chave do evento é estável quando o payload não traz id', async () => {
  const payload = { kind: 'ticket', display_number: '0045', destination: 'Guichê 1', at: '2026-10-08T10:00:00Z' };
  const a = normalizeTvEvent(payload);
  await sleep(5);
  const b = normalizeTvEvent({ ...payload });
  assert.equal(a.event_key, b.event_key, 'a mesma chamada precisa ter a mesma chave em consultas diferentes');
  const other = normalizeTvEvent({ ...payload, at: '2026-10-08T10:05:00Z' });
  assert.notEqual(a.event_key, other.event_key, 'uma nova chamada do mesmo número tem outro horário e outra chave');
  assert.equal(normalizeTvEvent({ event_key: 'm123', kind: 'medical' }).event_key, 'm123');
  assert.equal(stableEventKey({ id: 77 }), 't77');
  assert.equal(normalizeTvEvent(null), null);
});

await test('normalização da TV preserva campos usados na tela', () => {
  const e = normalizeTvEvent({ event_key: 'm1', kind: 'medical', patient_name: 'Maria S.', destination: 'Sala 3', is_recall: true });
  assert.equal(e.kind, 'medical');
  assert.equal(e.patientName, 'Maria S.');
  assert.equal(e.officeName, 'Sala 3');
  assert.equal(e.isRepeat, true);
  assert.equal(normalizeTvEvent({ kind: 'ticket', display_number: '0001' }).desk, 'Guichê');
});

await test('nome público do paciente é abreviado', () => {
  assert.equal(publicPatientName('Maria Aparecida Souza'), 'Maria S.');
  assert.equal(publicPatientName('João'), 'João');
  assert.equal(publicPatientName(''), 'Paciente');
});

// ---------------------------------------------------------------------------------------------------------
// Rotas
// ---------------------------------------------------------------------------------------------------------
await test('rota de TV não casa com /tvqualquercoisa', () => {
  assert.equal(isTvPath('/tv'), true);
  assert.equal(isTvPath('/tv/'), true);
  assert.equal(isTvPath('/tv/TV1'), true);
  assert.equal(isTvPath('/tvqualquercoisa'), false);
  assert.equal(isTvPath('/'), false);
  assert.equal(isTvPath('/admin/tv'), false);
  assert.equal(tvSlug('/tv/TV1'), 'TV1');
  assert.equal(tvSlug('/tv/TV%201'), 'TV 1');
  assert.equal(tvSlug('/tv', '?panel=recepcao2'), 'recepcao2');
  assert.equal(tvSlug('/tv'), 'recepcao');
  assert.equal(tvSlug('/tv/%E0%A4%A'), '%E0%A4%A', 'slug malformado não derruba a tela');
});

// ---------------------------------------------------------------------------------------------------------
// Respostas antigas, ticker e telemetria
// ---------------------------------------------------------------------------------------------------------
await test('guarda de respostas antigas', () => {
  const g = createLatestGuard();
  const first = g.next();
  const second = g.next();
  assert.equal(g.isLatest(first), false);
  assert.equal(g.isLatest(second), true);
});

await test('ticker dispara no intervalo e para ao cancelar', async () => {
  let n = 0;
  const stop = createTicker(() => (n += 1), 20);
  await sleep(110);
  assert(n >= 3, `esperava >= 3 disparos, houve ${n}`);
  stop();
  const after = n;
  await sleep(80);
  assert.equal(n, after, 'não dispara depois de cancelado');
});

await test('telemetria limita memória (operações que nunca terminam)', () => {
  const log = console.log;
  console.log = () => {};
  try {
    telemetry.clear();
    for (let i = 0; i < 400; i += 1) telemetry.mark(`ticket-op-${i}`, 'T0');
    assert.equal(telemetry.getReport('ticket-op-0'), null, 'as mais antigas são descartadas');
    assert.notEqual(telemetry.getReport('ticket-op-399'), null);
    telemetry.clear();
  } finally {
    console.log = log;
  }
});

// ---------------------------------------------------------------------------------------------------------
// API: erros aparecem como erros
// ---------------------------------------------------------------------------------------------------------
const chain = (result) => {
  const proxy = new Proxy(function () {}, {
    get: (_t, prop) => (prop === 'then' ? (res) => Promise.resolve(result).then(res) : () => proxy),
  });
  return proxy;
};

await test('erro de leitura (RLS/rede) não vira lista vazia', async () => {
  const originalFrom = supabase.from;
  supabase.from = () => chain({ data: null, error: { message: 'permission denied for view doctor_queue_view' } });
  try {
    // O erro do PostgREST pode ser um objeto simples ou uma classe; a UI usa apenas e.message.
    const denied = (e) => /permission denied/.test(e?.message);
    await assert.rejects(() => cmipApi.servicePoints(), denied);
    await assert.rejects(() => cmipApi.receptionQueue(), denied);
    await assert.rejects(() => cmipApi.doctorQueue(), denied);
  } finally {
    supabase.from = originalFrom;
  }
  supabase.from = () => chain({ data: [{ id: 1 }], error: null });
  try {
    assert.deepEqual(await cmipApi.doctorQueue(), [{ id: 1 }]);
  } finally {
    supabase.from = originalFrom;
  }
});

await test('criar usuário mostra a mensagem real da Edge Function', async () => {
  const desc = Object.getOwnPropertyDescriptor(supabase, 'functions') || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(supabase), 'functions');
  let mock;
  Object.defineProperty(supabase, 'functions', { get: () => ({ invoke: mock }), configurable: true });
  const httpError = (status, body) => ({
    name: 'FunctionsHttpError',
    message: 'Edge Function returned a non-2xx status code',
    context: { status, clone: () => ({ json: async () => body }) },
  });
  try {
    mock = async () => ({ data: null, error: httpError(400, { error: 'Dados inválidos' }) });
    await assert.rejects(() => cmipApi.masterUserAdmin({ action: 'create' }), /Dados inválidos/);
    mock = async () => ({ data: null, error: httpError(401, {}) });
    await assert.rejects(() => cmipApi.masterUserAdmin({ action: 'create' }), /sessão expirou/);
    mock = async () => ({ data: null, error: httpError(403, {}) });
    await assert.rejects(() => cmipApi.masterUserAdmin({ action: 'create' }), /permissão/);
    mock = async () => ({ data: null, error: { name: 'FunctionsHttpError', context: { status: 400 } } });
    await assert.rejects(() => cmipApi.masterUserAdmin({ action: 'create' }), /Não foi possível concluir/);
    mock = async () => ({ data: { id: 'u1' }, error: null });
    assert.deepEqual(await cmipApi.masterUserAdmin({ action: 'create' }), { id: 'u1' });
    assert.equal(await functionErrorMessage({ context: { clone: () => ({ json: async () => { throw new Error('x'); } }) } }), null);
  } finally {
    if (desc) Object.defineProperty(supabase, 'functions', desc);
  }
});

await test('logout do médico continua mesmo se encerrar a sessão falhar', async () => {
  const origRpc = supabase.rpc;
  const origSignOut = supabase.auth.signOut;
  let signedOut = 0;
  supabase.rpc = async () => ({ data: null, error: { message: 'rede' } });
  supabase.auth.signOut = async () => {
    signedOut += 1;
    return { error: null };
  };
  const warn = console.warn;
  console.warn = () => {};
  try {
    await cmipApi.signOutDoctor();
    assert.equal(signedOut, 1);
  } finally {
    console.warn = warn;
    supabase.rpc = origRpc;
    supabase.auth.signOut = origSignOut;
  }
});

await test('subscribe agrupa rajadas de eventos e cancela timers ao sair', async () => {
  const origChannel = supabase.channel;
  const origRemove = supabase.removeChannel;
  const handlers = [];
  let statusCb;
  let removed = 0;
  const fake = {
    on: (_t, _f, cb) => {
      handlers.push(cb);
      return fake;
    },
    subscribe: (cb) => {
      statusCb = cb;
      return fake;
    },
  };
  supabase.channel = () => fake;
  supabase.removeChannel = () => {
    removed += 1;
  };
  try {
    let calls = 0;
    const off = cmipApi.subscribe('t', ['a', 'b'], () => (calls += 1), { debounceMs: 30 });
    statusCb('SUBSCRIBED');
    assert.equal(calls, 1, 'SUBSCRIBED atualiza imediatamente');
    for (let i = 0; i < 5; i += 1) handlers[i % 2]();
    assert.equal(calls, 1);
    await sleep(80);
    assert.equal(calls, 2, 'cinco eventos viram uma atualização');
    handlers[0]();
    off();
    await sleep(80);
    assert.equal(calls, 2, 'nada dispara depois do cancelamento');
    assert.equal(removed, 1);
  } finally {
    supabase.channel = origChannel;
    supabase.removeChannel = origRemove;
  }
});

console.log(`Logic tests: OK (${count} grupos)`);
process.exit(0);
