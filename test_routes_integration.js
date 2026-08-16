import medicalHandler from './api/medical.js';
import ticketHandler from './api/ticket.js';

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

async function runRoutesIntegrationTest() {
  console.log('🚀 ========================================================');
  console.log('🧪 TESTE DE INTEGRAÇÃO DE ROTAS E ENDPOINTS (API & SERVER)');
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
    // 1. Teste de Login da Recepção
    console.log('▶️ [1/5] Testando autenticação de usuário (Recepção)...');
    const { req: rLogin, res: sLogin } = createMockReqRes('POST', {
      action: 'login',
      payload: { username: 'recepcao', password: 'recepcao123' }
    });
    await medicalHandler(rLogin, sLogin);
    const loginData = sLogin._getData();
    assertTest('Status 200 no Login', sLogin._getStatusCode() === 200);
    assertTest('Retorno de perfil receptionist', loginData?.user?.role === 'receptionist');

    // 2. Teste de Setup de Médicos e Consultórios
    console.log('\n▶️ [2/5] Testando Setup de dados para Recepção e Admin...');
    const { req: rSetup, res: sSetup } = createMockReqRes('GET', null, { view: 'setup' });
    await medicalHandler(rSetup, sSetup);
    const setupData = sSetup._getData();
    assertTest('Listagem de consultórios presentes', Array.isArray(setupData?.offices) && setupData.offices.length > 0);
    assertTest('Listagem de médicos presentes', Array.isArray(setupData?.doctors) && setupData.doctors.length > 0);

    // 3. Teste de Emissão de Senha no Totem
    console.log('\n▶️ [3/5] Testando Emissão de Senha no Totem (Fila de Espera)...');
    const { req: rTotem, res: sTotem } = createMockReqRes('POST', {
      action: 'issue-ticket',
      ticketType: 'Preferencial'
    });
    await ticketHandler(rTotem, sTotem);
    const totemData = sTotem._getData();
    assertTest('Senha emitida com prefixo P', totemData?.ticket?.number?.startsWith('P'));
    assertTest('Desk marcado como Aguardando', totemData?.ticket?.desk === 'Aguardando');

    // 4. Teste de Consulta da TV Recepção
    console.log('\n▶️ [4/5] Testando Canal TV Recepção (Apenas Guichês)...');
    const { req: rTvRec, res: sTvRec } = createMockReqRes('GET', null, { view: 'tv', channel: 'recepcao' });
    await medicalHandler(rTvRec, sTvRec);
    const tvRecData = sTvRec._getData();
    assertTest('Canal identificado como recepcao', tvRecData?.channel === 'recepcao');

    // 5. Teste de Consulta da TV 01 e TV 02
    console.log('\n▶️ [5/5] Testando Canais Médicos TV 01 e TV 02...');
    const { req: rTv1, res: sTv1 } = createMockReqRes('GET', null, { view: 'tv', channel: '1' });
    await medicalHandler(rTv1, sTv1);
    const tv1Data = sTv1._getData();
    assertTest('Canal 1 identificado como 1', tv1Data?.channel === '1');

    const { req: rTv2, res: sTv2 } = createMockReqRes('GET', null, { view: 'tv', channel: '2' });
    await medicalHandler(rTv2, sTv2);
    const tv2Data = sTv2._getData();
    assertTest('Canal 2 identificado como 2', tv2Data?.channel === '2');

    console.log('\n🎉 ========================================================');
    console.log(`📊 RESULTADO FINAL: ${passed}/${total} TESTES PASSARAM COM SUCESSO!`);
    console.log('========================================================\n');

    if (passed === total) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ Erro na suíte de integração:', err);
    process.exit(1);
  }
}

runRoutesIntegrationTest();
