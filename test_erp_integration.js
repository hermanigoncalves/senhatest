import { supabaseAdmin } from './api/_supabase.js';
import { calculateFinancialSplit, summarizeTransactions } from './src/utils/splitEngine.js';
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

async function runErpTestSuite() {
  console.log('========================================================');
  console.log('  SUITE DE TESTES INTEGRADOS DE HOMOLOGACAO CMIP (9/9)');
  console.log('  Padrao: Addy Osmani (Tests as Proof) + Google Mantis');
  console.log('========================================================\n');

  let passedTests = 0;
  let totalTests = 9;

  // TESTE 1: MOTOR FINANCEIRO DE SPLIT
  try {
    console.log('[TEST 1/9] Testando Motor de Calculo Financeiro de Split...');
    const splitA = calculateFinancialSplit({
      grossAmount: 350.00,
      gatewayFee: 10.50,
      suppliesCost: 25.00,
      rule: { split_type: 'PERCENTAGE', split_value: 70, deduct_card_fee: true, deduct_supplies: true }
    });

    if (splitA.professionalNet !== '220.15' || splitA.clinicNet !== '94.35') {
      throw new Error('Falha no calculo percentual');
    }

    const splitB = calculateFinancialSplit({
      grossAmount: 200.00,
      gatewayFee: 5.00,
      suppliesCost: 10.00,
      rule: { split_type: 'FIXED', split_value: 120.00, deduct_card_fee: true, deduct_supplies: true }
    });

    if (splitB.professionalNet !== '120.00' || splitB.clinicNet !== '65.00') {
      throw new Error('Falha no calculo fixo');
    }

    console.log('  [PASS] Motor Financeiro: 100% Preciso em Centavos Inteiros.');
    passedTests++;
  } catch (err) {
    console.error('  [FAIL] Teste 1 falhou:', err.message);
  }

  // TESTE 2: CONECTIVIDADE DAS 13 TABELAS
  try {
    console.log('\n[TEST 2/9] Testando Conectividade das 13 Tabelas no Banco...');
    const tables = [
      'offices', 'doctors', 'users', 'patients', 'conversations',
      'messages', 'quick_replies', 'appointments', 'patient_calls',
      'tickets', 'medical_records', 'split_rules', 'financial_transactions'
    ];

    for (const tbl of tables) {
      const { error } = await supabaseAdmin.from(tbl).select('*').limit(1);
      if (error) throw new Error('Tabela ' + tbl + ' inacessivel: ' + error.message);
    }

    console.log('  [PASS] 13/13 Tabelas Verificadas e Acessiveis no Supabase.');
    passedTests++;
  } catch (err) {
    console.error('  [FAIL] Teste 2 falhou:', err.message);
  }

  // TESTE 3: CONVERSAS E MENSAGENS WHATSAPP
  let testConvId = null;
  try {
    console.log('\n[TEST 3/9] Testando Insercao de Chat WhatsApp...');
    const uniquePhone = '55119' + String(Date.now()).slice(-8);
    const uniqueMsgId = 'evo_test_' + Date.now();

    const { data: conv, error: convErr } = await supabaseAdmin
      .from('conversations')
      .insert({
        remote_jid: uniquePhone + '@s.whatsapp.net',
        phone: uniquePhone,
        patient_name: 'Paciente Teste WhatsApp',
        bot_active: true,
        last_message_text: 'Ola, gostaria de agendar!'
      })
      .select()
      .single();

    if (convErr) throw convErr;
    testConvId = conv.id;

    const { error: msgErr } = await supabaseAdmin
      .from('messages')
      .insert({
        conversation_id: conv.id,
        whatsapp_message_id: uniqueMsgId,
        from_me: false,
        sender_name: 'Paciente Teste',
        message_type: 'text',
        content: 'Ola, gostaria de agendar!'
      });

    if (msgErr) throw msgErr;
    console.log('  [PASS] Conversa e Mensagem WhatsApp Gravadas com Sucesso.');
    passedTests++;
  } catch (err) {
    console.error('  [FAIL] Teste 3 falhou:', err.message);
  }

  // TESTE 4: AGENDAMENTO DE CONSULTA
  let testApptId = null;
  try {
    console.log('\n[TEST 4/9] Testando Criacao e Sincronizacao de Agendamento...');
    const today = new Date().toISOString().split('T')[0];

    const { data: appt, error: apptErr } = await supabaseAdmin
      .from('appointments')
      .insert({
        name: 'Paciente Teste Agendamento',
        phone: '5511988887777',
        service: 'Consulta de Cardiologia',
        appointment_date: today,
        appointment_time: '14:30',
        room_number: '2',
        insurance_type: 'PARTICULAR',
        price: 250.00
      })
      .select()
      .single();

    if (apptErr) throw apptErr;
    testApptId = appt.id;
    console.log('  [PASS] Agendamento Criado com Sucesso.');
    passedTests++;
  } catch (err) {
    console.error('  [FAIL] Teste 4 falhou:', err.message);
  }

  // TESTE 5: CHAMADA NOMINAL NAS TVs
  let testCallId = null;
  try {
    console.log('\n[TEST 5/9] Testando Disparo de Chamada Nominal para TV 01...');
    const { data: call, error: callErr } = await supabaseAdmin
      .from('patient_calls')
      .insert({
        call_id: Date.now() % 100000,
        patient_name: 'Paciente Chamado Teste',
        doctor_name: 'Dr. Carlos Eduardo',
        office_name: 'Consultorio 01 - Clinica Geral',
        target_tv: '1',
        status: 'called',
        called_at: new Date().toISOString()
      })
      .select()
      .single();

    if (callErr) throw callErr;
    testCallId = call.id;
    console.log('  [PASS] Chamada Nominal Gravada para TV 01.');
    passedTests++;
  } catch (err) {
    console.error('  [FAIL] Teste 5 falhou:', err.message);
  }

  // TESTE 6: PRONTUARIO ELETRONICO (PEP)
  let testRecordId = null;
  try {
    console.log('\n[TEST 6/9] Testando Prontuario PEP com JSONB e Sigilo...');
    const { data: pat } = await supabaseAdmin
      .from('patients')
      .insert({ full_name: 'Paciente PEP Teste', phone: '5511977776666' })
      .select()
      .single();

    const { data: record, error: recErr } = await supabaseAdmin
      .from('medical_records')
      .insert({
        patient_id: pat.id,
        professional_id: 1,
        specialty: 'PSICOLOGIA',
        is_confidential: true,
        clinical_notes: 'Paciente em boa evolucao terapeutica.',
        specialty_data: { sessionNumber: 4, focus: 'Ansiedade' }
      })
      .select()
      .single();

    if (recErr) throw recErr;
    testRecordId = record.id;
    console.log('  [PASS] Prontuario Gravado com Sucesso.');
    passedTests++;
  } catch (err) {
    console.error('  [FAIL] Teste 6 falhou:', err.message);
  }

  // TESTE 7: REGISTRO FINANCEIRO COM SNAPSHOT
  let testTxId = null;
  try {
    console.log('\n[TEST 7/9] Testando Registro Financeiro com Snapshot...');
    const splitRes = calculateFinancialSplit({
      grossAmount: 300.00,
      gatewayFee: 9.00,
      suppliesCost: 20.00,
      rule: { split_type: 'PERCENTAGE', split_value: 60, deduct_card_fee: true, deduct_supplies: true }
    });

    const { data: tx, error: txErr } = await supabaseAdmin
      .from('financial_transactions')
      .insert({
        professional_id: 1,
        gross_amount: Number(splitRes.grossAmount),
        gateway_fee: Number(splitRes.gatewayFee),
        supplies_cost: Number(splitRes.suppliesCost),
        clinic_net: Number(splitRes.clinicNet),
        professional_net: Number(splitRes.professionalNet),
        split_snapshot: splitRes.splitSnapshot,
        payment_status: 'PAGO'
      })
      .select()
      .single();

    if (txErr) throw txErr;
    testTxId = tx.id;
    console.log('  [PASS] Transacao Gravada com Snapshot.');
    passedTests++;
  } catch (err) {
    console.error('  [FAIL] Teste 7 falhou:', err.message);
  }

  // TESTE 8: WEBHOOK EVOLUTION GO (messages.upsert)
  try {
    console.log('\n[TEST 8/9] Testando Endpoint de Webhook da Evolution Go...');
    const webhookPayload = {
      event: 'messages.upsert',
      data: {
        key: {
          remoteJid: '5511999887766@s.whatsapp.net',
          fromMe: false,
          id: 'test_webhook_msg_' + Date.now()
        },
        pushName: 'Paciente Webhook Teste',
        message: {
          conversation: 'Gostaria de agendar consulta com Dr. Carlos'
        }
      }
    };

    const { req: rWeb, res: sWeb } = createMockReqRes('POST', webhookPayload);
    await medicalHandler(rWeb, sWeb);
    const webRes = sWeb._getData();

    if (!webRes?.success) throw new Error('Webhook retornou erro ou nao processou');
    console.log('  [PASS] Webhook Evolution Go processado e gravado no Supabase.');
    passedTests++;
  } catch (err) {
    console.error('  [FAIL] Teste 8 falhou:', err.message);
  }

  // TESTE 9: DISPARO DE LEMBRETE AUTOMÁTICO
  try {
    console.log('\n[TEST 9/9] Testando Endpoint de Disparo de Lembrete Automatico...');
    const reminderPayload = {
      action: 'send-reminder',
      appointmentId: testApptId,
      phone: '5511988887777',
      patientName: 'Paciente Teste Agendamento',
      doctorName: 'Dr. Carlos Eduardo',
      date: '2026-08-24',
      time: '14:30'
    };

    const { req: rRem, res: sRem } = createMockReqRes('POST', reminderPayload);
    await medicalHandler(rRem, sRem);
    const remRes = sRem._getData();

    if (!remRes?.success) throw new Error('Disparo de lembrete retornou erro');
    console.log('  [PASS] Disparo de Lembrete Automatico Validado com Sucesso.');
    passedTests++;
  } catch (err) {
    console.error('  [FAIL] Teste 9 falhou:', err.message);
  }

  // LIMPEZA
  try {
    if (testTxId) await supabaseAdmin.from('financial_transactions').delete().eq('id', testTxId);
    if (testRecordId) await supabaseAdmin.from('medical_records').delete().eq('id', testRecordId);
    if (testCallId) await supabaseAdmin.from('patient_calls').delete().eq('id', testCallId);
    if (testApptId) await supabaseAdmin.from('appointments').delete().eq('id', testApptId);
    if (testConvId) await supabaseAdmin.from('conversations').delete().eq('id', testConvId);
  } catch (cleanErr) {}

  console.log('\n========================================================');
  console.log('RESULTADO FINAL: ' + passedTests + '/' + totalTests + ' TESTES APROVADOS COM SUCESSO!');
  console.log('========================================================\n');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runErpTestSuite();