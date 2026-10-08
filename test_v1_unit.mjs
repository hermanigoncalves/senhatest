import './test_env.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readApp } from './test_helpers.mjs';
import { isValidCpf, formatTicket, MIN_PASSWORD_LENGTH } from './src/utils/validation.js';
assert.equal(formatTicket(150),'0150');
assert.equal(formatTicket(1000),'1000');
assert.equal(isValidCpf('529.982.247-25'),true);
assert.equal(isValidCpf('111.111.111-11'),false);
assert.equal(isValidCpf('529.982.247-24'),false);
import { classifyProfile } from './src/utils/profile.js';
import { CAPABILITIES, hasCapability, operationalModules } from './src/utils/capabilities.js';
import { buildUsernameCandidates, isValidUsername, normalizeUsername, parseLoginIdentifier, suggestUsername } from './src/utils/identity.js';
import { cmipApi, DEFAULT_TEMP_PASSWORD } from './src/utils/cmipApi.js';
import { supabase } from './src/utils/supabaseClient.js';
assert.equal(classifyProfile(null),'missing');
assert.equal(classifyProfile({active:false,must_change_password:false,role:'doctor'}),'inactive');
assert.equal(classifyProfile({active:true,must_change_password:true,role:'doctor'}),'password_change');
assert.equal(classifyProfile({active:true,must_change_password:false,role:'doctor'}),'ready');
assert.equal(classifyProfile({active:true,must_change_password:false,role:'master'}),'ready');
assert.equal(hasCapability('receptionist',CAPABILITIES.RECEPTION),true);
assert.equal(hasCapability('receptionist',CAPABILITIES.DOCTOR_DELEGATED),false);
assert.equal(hasCapability('doctor',CAPABILITIES.DOCTOR_SELF),true);
assert.equal(hasCapability('doctor',CAPABILITIES.DOCTOR_DELEGATED),false);
assert.equal(hasCapability('admin',CAPABILITIES.RECEPTION),true);
assert.equal(hasCapability('admin',CAPABILITIES.RECEPTION_SUPERUSER),true);
assert.equal(hasCapability('admin',CAPABILITIES.DOCTOR_DELEGATED),true);
assert.equal(hasCapability('admin',CAPABILITIES.MASTER_ADMINISTRATION),true);
assert.equal(hasCapability('master',CAPABILITIES.RECEPTION),true);
assert.equal(hasCapability('master',CAPABILITIES.RECEPTION_SUPERUSER),true);
assert.equal(hasCapability('receptionist',CAPABILITIES.RECEPTION_SUPERUSER),false);
assert.equal(hasCapability('master',CAPABILITIES.DOCTOR_DELEGATED),true);
assert.equal(hasCapability('master',CAPABILITIES.MASTER_ADMINISTRATION),true);
assert.deepEqual(operationalModules('admin').map(x=>x.id),['administration','reception','doctor']);
assert.deepEqual(operationalModules('master').map(x=>x.id),['administration','reception','doctor']);
assert.equal(normalizeUsername('  João   Vicente  '),'joao.vicente');
assert.equal(normalizeUsername('PAULO-CÉSAR'),'paulo.cesar');
assert.equal(isValidUsername('joao.vicente'),true);
assert.equal(isValidUsername('João Vicente'),false);
assert.equal(isValidUsername('ab'),false);
assert.deepEqual(buildUsernameCandidates('PAULO CESAR RODRIGUES PEREIRA').slice(0,2),['paulo.cesar','paulo.pereira']);
assert.equal(suggestUsername('PAULO ROBERTO MACHADO ANTUNES').username,'paulo.roberto');
assert.equal(suggestUsername('JOÃO VICENTE PIRES JARDIM').username,'joao.vicente');
assert.equal(suggestUsername('CLEMILDO PEREIRA DA SILVA JUNIOR').username,'clemildo');
assert.equal(suggestUsername('PAULO CESAR RODRIGUES PEREIRA',['paulo.cesar']).username,'paulo.pereira');
assert.equal(suggestUsername('PAULO CESAR RODRIGUES PEREIRA',['paulo.cesar']).requiresManualReview,true);
const exhausted=buildUsernameCandidates('Ana Maria Silva');
assert.equal(suggestUsername('Ana Maria Silva',exhausted).requiresManualReview,true);
assert.deepEqual(parseLoginIdentifier('MEDICO@CMIP.LOCAL'),{kind:'email',email:'medico@cmip.local'});
assert.deepEqual(parseLoginIdentifier('joao.vicente'),{kind:'username',username:'joao.vicente'});
assert.deepEqual(parseLoginIdentifier('joão vicente'),{kind:'invalid'});
const tvSource = fs.readFileSync(new URL('./src/components/V1TvPanel.jsx', import.meta.url), 'utf8');
const apiSource = fs.readFileSync(new URL('./src/utils/cmipApi.js', import.meta.url), 'utf8');
assert(tvSource.includes('ATIVAR PAINEL'), 'TV deve exigir ativação explícita para desbloquear mídia');
assert(tvSource.includes('announceTicket'), 'TV deve reutilizar o motor de áudio comprovado do sistema antigo');
assert(apiSource.includes("table: 'display_panels'"), 'TV deve usar sinal Realtime do display, sem expor eventos públicos brutos');
const appSource = readApp();
assert(appSource.includes('activeDisplayPanels'), 'Login deve listar painéis ativos dinamicamente');
assert(apiSource.includes("list_active_display_panels"), 'API deve carregar TVs ativas via RPC pública');

console.log('V1 unit tests: OK');

// TV compatibility regression: server-side TTS from the proven legacy implementation must remain primary.
{
  const audio = fs.readFileSync(new URL('./src/utils/audio.js', import.meta.url), 'utf8');
  assert(audio.includes("/api/tts?text="), 'TV audio must use /api/tts server-side voice first');
  assert(audio.includes('speakTicketViaEndpoint'), 'legacy endpoint TTS path must exist');
  assert(audio.includes('speakTicketNative'), 'native speech must remain fallback');
  const vite = fs.readFileSync(new URL('./vite.config.js', import.meta.url), 'utf8');
  assert(vite.includes("cmip-tts-dev"), 'Vite LAN dev must expose TTS without a second server process');
}

// Doctor availability / reception UX regressions.
{
  const app = readApp();
  assert(apiSource.includes("list_available_doctors"), 'Reception must use reduced doctor availability RPC');
  assert(apiSource.includes("get_my_doctor_session"), 'Doctor UI must load its active session explicitly');
  assert(app.includes('Online •'), 'Doctor must show visible online/session state');
  assert(app.includes('+ Cadastrar paciente'), 'Reception must expose patient registration as an action');
  assert(app.includes('Cadastrar paciente'), 'Patient registration modal must exist');
  assert(app.includes('Paciente selecionado'), 'Reception must show selected patient summary');
  assert(app.includes('Nenhum médico disponível no momento.'), 'Reception must show empty doctor availability state');
}


// Doctor presence regression: availability requires heartbeat and reception re-evaluates timeout.
{
  const app = readApp();
  const api = fs.readFileSync(new URL('./src/utils/cmipApi.js', import.meta.url), 'utf8');
  assert(api.includes("doctor_heartbeat"), 'Doctor frontend must send authenticated heartbeat');
  assert(api.includes("end_doctor_session"), 'Doctor logout must end active medical session');
  assert(app.includes('createTicker(beat, 15000)'), 'Doctor heartbeat interval must be 15 seconds');
  assert(app.includes('setInterval(loadDoctors, 15000)'), 'Reception must periodically re-evaluate doctor presence');
  assert(app.includes("profile.role === 'doctor'"), 'Shell logout must use doctor-specific immediate session shutdown');
}

// Operational superuser regression: UI selection never replaces backend authorization.
{
  const app = readApp();
  const migration = fs.readFileSync(new URL('./supabase/migrations/20260929_admin_master_operational_superusers.sql', import.meta.url), 'utf8');
  assert(app.includes('SuperuserWorkspace'), 'Admin/Master must use centralized operational navigation');
  assert(app.includes('Atuar como médico'), 'Delegated doctor selector must be visible');
  assert(!app.includes('Editar identidade'), 'Broken identity editing must not be exposed until a secure backend exists');
  assert(app.includes('Redefinir senha'), 'Admin UI must expose the prepared password-reset action');
  assert(app.includes('Mostrar senhas'), 'Mandatory password-change UI must support show/hide');
  assert(app.includes('autoComplete="new-password"'), 'Mandatory password fields must use new-password semantics');
  assert(app.indexOf("profileState === 'password_change'") < app.indexOf('hasCapability(profile.role, CAPABILITIES.DOCTOR_SELF)'), 'Password-change gate must run before protected module routing');
  assert(!app.includes('CMIP123456'), 'A senha padrão fica centralizada em cmipApi.js, não nos componentes');
  assert(app.includes('actingDoctor'), 'Doctor component must support explicit delegated context');
  assert(apiSource.includes('admin_doctor_queue_action'), 'Delegated queue actions must use a separate RPC');
  assert(apiSource.includes('admin_enqueue_patient'), 'Admin/Master reception enqueue must use a protected RPC');
  assert(apiSource.includes('signInWithPassword({ email: parsed.email, password })'), 'Current e-mail/password login must remain compatible');
  assert(apiSource.includes("functions.invoke('username-login'"), 'Username login must use the secure Edge Function');
  assert(!apiSource.includes('service_role'), 'Frontend must never expose service_role');
  assert(migration.includes("p.role in ('admin','master')"), 'Backend must authorize Admin/Master from the authenticated profile');
  assert(migration.includes('auth.uid()'), 'Delegated auditing must derive the actor from auth.uid()');
  assert(!migration.includes('p_performed_by'), 'Frontend must not supply performed_by');
  assert(!migration.includes('p_called_by'), 'Frontend must not supply called_by');
  assert(migration.includes('performed_by'), 'Queue history must preserve performed_by');
  assert(migration.includes('called_by'), 'Patient calls must preserve called_by');
  assert(migration.includes('Fila não pertence ao médico delegado'), 'Cross-doctor queue access must be rejected');
  assert(migration.includes('Médico delegado inexistente ou inativo'), 'Inactive or missing delegated doctors must be rejected');
  assert(migration.includes('enable row level security'), 'New audit data must keep RLS enabled');
  const hardening = fs.readFileSync(new URL('./supabase/migrations/20260930_v1_runtime_hardening.sql', import.meta.url), 'utf8');
  assert(hardening.includes('trg_medical_queue_transition'), 'Database must reject invalid queue transitions');
  assert(hardening.includes('trg_patient_calls_guard'), 'Database must reject invalid/duplicate calls');
  assert(hardening.includes('get_latest_medical_call_event'), 'Frontend/TV must share a canonical medical event key');
}

// ==========================================
// TESTES OBRIGATÓRIOS DO FLUXO DE AUTENTICAÇÃO
// ==========================================

// A. Login por username & B. Login por email
{
  const originalFunctionsDesc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(supabase), 'functions') || Object.getOwnPropertyDescriptor(supabase, 'functions');
  const originalSetSession = supabase.auth.setSession;
  const originalSignInWithPassword = supabase.auth.signInWithPassword;

  let invokeCalls = [];
  let setSessionCalls = [];
  let signInWithPasswordCalls = [];
  let mockInvoke = async () => ({ data: null, error: null });

  Object.defineProperty(supabase, 'functions', {
    get: () => ({ invoke: mockInvoke }),
    configurable: true
  });

  // A.1: Sucesso no login por username
  mockInvoke = async (fn, opts) => {
    invokeCalls.push({ fn, opts });
    return {
      data: {
        success: true,
        session: { access_token: 'fake-access-jwt', refresh_token: 'fake-refresh-token' },
        user: { id: 'user-uuid-123' },
        profile: { id: 'user-uuid-123', username: 'joao.vicente', role: 'doctor', active: true, must_change_password: false }
      },
      error: null
    };
  };
  supabase.auth.setSession = async (sess) => {
    setSessionCalls.push(sess);
    return { data: { session: sess, user: { id: 'user-uuid-123' } }, error: null };
  };
  supabase.auth.signInWithPassword = async (args) => {
    signInWithPasswordCalls.push(args);
    return { data: {}, error: null };
  };

  const res = await cmipApi.signIn('  JOAO.VICENTE  ', 'senhaSegura123');
  assert.equal(invokeCalls.length, 1, 'Deve chamar Edge Function username-login');
  assert.equal(invokeCalls[0].fn, 'username-login', 'Edge Function correta é username-login');
  assert.equal(invokeCalls[0].opts.body.username, 'joao.vicente', 'Username deve ser normalizado');
  assert.equal(invokeCalls[0].opts.body.password, 'senhaSegura123', 'Password deve ser enviada');
  assert.equal(signInWithPasswordCalls.length, 0, 'Não deve usar signInWithPassword para login por username');
  assert.equal(setSessionCalls.length, 1, 'Deve executar supabase.auth.setSession');
  assert.equal(setSessionCalls[0].access_token, 'fake-access-jwt', 'setSession deve receber access_token retornado');
  assert.equal(setSessionCalls[0].refresh_token, 'fake-refresh-token', 'setSession deve receber refresh_token retornado');
  assert.equal(res.error, null, 'Login com sucesso não deve retornar erro');

  // A.2: Erro 401
  mockInvoke = async () => ({
    data: null,
    error: { name: 'FunctionsHttpError', context: { status: 401 } }
  });
  await assert.rejects(
    () => cmipApi.signIn('joao.vicente', 'senhaErrada'),
    /Usuário ou senha inválidos/
  );

  // A.3: Erro 403
  mockInvoke = async () => ({
    data: null,
    error: { name: 'FunctionsHttpError', context: { status: 403 } }
  });
  await assert.rejects(
    () => cmipApi.signIn('joao.vicente', 'senha123'),
    /Acesso negado/
  );

  // A.4: Erro 500
  mockInvoke = async () => ({
    data: null,
    error: { name: 'FunctionsHttpError', context: { status: 500 } }
  });
  await assert.rejects(
    () => cmipApi.signIn('joao.vicente', 'senha123'),
    /Não foi possível autenticar no momento/
  );

  // A.5: Falha de rede (FunctionsFetchError)
  mockInvoke = async () => ({
    data: null,
    error: { name: 'FunctionsFetchError', message: 'Failed to fetch' }
  });
  await assert.rejects(
    () => cmipApi.signIn('joao.vicente', 'senha123'),
    /Falha na conexão de rede/
  );

  // B: Login por email continua usando signInWithPassword e não chama username-login
  invokeCalls = [];
  signInWithPasswordCalls = [];
  mockInvoke = async (fn, opts) => {
    invokeCalls.push({ fn, opts });
    return { data: null, error: null };
  };
  supabase.auth.signInWithPassword = async (args) => {
    signInWithPasswordCalls.push(args);
    return { data: { user: { id: 'email-uuid' } }, error: null };
  };

  await cmipApi.signIn('medico@cmip.local', 'senha123');
  assert.equal(signInWithPasswordCalls.length, 1, 'Login por email deve chamar signInWithPassword');
  assert.equal(signInWithPasswordCalls[0].email, 'medico@cmip.local');
  assert.equal(signInWithPasswordCalls[0].password, 'senha123');
  assert.equal(invokeCalls.length, 0, 'Login por email NÃO deve chamar username-login');

  // Restaura mocks
  Object.defineProperty(supabase, 'functions', originalFunctionsDesc);
  supabase.auth.setSession = originalSetSession;
  supabase.auth.signInWithPassword = originalSignInWithPassword;
}

// C. Reset administrativo
{
  const originalFunctionsDesc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(supabase), 'functions') || Object.getOwnPropertyDescriptor(supabase, 'functions');
  let invokeCalls = [];
  let mockInvoke = async () => ({ data: null, error: null });

  Object.defineProperty(supabase, 'functions', {
    get: () => ({ invoke: mockInvoke }),
    configurable: true
  });

  // C.1: Sucesso — a redefinição usa a senha padrão do CMIP (decisão de negócio) pela Edge Function administrativa
  mockInvoke = async (fn, opts) => {
    invokeCalls.push({ fn, opts });
    return { data: { ok: true }, error: null };
  };

  const res = await cmipApi.requestAdminPasswordReset('target-user-uuid-999');
  assert.equal(invokeCalls.length, 1, 'Deve chamar master-user-admin');
  assert.equal(invokeCalls[0].fn, 'master-user-admin');
  assert.deepEqual(invokeCalls[0].opts.body, {
    action: 'reset_password',
    user_id: 'target-user-uuid-999',
    temporary_password: DEFAULT_TEMP_PASSWORD,
  });
  assert.equal(DEFAULT_TEMP_PASSWORD, 'CMIP123456');
  assert(DEFAULT_TEMP_PASSWORD.length >= MIN_PASSWORD_LENGTH, 'A senha padrão precisa cumprir o mínimo exigido pelo servidor');
  assert.equal(res.ok, true);
  assert.equal(res.temporary_password, DEFAULT_TEMP_PASSWORD, 'O admin precisa ver qual senha foi definida');

  // C.2: Erro 401
  mockInvoke = async () => ({
    data: null,
    error: { name: 'FunctionsHttpError', context: { status: 401 } }
  });
  await assert.rejects(
    () => cmipApi.requestAdminPasswordReset('target-user-uuid-999'),
    /Sua sessão expirou\. Entre novamente\./
  );

  // C.3: Erro 403
  mockInvoke = async () => ({
    data: null,
    error: { name: 'FunctionsHttpError', context: { status: 403 } }
  });
  await assert.rejects(
    () => cmipApi.requestAdminPasswordReset('target-user-uuid-999'),
    /Você não tem permissão para redefinir a senha deste usuário\./
  );

  // C.4: Erro 404
  mockInvoke = async () => ({
    data: null,
    error: { name: 'FunctionsHttpError', context: { status: 404 } }
  });
  await assert.rejects(
    () => cmipApi.requestAdminPasswordReset('target-user-uuid-999'),
    /Usuário não encontrado\./
  );

  // C.5: Erro 500
  mockInvoke = async () => ({
    data: null,
    error: { name: 'FunctionsHttpError', context: { status: 500 } }
  });
  await assert.rejects(
    () => cmipApi.requestAdminPasswordReset('target-user-uuid-999'),
    /Não foi possível redefinir a senha\./
  );

  Object.defineProperty(supabase, 'functions', originalFunctionsDesc);
}

// D. must_change_password & Segurança
{
  assert.equal(classifyProfile({ active: true, must_change_password: true, role: 'doctor' }), 'password_change', 'must_change_password=true bloqueia acesso operacional');
  assert.equal(classifyProfile({ active: true, must_change_password: false, role: 'doctor' }), 'ready', 'must_change_password=false libera acesso operacional');
  assert.equal(classifyProfile({ active: true, must_change_password: true, role: 'admin' }), 'password_change', 'Admin com must_change_password=true é bloqueado');
  assert.equal(classifyProfile({ active: true, must_change_password: true, role: 'master' }), 'password_change', 'Master com must_change_password=true é bloqueado');

  const app = readApp();
  assert(app.indexOf("profileState === 'password_change'") < app.indexOf('hasCapability(profile.role, CAPABILITIES.DOCTOR_SELF)'), 'Password-change gate é executado antes do roteamento');
  assert(!app.includes('CMIP123456'), 'Bundle não deve conter a senha temporária hardcoded');
}

console.log('All mandatory authentication tests: PASS');



// Regression: forced first-password change belongs to the doctor's own login and
// must not prevent an Admin/Master from selecting an otherwise active doctor.
{
  const delegatedSql = fs.readFileSync(new URL('./supabase/migrations/20260929_admin_master_operational_superusers.sql', import.meta.url), 'utf8');
  assert.match(delegatedSql, /where d\.active and p\.active and p\.role='doctor'/);
  assert.doesNotMatch(delegatedSql, /p\.active and not p\.must_change_password and p\.role='doctor'/);
}

// ==========================================
// REVISÃO DE CÓDIGO 2026-10-08: infraestrutura, banco e Edge Function
// ==========================================
{
  const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
  const sources = fs.readdirSync(new URL('./src/', import.meta.url), { recursive: true })
    .filter((f) => /\.(js|jsx)$/.test(f))
    .map((f) => [f, read(`./src/${f}`)]);

  // Sem fallback silencioso para o projeto de teste dentro do código-fonte
  for (const [f, content] of sources) {
    assert(!content.includes('echypqclxnztvjicnkbf'), `${f}: URL do CMIPtst não pode estar fixa no código`);
    assert(!content.includes('sb_publishable_'), `${f}: chave fixa não pode estar no código`);
    assert(!/DEBUG_LATENCY\s*=\s*true/.test(content), `${f}: log de latência não pode estar sempre ligado`);
  }
  assert(read('./vite.config.js').includes('Build abortado'), 'Build deve falhar sem as variáveis do Supabase');

  // TTS: a mesma política no servidor de produção e no de desenvolvimento
  assert(read('./api/tts.js').includes('isRemoteTtsPhraseAllowed'), 'api/tts deve aplicar a política de frases');
  assert(read('./api/tts.js').includes('422'), 'api/tts deve recusar texto não permitido');
  assert(read('./vite.config.js').includes('isRemoteTtsPhraseAllowed'), 'servidor de desenvolvimento deve aplicar a mesma política');

  // vercel.json: headers de segurança e rewrite que não captura /api
  const vercel = JSON.parse(read('./vercel.json'));
  const all = vercel.headers.find((h) => h.source === '/(.*)').headers.map((h) => h.key);
  for (const key of ['Content-Security-Policy', 'X-Frame-Options', 'X-Content-Type-Options', 'Referrer-Policy']) {
    assert(all.includes(key), `vercel.json deve definir ${key}`);
  }
  assert(vercel.rewrites.every((r) => r.source !== r.destination), 'rewrite não pode apontar para si mesmo');
  assert(vercel.rewrites.some((r) => r.source.includes('(?!api/')), 'o fallback de SPA não pode capturar /api');

  // Vídeos sem espaços/parênteses no nome
  assert(fs.existsSync(new URL('./public/institucional-1.mp4', import.meta.url)));
  assert(fs.existsSync(new URL('./public/institucional-2.mp4', import.meta.url)));

  // Migrations: versões únicas e correções presentes
  const versions = fs.readdirSync(new URL('./supabase/migrations/', import.meta.url)).map((f) => f.split('_')[0]);
  assert.equal(new Set(versions).size, versions.length, 'duas migrations não podem ter a mesma versão');
  const fixes = read('./supabase/migrations/20261008120000_v1_review_fixes.sql');
  assert(fixes.includes('pg_advisory_xact_lock'), 'bloqueio de chamada duplicada deve usar trava por fila');
  assert(fixes.includes('left join lateral'), 'fila delegada não pode duplicar linhas');
  assert(fixes.includes('admin_user_audit') && fixes.includes('enable row level security'), 'auditoria com RLS');
  assert(fixes.includes("array['event_key','id','kind','is_recall','display_number','patient_name','destination','at']"), 'TV pública usa lista de permissão de campos');
  assert(!/grant\s+(insert|update|delete)[^;]*admin_user_audit/i.test(fixes), 'auditoria não é gravável pelo navegador');

  // Edge Function: validações, ordem segura da redefinição e mensagens sem vazamento
  const fn = read('./supabase/functions/master-user-admin/index.ts');
  assert(fn.includes('USERNAME_RE'), 'servidor deve validar o formato do usuário');
  assert(fn.includes('MIN_PASSWORD = 10'), 'mínimo de senha alinhado com a interface');
  assert(fn.indexOf("update({ must_change_password: true") < fn.indexOf('updateUserById'), 'exigir troca de senha ANTES de alterar a senha');
  assert(!fn.includes("error: e?.message || 'Erro interno'"), 'erro interno não deve devolver a mensagem crua');
  assert(fn.includes('ALLOWED_ORIGINS'), 'CORS deve poder ser restrito por variável de ambiente');
  assert(fn.includes("audit('reset_password'") && fn.includes("audit('create_user'"), 'operações administrativas auditadas');
}

console.log('Infrastructure review tests: PASS');
