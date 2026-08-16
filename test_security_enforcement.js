/**
 * ==============================================================================
 * TESTE DE PENETRAÇÃO & ENFORCEMENT DE SEGURANÇA RBAC (CMIP)
 * ==============================================================================
 * Executa 6 cenários determinísticos de invasão e controle de acesso para
 * comprovar que nenhuma ação protegida pode ser disparada sem token ou com perfil indevido.
 */

import handler, { generateAuthToken, verifyAuthToken, extractAuthUser } from './api/medical.js';

function createMockReq(method, body = null, headers = {}) {
  return {
    method,
    body,
    headers,
    query: {}
  };
}

function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    bodyData: null,
    setHeader: (k, v) => { res.headers[k] = v; },
    status: (code) => {
      res.statusCode = code;
      return res;
    },
    json: (data) => {
      res.bodyData = data;
      return res;
    },
    end: () => res
  };
  return res;
}

async function runSecuritySuite() {
  console.log('\n======================================================');
  console.log('🛡️ INICIANDO SUÍTE DE TESTES DE SEGURANÇA RBAC');
  console.log('======================================================\n');

  let passed = 0;
  let total = 0;

  function assert(name, condition, extra = '') {
    total++;
    if (condition) {
      console.log(`  ✅ [PASS] ${name} ${extra ? '(' + extra + ')' : ''}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${name} ${extra ? '(' + extra + ')' : ''}`);
    }
  }

  // --- 1. TESTE DE TOKEN NATIVO HMAC ---
  console.log('--- Cenário 1: Geração e Validação Criptográfica de Tokens ---');
  const sampleAdmin = { id: 1, name: 'Admin Teste', username: 'admin', role: 'admin' };
  const adminToken = generateAuthToken(sampleAdmin);
  assert('Geração de token para Admin', typeof adminToken === 'string' && adminToken.includes('.'));

  const parsedAdmin = verifyAuthToken(adminToken);
  assert('Decodificação e assinatura válida', parsedAdmin && parsedAdmin.role === 'admin' && parsedAdmin.userId === 1);

  const fakeToken = adminToken.slice(0, -5) + 'xxxxx';
  const parsedFake = verifyAuthToken(fakeToken);
  assert('Rejeição de token adulterado/forjado', parsedFake === null);

  // --- 2. TENTATIVA ANÔNIMA EM ENDPOINT PROTEGIDO ---
  console.log('\n--- Cenário 2: Tentativa Anônima de Exclusão de Médico ---');
  const reqAnon = createMockReq('POST', {
    action: 'delete-doctor',
    payload: { id: 999 }
  });
  const resAnon = createMockRes();
  await handler(reqAnon, resAnon);
  assert('Bloqueio 401 Unauthorized sem token', resAnon.statusCode === 401, `Status: ${resAnon.statusCode}`);

  // --- 3. PRIVILÉGIO CRUZADO: RECEPÇÃO TENTANDO AÇÃO DE ADMIN ---
  console.log('\n--- Cenário 3: Recepcionista Tentando Excluir Médico ---');
  const sampleRecep = { id: 2, name: 'Recepção Teste', username: 'recepcao', role: 'receptionist' };
  const recepToken = generateAuthToken(sampleRecep);

  const reqRecepViol = createMockReq('POST', {
    action: 'delete-doctor',
    payload: { id: 999 }
  }, {
    authorization: `Bearer ${recepToken}`
  });
  const resRecepViol = createMockRes();
  await handler(reqRecepViol, resRecepViol);
  assert('Bloqueio 403 Forbidden para Recepcionista em Ação de Admin', resRecepViol.statusCode === 403, `Status: ${resRecepViol.statusCode}`);

  // --- 4. PRIVILÉGIO CRUZADO: MÉDICO TENTANDO CRIAR CONSULTÓRIO ---
  console.log('\n--- Cenário 4: Médico Tentando Criar Consultório ---');
  const sampleDoctor = { id: 4, name: 'Dr. Carlos', username: 'dr_carlos', role: 'doctor', doctorId: 4 };
  const doctorToken = generateAuthToken(sampleDoctor);

  const reqDocViol = createMockReq('POST', {
    action: 'create-office',
    payload: { name: 'Consultório Invasivo' }
  }, {
    authorization: `Bearer ${doctorToken}`
  });
  const resDocViol = createMockRes();
  await handler(reqDocViol, resDocViol);
  assert('Bloqueio 403 Forbidden para Médico criando sala', resDocViol.statusCode === 403, `Status: ${resDocViol.statusCode}`);

  // --- 5. ISOLAMENTO MÉDICO: MÉDICO TENTANDO CHAMAR PACIENTE DE OUTRO CONSULTÓRIO ---
  console.log('\n--- Cenário 5: Médico Tentando Chamar Fila de Outro Médico ---');
  const reqDocOther = createMockReq('POST', {
    action: 'call-patient',
    payload: { callId: 100, doctorId: 99 } // doctorId 99 é diferente do doctorId 4 do token
  }, {
    authorization: `Bearer ${doctorToken}`
  });
  const resDocOther = createMockRes();
  await handler(reqDocOther, resDocOther);
  assert('Bloqueio 403 Forbidden para Médico manipulando fila alheia', resDocOther.statusCode === 403, `Status: ${resDocOther.statusCode}`);

  // --- 6. AUTENTICAÇÃO E VERIFICAÇÃO DE SESSÃO LEGÍTIMA ---
  console.log('\n--- Cenário 6: Login Legítimo e Verificação de Sessão ---');
  const reqLogin = createMockReq('POST', {
    action: 'login',
    payload: { username: 'admin', password: 'admin123' }
  });
  const resLogin = createMockRes();
  await handler(reqLogin, resLogin);
  assert('Login de Admin com sucesso 200 OK', resLogin.statusCode === 200 && resLogin.bodyData?.success);
  assert('Token JWT HMAC gerado no login', Boolean(resLogin.bodyData?.token));

  const validToken = resLogin.bodyData?.token;
  const reqVerify = createMockReq('POST', {
    action: 'verify-session'
  }, {
    authorization: `Bearer ${validToken}`
  });
  const resVerify = createMockRes();
  await handler(reqVerify, resVerify);
  assert('Verificação de sessão viva aprovada com 200 OK', resVerify.statusCode === 200 && resVerify.bodyData?.user?.role === 'admin');

  console.log('\n======================================================');
  console.log(`📊 RESULTADO DA SUÍTE DE SEGURANÇA: ${passed}/${total} TESTES APROVADOS`);
  console.log('======================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runSecuritySuite();
