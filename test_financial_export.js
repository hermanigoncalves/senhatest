import { supabaseAdmin } from './api/_supabase.js';
import { exportToExcelCSV, formatCurrencyBRL, formatExcelNumber } from './src/utils/exportFinancialReports.js';
import medicalHandler, { generateAuthToken } from './api/medical.js';

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

async function runFinancialExportTests() {
  console.log('========================================================');
  console.log('  SUITE DE TESTES: FECHAMENTO DE REPASSES & EXPORTAÇÃO');
  console.log('  Padrao: Addy Osmani (Tests as Proof) + Google Mantis');
  console.log('========================================================\n');

  let passed = 0;
  let total = 4;

  // ----------------------------------------------------
  // TESTE 1: EXPORTAÇÃO EXCEL (.CSV UTF-8 BOM)
  // ----------------------------------------------------
  try {
    console.log('[TEST 1/4] Testando Geracao de Planilha Excel (.csv com BOM)...');
    const sampleData = {
      doctorName: 'Dr. Carlos Eduardo',
      periodStr: '2026-08',
      transactions: [
        {
          id: 101,
          created_at: new Date().toISOString(),
          patient_name: 'Paciente Teste 1',
          service_name: 'Consulta Cardiologia',
          payment_method: 'Cartão de Crédito',
          gross_amount: 350.00,
          gateway_fee: 10.50,
          supplies_cost: 25.00,
          professional_net: 220.15,
          clinic_net: 94.35,
          payment_status: 'PAGO'
        }
      ],
      summary: {
        totalCount: 1,
        totalGross: '350.00',
        totalGatewayFee: '10.50',
        totalSuppliesCost: '25.00',
        totalClinicNet: '94.35',
        totalProfessionalNet: '220.15'
      }
    };

    const csv = exportToExcelCSV(sampleData, 'test_repass.csv');

    if (!csv.startsWith('\uFEFF')) {
      throw new Error('CSV nao possui o BOM UTF-8 (necessario para Excel)');
    }
    if (!csv.includes('Faturamento Bruto (R$)') || !csv.includes('220,15')) {
      throw new Error('Colunas ou valores formatados incorretamente no CSV');
    }

    console.log('  [PASS] CSV formatado com BOM UTF-8 e valores padrão Excel PT-BR.');
    passed++;
  } catch (err) {
    console.error('  [FAIL] Teste 1 falhou:', err.message);
  }

  // ----------------------------------------------------
  // TESTE 2: FILTRO DE COMPETÊNCIA POR PERÍODO & DOCTOR_ID
  // ----------------------------------------------------
  try {
    console.log('\n[TEST 2/4] Testando Filtro de Competencia e Medico na API...');
    const adminToken = generateAuthToken({ id: 1, name: 'Admin', role: 'admin' });

    const { req, res } = createMockReqRes('GET', null, {
      view: 'financial-report',
      doctorId: '1',
      startDate: '2026-08-01',
      endDate: '2026-08-31'
    }, adminToken);

    await medicalHandler(req, res);
    const resData = res._getData();

    if (!resData?.success || !Array.isArray(resData?.transactions)) {
      throw new Error('API nao retornou array de transacoes filtradas');
    }

    console.log('  [PASS] Endpoint financial-report responde com filtros de data e doctorId.');
    passed++;
  } catch (err) {
    console.error('  [FAIL] Teste 2 falhou:', err.message);
  }

  // ----------------------------------------------------
  // TESTE 3: FECHAMENTO DE REPASSE EM LOTE
  // ----------------------------------------------------
  let testTxId = null;
  try {
    console.log('\n[TEST 3/4] Testando Fechamento de Lote (Action close-repass-batch)...');
    const adminToken = generateAuthToken({ id: 1, name: 'Admin', role: 'admin' });

    const { data: newTx, error: insErr } = await supabaseAdmin
      .from('financial_transactions')
      .insert({
        professional_id: 1,
        gross_amount: 200.00,
        gateway_fee: 6.00,
        supplies_cost: 10.00,
        clinic_net: 64.00,
        professional_net: 120.00,
        split_snapshot: { type: 'PERCENTAGE', value: 60 },
        payment_status: 'PAGO'
      })
      .select()
      .single();

    if (insErr) throw insErr;
    testTxId = newTx.id;

    // Executa fechamento em lote para status PAGO / TRANSFERIDO
    const { req: rBatch, res: sBatch } = createMockReqRes('POST', {
      action: 'close-repass-batch',
      transactionIds: [testTxId],
      paymentStatus: 'PAGO'
    }, {}, adminToken);

    await medicalHandler(rBatch, sBatch);
    const batchRes = sBatch._getData();

    if (!batchRes?.success) throw new Error('Falha ao executar close-repass-batch: ' + (batchRes?.message || 'erro'));

    console.log('  [PASS] Transacao atualizada em lote com sucesso.');
    passed++;
  } catch (err) {
    console.error('  [FAIL] Teste 3 falhou:', err.message);
  } finally {
    if (testTxId) {
      await supabaseAdmin.from('financial_transactions').delete().eq('id', testTxId);
    }
  }

  // ----------------------------------------------------
  // TESTE 4: SEGURANÇA RBAC (MÉDICO SÓ ACESSA PRÓPRIO EXTRATO)
  // ----------------------------------------------------
  try {
    console.log('\n[TEST 4/4] Testando Protecao Anti-IDOR (Medico so acessa proprio repasse)...');
    const doc1Token = generateAuthToken({ id: 1, name: 'Dr. Carlos', role: 'doctor', doctorId: 1 });

    const { req: rDoc, res: sDoc } = createMockReqRes('GET', null, {
      view: 'financial-report',
      doctorId: '2'
    }, doc1Token);

    await medicalHandler(rDoc, sDoc);
    const docRes = sDoc._getData();

    const hasOtherDocTx = (docRes.transactions || []).some(t => t.professional_id === 2);
    if (hasOtherDocTx) {
      throw new Error('Falha de seguranca Anti-IDOR: Medico conseguiu ver transacoes de outro medico');
    }

    console.log('  [PASS] Anti-IDOR validado: Medico isolado apenas no seu proprio extrato.');
    passed++;
  } catch (err) {
    console.error('  [FAIL] Teste 4 falhou:', err.message);
  }

  console.log('\n========================================================');
  console.log('RESULTADO DOS TESTES FINANCEIROS: ' + passed + '/' + total + ' APROVADOS!');
  console.log('========================================================\n');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runFinancialExportTests();