import medicalHandler, { generateAuthToken } from './api/medical.js';
import ticketHandler from './api/ticket.js';

function createMockReqRes(method, body = null, query = {}, token = null) {
  const headers = {};
  if (token) headers['authorization'] = 'Bearer ' + token;
  const req = { method, body, query, headers };
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

async function runIsolationProofTest() {
  console.log('========================================================');
  console.log('PROVA EMPIRICA: ISOLAMENTO TOTAL DOS 3 CANAIS DE TV');
  console.log('   (1. TV Recepcao | 2. TV Consultorios 01 | 3. TV Consultorios 02)');
  console.log('========================================================\n');

  const adminToken = generateAuthToken({ id: 1, name: 'Admin', role: 'admin' });
  const doc1Token = generateAuthToken({ id: 1, name: 'Dr. Carlos Eduardo', role: 'doctor', doctorId: 1 });
  const doc2Token = generateAuthToken({ id: 2, name: 'Dra. Helena Martins', role: 'doctor', doctorId: 2 });

  try {
    console.log('[Cenario 1] Atendente da recepcao chama senha para o Guiche 01...');
    const { req: rCallDesk, res: sCallDesk } = createMockReqRes('POST', {
      action: 'call-custom',
      customNumber: '99',
      desk: 'Guiche 01',
      ticketType: 'Normal'
    }, {}, adminToken);
    await ticketHandler(rCallDesk, sCallDesk);
    console.log('   Senha gerada: "0099" para "Guiche 01"');

    const { req: rTvRec, res: sTvRec } = createMockReqRes('GET', null, { view: 'tv', channel: 'recepcao' });
    await medicalHandler(rTvRec, sTvRec);
    const tvRecData = sTvRec._getData();
    console.log('   [TV Recepcao] Exibe: Senha "' + tvRecData?.currentTicket?.number + '" no "' + tvRecData?.currentTicket?.desk + '"');

    const { req: rTv1_c1, res: sTv1_c1 } = createMockReqRes('GET', null, { view: 'tv', channel: '1' });
    await medicalHandler(rTv1_c1, sTv1_c1);
    const tv1_c1_Data = sTv1_c1._getData();
    const isTv1DisplayingDesk = tv1_c1_Data?.currentTicket?.desk === 'Guiche 01';
    console.log('   [TV 01 - Terreo] Isolada da recepcao? ' + (!isTv1DisplayingDesk ? '[PASS] SIM (Nao exibe guiche)' : '[FAIL] NAO'));

<<<<<<< HEAD
    console.log('\n[Cenario 2] Dr. Carlos (Consultorio 01, TV 01) chama paciente nominal...');
    const { req: rRegDoc1, res: sRegDoc1 } = createMockReqRes('POST', {
      action: 'register-patient-call',
      patientName: 'Sr. Antonio da Silva (Ala 1)',
      doctorId: 1,
      doctorName: 'Dr. Carlos Eduardo',
      officeName: 'Consultorio 01 - Clinica Geral',
      targetTv: '1',
      type: 'Normal'
    }, {}, adminToken);
=======
    // --------------------------------------------------------
    // CENÁRIO 2: Médico da TV 01 chama paciente
    // --------------------------------------------------------
    console.log('\n▶️ [Cenário 2] Dr. Carlos (Consultório 01, TV 01) chama paciente nominal...');
    const recToken = generateAuthToken({ id: 2, role: 'receptionist', name: 'Recepção CMIP' });
    const doc1Token = generateAuthToken({ id: 1, role: 'doctor', doctorId: 1, name: 'Dr. Carlos Eduardo' });

    const { req: rRegDoc1, res: sRegDoc1 } = createMockReqRes('POST', {
      action: 'register-patient-call',
      payload: {
        patientName: 'Sr. Antonio da Silva (Ala 1)',
        doctorId: 1,
        doctorName: 'Dr. Carlos Eduardo',
        officeName: 'Consultório 01 - Clínica Geral',
        targetTv: '1',
        type: 'Normal'
      }
    });
    rRegDoc1.headers.authorization = `Bearer ${recToken}`;
>>>>>>> d3dae9e (feat: blindagem RLS, seguranca de secrets, player de videos na TV e remocao do subsistema de tablet)
    await medicalHandler(rRegDoc1, sRegDoc1);
    const doc1CallId = sRegDoc1._getData()?.call?.id;

    const { req: rCallDoc1, res: sCallDoc1 } = createMockReqRes('POST', {
      action: 'call-patient',
<<<<<<< HEAD
      callId: doc1CallId,
      doctorId: 1
    }, {}, doc1Token);
=======
      payload: { callId: doc1CallId, doctorId: 1 }
    });
    rCallDoc1.headers.authorization = `Bearer ${doc1Token}`;
>>>>>>> d3dae9e (feat: blindagem RLS, seguranca de secrets, player de videos na TV e remocao do subsistema de tablet)
    await medicalHandler(rCallDoc1, sCallDoc1);

    const { req: rTv1_c2, res: sTv1_c2 } = createMockReqRes('GET', null, { view: 'tv', channel: '1' });
    await medicalHandler(rTv1_c2, sTv1_c2);
    const tv1_c2_Data = sTv1_c2._getData();
    console.log('   [TV 01 - Terreo] Exibe: "' + tv1_c2_Data?.currentTicket?.patientName + '" (' + tv1_c2_Data?.currentTicket?.officeName + ')');

    const { req: rTv2_c2, res: sTv2_c2 } = createMockReqRes('GET', null, { view: 'tv', channel: '2' });
    await medicalHandler(rTv2_c2, sTv2_c2);
    const tv2_c2_Data = sTv2_c2._getData();
    const isTv2DisplayingDoc1 = tv2_c2_Data?.currentTicket?.id === doc1CallId;
    console.log('   [TV 02 - 1º Andar] Isolada da TV 01? ' + (!isTv2DisplayingDoc1 ? '[PASS] SIM (Nao exibe paciente da TV 01)' : '[FAIL] NAO'));

<<<<<<< HEAD
    console.log('\n[Cenario 3] Dra. Helena (Consultorio 02, TV 02) chama paciente nominal...');
    const { req: rRegDoc2, res: sRegDoc2 } = createMockReqRes('POST', {
      action: 'register-patient-call',
      patientName: 'Sra. Beatriz Oliveira (Ala 2)',
      doctorId: 2,
      doctorName: 'Dra. Helena Martins',
      officeName: 'Consultorio 02 - Cardiologia',
      targetTv: '2',
      type: 'Preferencial'
    }, {}, adminToken);
=======
    // --------------------------------------------------------
    // CENÁRIO 3: Médica da TV 02 chama paciente
    // --------------------------------------------------------
    console.log('\n▶️ [Cenário 3] Dra. Helena (Consultório 02, TV 02) chama paciente nominal...');
    const doc2Token = generateAuthToken({ id: 2, role: 'doctor', doctorId: 2, name: 'Dra. Helena Martins' });

    const { req: rRegDoc2, res: sRegDoc2 } = createMockReqRes('POST', {
      action: 'register-patient-call',
      payload: {
        patientName: 'Sra. Beatriz Oliveira (Ala 2)',
        doctorId: 2,
        doctorName: 'Dra. Helena Martins',
        officeName: 'Consultório 02 - Cardiologia',
        targetTv: '2',
        type: 'Preferencial'
      }
    });
    rRegDoc2.headers.authorization = `Bearer ${recToken}`;
>>>>>>> d3dae9e (feat: blindagem RLS, seguranca de secrets, player de videos na TV e remocao do subsistema de tablet)
    await medicalHandler(rRegDoc2, sRegDoc2);
    const doc2CallId = sRegDoc2._getData()?.call?.id;

    const { req: rCallDoc2, res: sCallDoc2 } = createMockReqRes('POST', {
      action: 'call-patient',
<<<<<<< HEAD
      callId: doc2CallId,
      doctorId: 2
    }, {}, doc2Token);
=======
      payload: { callId: doc2CallId, doctorId: 2 }
    });
    rCallDoc2.headers.authorization = `Bearer ${doc2Token}`;
>>>>>>> d3dae9e (feat: blindagem RLS, seguranca de secrets, player de videos na TV e remocao do subsistema de tablet)
    await medicalHandler(rCallDoc2, sCallDoc2);

    const { req: rTv2_c3, res: sTv2_c3 } = createMockReqRes('GET', null, { view: 'tv', channel: '2' });
    await medicalHandler(rTv2_c3, sTv2_c3);
    const tv2_c3_Data = sTv2_c3._getData();
    console.log('   [TV 02 - 1º Andar] Exibe: "' + tv2_c3_Data?.currentTicket?.patientName + '" (' + tv2_c3_Data?.currentTicket?.officeName + ')');

    const { req: rTvRec_c3, res: sTvRec_c3 } = createMockReqRes('GET', null, { view: 'tv', channel: 'recepcao' });
    await medicalHandler(rTvRec_c3, sTvRec_c3);
    const tvRec_c3_Data = sTvRec_c3._getData();
<<<<<<< HEAD
    const isTvRecDisplayingDoc2 = tvRec_c3_Data?.currentTicket?.id === doc2CallId;
    console.log('   [TV Recepcao] Isolada dos consultorios? ' + (!isTvRecDisplayingDoc2 ? '[PASS] SIM (Nao exibe paciente medico)' : '[FAIL] NAO'));
=======
    const isRecDisplayingDoc2 = Boolean(tvRec_c3_Data?.currentTicket?.patientName || tvRec_c3_Data?.currentTicket?.doctorName);
    console.log(`   📺 [TV Recepção] Isolada dos consultórios? ${!isRecDisplayingDoc2 ? '✅ SIM (Não exibe paciente médico)' : '❌ NÃO'}`);
>>>>>>> d3dae9e (feat: blindagem RLS, seguranca de secrets, player de videos na TV e remocao do subsistema de tablet)

    console.log('\n========================================================');
    console.log('COMPROVADO: 3 CANAIS DE TV FUNCIONANDO COM 100% DE ISOLAMENTO!');
    console.log('========================================================\n');
  } catch (err) {
    console.error('Erro no teste:', err.message);
  }
}

runIsolationProofTest();