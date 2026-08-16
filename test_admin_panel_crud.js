import medicalHandler, { generateAuthToken } from './api/medical.js';

const adminToken = generateAuthToken({ id: 1, name: 'Administrador Geral', username: 'admin', role: 'admin' });

function createMockReqRes(method, body = null, query = {}) {
  const req = { method, body, query, headers: { authorization: `Bearer ${adminToken}` } };
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

async function runAdminPanelTest() {
  console.log('🚀 ========================================================');
  console.log('🧪 TESTE COMPLETO DE OPERAÇÕES DO ADMIN PANEL (CRUD 4 ABAS)');
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
    // ---------------------------------------------------------
    // 1. ABA CONSULTÓRIOS & MULTI-TV: Criar, Listar e Atualizar
    // ---------------------------------------------------------
    console.log('▶️ [1/4] Testando Aba Consultórios (CRUD & TV de Destino)...');
    
    // Criar Consultório com TV 02
    const { req: rCreateOff, res: sCreateOff } = createMockReqRes('POST', {
      action: 'create-office',
      payload: {
        name: 'Consultório 05 - Dermatologia',
        code: 'C05',
        location: '1º Andar - Ala B',
        target_tv: '2'
      }
    });
    await medicalHandler(rCreateOff, sCreateOff);
    const createdOff = sCreateOff._getData()?.office;
    assertTest('Criar consultório com sucesso', sCreateOff._getStatusCode() === 200 && createdOff?.name?.includes('Dermatologia'));
    assertTest('TV de destino configurada para TV 02', createdOff?.target_tv === '2');

    // Listar Consultórios
    const { req: rListOff, res: sListOff } = createMockReqRes('POST', { action: 'list-offices' });
    await medicalHandler(rListOff, sListOff);
    const officesList = sListOff._getData()?.offices;
    assertTest('Listagem de consultórios retorna array válido', Array.isArray(officesList) && officesList.length > 0);

    // ---------------------------------------------------------
    // 2. ABA MÉDICOS: Criar Médico vinculado ao Consultório
    // ---------------------------------------------------------
    console.log('\n▶️ [2/4] Testando Aba Médicos (Cadastro, CRM & Consultório)...');
    const { req: rCreateDoc, res: sCreateDoc } = createMockReqRes('POST', {
      action: 'create-doctor',
      payload: {
        name: 'Dr. Fernando Dermatologista (Teste)',
        crm: '99887',
        crm_uf: 'SP',
        specialty: 'Dermatologia',
        phone: '(11) 98888-7777',
        email: 'fernando@cmip.com.br',
        office_id: createdOff?.id,
        createUser: true,
        username: 'dr_fernando',
        password: 'medico123'
      }
    });
    await medicalHandler(rCreateDoc, sCreateDoc);
    const createdDoc = sCreateDoc._getData()?.doctor;
    assertTest('Médico cadastrado com sucesso', sCreateDoc._getStatusCode() === 200 && createdDoc?.name?.includes('Fernando'));
    assertTest('Especialidade salva', createdDoc?.specialty === 'Dermatologia');

    // Listar Médicos
    const { req: rListDoc, res: sListDoc } = createMockReqRes('POST', { action: 'list-doctors' });
    await medicalHandler(rListDoc, sListDoc);
    const docsList = sListDoc._getData()?.doctors;
    assertTest('Listagem de médicos contém o novo médico', docsList?.some(d => d.crm === '99887'));

    // ---------------------------------------------------------
    // 3. ABA USUÁRIOS: Listar Usuários e Login do Novo Médico
    // ---------------------------------------------------------
    console.log('\n▶️ [3/4] Testando Aba Usuários (Acessos e Login do Médico Criado)...');
    const { req: rListUsers, res: sListUsers } = createMockReqRes('POST', { action: 'list-users' });
    await medicalHandler(rListUsers, sListUsers);
    const usersList = sListUsers._getData()?.users;
    assertTest('Listagem de usuários contém dr_fernando', usersList?.some(u => u.username === 'dr_fernando'));

    // Testar Login do novo usuário criado
    const { req: rLoginDoc, res: sLoginDoc } = createMockReqRes('POST', {
      action: 'login',
      payload: { username: 'dr_fernando', password: 'medico123' }
    });
    await medicalHandler(rLoginDoc, sLoginDoc);
    const loginRes = sLoginDoc._getData();
    assertTest('Login do novo médico autenticado com sucesso', loginRes?.success === true && loginRes?.user?.role === 'doctor');

    // ---------------------------------------------------------
    // 4. ABA FILAS: Teste de Reset Seguro
    // ---------------------------------------------------------
    console.log('\n▶️ [4/4] Testando Aba Filas (Reset do Dia)...');
    const { req: rReset, res: sReset } = createMockReqRes('POST', { action: 'reset-all' });
    await medicalHandler(rReset, sReset);
    assertTest('Reset de filas executado com status 200', sReset._getStatusCode() === 200);

    console.log('\n🎉 ========================================================');
    console.log(`📊 RESULTADO FINAL DO ADMIN PANEL: ${passed}/${total} TESTES PASSARAM!`);
    console.log('========================================================\n');

    if (passed === total) process.exit(0);
    else process.exit(1);

  } catch (err) {
    console.error('❌ Erro no teste do Admin Panel:', err);
    process.exit(1);
  }
}

runAdminPanelTest();
