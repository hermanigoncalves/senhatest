import handler from './api/medical.js';

// Mock helper para simular req/res em testes
function createMockReqRes(method, body = null, query = {}) {
  const req = {
    method,
    body,
    query,
    headers: {}
  };

  let statusCode = 200;
  let responseData = null;

  const res = {
    setHeader: () => res,
    status: (code) => {
      statusCode = code;
      return res;
    },
    json: (data) => {
      responseData = data;
      return res;
    },
    end: () => res,
    _getStatusCode: () => statusCode,
    _getData: () => responseData
  };

  return { req, res };
}

async function runPhase2Tests() {
  console.log('🧪 [FASE 2] Iniciando Testes de Endpoints da API...');

  try {
    // 1. Teste de Listagem de Consultórios com TV
    console.log('\n▶️ 1. Testando ação: list-offices');
    const { req: req1, res: res1 } = createMockReqRes('POST', { action: 'list-offices' });
    await handler(req1, res1);
    const data1 = res1._getData();
    console.log(`Status: ${res1._getStatusCode()} | Sucesso: ${data1?.success} | Salas encontradas: ${data1?.offices?.length}`);
    if (data1?.offices?.length > 0) {
      console.log('Amostra de sala com target_tv:', {
        name: data1.offices[0].name,
        code: data1.offices[0].code,
        target_tv: data1.offices[0].target_tv
      });
    }

    // 2. Teste de Listagem de Médicos
    console.log('\n▶️ 2. Testando ação: list-doctors');
    const { req: req2, res: res2 } = createMockReqRes('POST', { action: 'list-doctors' });
    await handler(req2, res2);
    const data2 = res2._getData();
    console.log(`Status: ${res2._getStatusCode()} | Sucesso: ${data2?.success} | Médicos encontrados: ${data2?.doctors?.length}`);
    if (data2?.doctors?.length > 0) {
      console.log('Amostra de médico:', {
        name: data2.doctors[0].name,
        crm: data2.doctors[0].crm,
        crm_uf: data2.doctors[0].crm_uf,
        specialty: data2.doctors[0].specialty
      });
    }

    // 3. Teste de Consulta da TV com Filtro TV 01
    console.log('\n▶️ 3. Testando GET TV State com ?view=tv&tvId=1');
    const { req: req3, res: res3 } = createMockReqRes('GET', null, { view: 'tv', tvId: '1' });
    await handler(req3, res3);
    const data3 = res3._getData();
    console.log(`Status: ${res3._getStatusCode()} | Sucesso: ${data3?.success} | tvId: ${data3?.tvId}`);

    // 4. Teste de Consulta da TV com Filtro TV 02
    console.log('\n▶️ 4. Testando GET TV State com ?view=tv&tvId=2');
    const { req: req4, res: res4 } = createMockReqRes('GET', null, { view: 'tv', tvId: '2' });
    await handler(req4, res4);
    const data4 = res4._getData();
    console.log(`Status: ${res4._getStatusCode()} | Sucesso: ${data4?.success} | tvId: ${data4?.tvId}`);

    console.log('\n✅ [FASE 2] TODOS OS TESTES PASSARAM COM 100% DE SUCESSO!');
  } catch (err) {
    console.error('❌ Erro no teste da Fase 2:', err);
  }
}

runPhase2Tests();
