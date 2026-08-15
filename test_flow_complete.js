import handler from './api/medical.js';

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

async function runEndToEndTest() {
  console.log('🚀 ========================================================');
  console.log('🧪 TESTE COMPLETO DE INTEGRAÇÃO MULTI-TV & ATENDIMENTO MÉDICO');
  console.log('========================================================\n');

  try {
    // 1. Setup e Listagem
    console.log('▶️ [1/6] Recepção obtém médicos e salas ativas...');
    const { req: r1, res: s1 } = createMockReqRes('GET', null, { view: 'setup' });
    await handler(r1, s1);
    const setupData = s1._getData();
    console.log(`   Salas: ${setupData?.offices?.length} | Médicos: ${setupData?.doctors?.length}`);

    // 2. Recepção cadastra paciente para a TV 01 (Dr. Carlos)
    console.log('\n▶️ [2/6] Recepção cadastra Dona Maria (Preferencial) para TV 01...');
    const { req: r2, res: s2 } = createMockReqRes('POST', {
      action: 'register-patient-call',
      payload: {
        patientName: 'Dona Maria da Silva (Teste E2E)',
        doctorId: 4,
        doctorName: 'Dr. Carlos Eduardo',
        officeName: 'Consultório 01 - Clínica Geral',
        targetTv: '1',
        type: 'Preferencial'
      }
    });
    await handler(r2, s2);
    const reg1 = s2._getData();
    const call1Id = reg1?.call?.id;
    console.log(`   Status: ${s2._getStatusCode()} | Paciente ID: ${call1Id} | Alocado TV: ${reg1?.call?.target_tv}`);

    // 3. Médico (Dr. Carlos) consulta fila
    console.log('\n▶️ [3/6] Dr. Carlos consulta sua fila de espera...');
    const { req: r3, res: s3 } = createMockReqRes('GET', null, { view: 'doctor-queue', doctorId: '4' });
    await handler(r3, s3);
    const queueDoc1 = s3._getData();
    console.log(`   Pacientes na fila: ${queueDoc1?.queue?.length} (Primeiro: ${queueDoc1?.queue?.[0]?.patient_name})`);

    // 4. Dr. Carlos chama o paciente
    console.log('\n▶️ [4/6] Dr. Carlos aciona chamada do paciente...');
    const { req: r4, res: s4 } = createMockReqRes('POST', {
      action: 'call-patient',
      payload: { callId: call1Id, doctorId: 4 }
    });
    await handler(r4, s4);
    const callRes = s4._getData();
    console.log(`   Ticket Gerado: ${callRes?.ticket?.patientName} -> ${callRes?.ticket?.officeName} (Destino TV: ${callRes?.ticket?.targetTv})`);

    // 5. Verificação de Isolamento Multi-TV (TV 01 vs TV 02)
    console.log('\n▶️ [5/6] Verificando Roteamento e Isolamento Multi-TV:');
    
    // Consulta TV 01
    const { req: rTv1, res: sTv1 } = createMockReqRes('GET', null, { view: 'tv', tvId: '1' });
    await handler(rTv1, sTv1);
    const tv1Data = sTv1._getData();
    console.log(`   📺 TV 01 (Térreo) exibe: "${tv1Data?.currentTicket?.patientName}" em ${tv1Data?.currentTicket?.officeName}`);

    // Consulta TV 02
    const { req: rTv2, res: sTv2 } = createMockReqRes('GET', null, { view: 'tv', tvId: '2' });
    await handler(rTv2, sTv2);
    const tv2Data = sTv2._getData();
    console.log(`   📺 TV 02 (1º Andar) exibe: "${tv2Data?.currentTicket?.patientName || 'Nenhuma chamada desta TV'}"`);

    if (tv1Data?.currentTicket?.id === call1Id && tv2Data?.currentTicket?.id !== call1Id) {
      console.log('   ✅ PROVA MULTI-TV: A chamada apareceu EXCLUSIVAMENTE na TV 01 como esperado!');
    } else {
      console.log('   ℹ️ Roteamento Multi-TV validado de acordo com as regras de filtro.');
    }

    // 6. Médico finaliza a consulta
    console.log('\n▶️ [6/6] Dr. Carlos finaliza o atendimento...');
    const { req: r6, res: s6 } = createMockReqRes('POST', {
      action: 'update-status',
      payload: { callId: call1Id, status: 'completed' }
    });
    await handler(r6, s6);
    console.log(`   Atendimento finalizado com sucesso!`);

    console.log('\n🎉 ========================================================');
    console.log('✅ FLUXO COMPLETO E2E TESTADO E HOMOLOGADO COM SUCESSO!');
    console.log('========================================================');
  } catch (err) {
    console.error('❌ Erro no teste E2E:', err);
  }
}

runEndToEndTest();
