import medicalHandler from './api/medical.js';

function createMockReqRes(method, body = null, query = {}) {
  const req = { method, body, query, headers: {} };
  let statusCode = 200;
  let responseData = null;

  const res = {
    setHeader: () => res,
    status: (code) => { statusCode = code; return res; },
    json: (data) => { responseData = data; return res; },
    end: () => res,
    _getStatusCode: () => statusCode,
    _getData: () => responseData
  };

  return { req, res };
}

async function runRbacAuthTest() {
  console.log('🚀 ========================================================');
  console.log('🧪 TESTE DE AUTENTICAÇÃO, CONTROLE DE ACESSO E RBAC');
  console.log('========================================================\n');

  let passed = 0;
  let total = 0;

  const assertTest = (desc, condition) => {
    total++;
    if (condition) {
      passed++;
      console.log(`   ✅ [PASS] ${desc}`);
    } else {
      console.error(`   ❌ [FAIL] ${desc}`);
    }
  };

  try {
    // 1. Login com credenciais inválidas (deve falhar com 401)
    console.log('▶️ [1/4] Testando rejeição de credenciais incorretas...');
    const { req: rBad, res: sBad } = createMockReqRes('POST', {
      action: 'login',
      payload: { username: 'admin', password: 'senha_errada_123' }
    });
    await medicalHandler(rBad, sBad);
    assertTest('Rejeição com 401 para senha incorreta', sBad._getStatusCode() === 401);

    // 2. Login de Administrador (Role admin)
    console.log('\n▶️ [2/4] Testando autenticação de Administrador...');
    const { req: rAdm, res: sAdm } = createMockReqRes('POST', {
      action: 'login',
      payload: { username: 'admin', password: 'admin123' }
    });
    await medicalHandler(rAdm, sAdm);
    const admData = sAdm._getData();
    assertTest('Admin autenticado com sucesso (200 OK)', sAdm._getStatusCode() === 200);
    assertTest('Perfil retornado é admin', admData?.user?.role === 'admin');

    // 3. Login de Recepcionista (Role receptionist)
    console.log('\n▶️ [3/4] Testando autenticação de Recepcionista...');
    const { req: rRec, res: sRec } = createMockReqRes('POST', {
      action: 'login',
      payload: { username: 'recepcao', password: 'recepcao123' }
    });
    await medicalHandler(rRec, sRec);
    const recData = sRec._getData();
    assertTest('Recepção autenticada com sucesso (200 OK)', sRec._getStatusCode() === 200);
    assertTest('Perfil retornado é receptionist', recData?.user?.role === 'receptionist');

    // 4. Login de Médico (Role doctor com doctorId vinculado)
    console.log('\n▶️ [4/4] Testando autenticação de Médico (Dr. Carlos)...');
    const { req: rDoc, res: sDoc } = createMockReqRes('POST', {
      action: 'login',
      payload: { username: 'dr_carlos', password: 'medico123' }
    });
    await medicalHandler(rDoc, sDoc);
    const docData = sDoc._getData();
    assertTest('Médico autenticado com sucesso (200 OK)', sDoc._getStatusCode() === 200);
    assertTest('Perfil retornado é doctor', docData?.user?.role === 'doctor');
    assertTest('Médico possui vínculo doctor_id', docData?.user?.doctor_id !== null && docData?.user?.doctor_id !== undefined);

    console.log('\n🎉 ========================================================');
    console.log(`📊 RESULTADO FINAL DO RBAC & AUTH: ${passed}/${total} TESTES PASSARAM!`);
    console.log('========================================================\n');

    if (passed === total) process.exit(0);
    else process.exit(1);

  } catch (err) {
    console.error('❌ Erro no teste de RBAC e Auth:', err);
    process.exit(1);
  }
}

runRbacAuthTest();
