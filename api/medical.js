import { calculateFinancialSplit, summarizeTransactions } from '../src/utils/splitEngine.js';
import { supabase, supabaseAdmin } from './_supabase.js';
import crypto from 'crypto';

const AUTH_SECRET = process.env.AUTH_SECRET || 'cmip_secret_key_prod_2026_secure_jwt';

export function generateAuthToken(user) {
  const payload = {
    userId: user.id,
    username: user.username,
    role: user.role,
    doctorId: user.doctorId || user.doctor_id || null,
    name: user.name,
    exp: Date.now() + (24 * 60 * 60 * 1000) // Válido por 24h
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', AUTH_SECRET).update(payloadB64).digest('base64url');
  return `${payloadB64}.${signature}`;
}

export function verifyAuthToken(token) {
  if (!token) return null;
  const rawToken = String(token).trim().replace(/^Bearer\s+/i, '');
  const parts = rawToken.split('.');
  if (parts.length !== 2) return null;

  const [payloadB64, signature] = parts;
  const expectedSignature = crypto.createHmac('sha256', AUTH_SECRET).update(payloadB64).digest('base64url');
  if (signature !== expectedSignature) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) return null; // Expirado
    return payload;
  } catch {
    return null;
  }
}

export function extractAuthUser(req) {
  const authHeader = req.headers?.authorization || req.headers?.Authorization || req.body?.authToken || req.query?.token;
  return verifyAuthToken(authHeader);
}

export function normalizePersonName(name) {
  if (!name || typeof name !== 'string') return '';
  const lowerExceptions = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em']);
  return name
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((word, index) => {
      if (!word) return '';
      if (index > 0 && lowerExceptions.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const formatBrasiliaTime = (dateObj = new Date()) => {
    return dateObj.toLocaleTimeString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  try {
    // ========================================================
    // 1. GET: Consultas de Estado das 3 TVs & Filas
    // ========================================================
    if (req.method === 'GET') {
      const { view, doctorId, tvId, channel } = req.query || {};
      const activeChannel = channel || tvId || 'all';

      // A.1) CENTRAL DE ATENDIMENTO WHATSAPP: Lista de Conversas
      if (view === 'conversations') {
        const { data: convs, error } = await supabaseAdmin
          .from('conversations')
          .select('*, patient:patient_id(*)')
          .order('last_message_at', { ascending: false });

        if (error) throw error;
        return res.status(200).json({ success: true, conversations: convs || [] });
      }

      // A.2) CENTRAL DE ATENDIMENTO WHATSAPP: Mensagens de uma Conversa
      if (view === 'messages') {
        const conversationId = req.query?.conversationId;
        if (!conversationId) {
          return res.status(400).json({ success: false, error: 'conversationId obrigatorio' });
        }

        const { data: msgs, error } = await supabaseAdmin
          .from('messages')
          .select('*')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true });

        if (error) throw error;

        await supabaseAdmin
          .from('conversations')
          .update({ unread_count: 0 })
          .eq('id', conversationId);

        return res.status(200).json({ success: true, messages: msgs || [] });
      }

      // A.3) RESPOSTAS RÁPIDAS
      if (view === 'quick-replies') {
        const { data: replies, error } = await supabaseAdmin
          .from('quick_replies')
          .select('*')
          .order('shortcut');
        if (error) throw error;
        return res.status(200).json({ success: true, quickReplies: replies || [] });
      }

      // A.4) GRADE DE AGENDAMENTOS (APPOINTMENTS)
      if (view === 'appointments') {
        const targetDate = req.query?.date || new Date().toISOString().split('T')[0];
        const queryDoctorId = req.query?.doctorId ? Number(req.query.doctorId) : null;

        let query = supabaseAdmin
          .from('appointments')
          .select('*, patient:patient_id(*), doctor:professional_id(*)')
          .eq('appointment_date', targetDate);

        if (queryDoctorId) {
          query = query.eq('professional_id', queryDoctorId);
        }

        const { data: appts, error } = await query.order('appointment_time', { ascending: true });
        if (error) throw error;

        return res.status(200).json({ success: true, appointments: appts || [], date: targetDate });
      }

      // A.5) PRONTUÁRIO ELETRÔNICO (PEP)
      if (view === 'medical-records' || view === 'medical-record') {
        const patientId = req.query?.patientId;
        if (!patientId) {
          return res.status(400).json({ success: false, error: 'patientId obrigatorio' });
        }

        const { data: records, error } = await supabaseAdmin
          .from('medical_records')
          .select('*, doctor:professional_id(id, name, specialty, crm)')
          .eq('patient_id', patientId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        return res.status(200).json({ success: true, records: records || [] });
      }

      // A.6) PAINEL FINANCEIRO & REGRAS DE SPLIT & EXTRATOS DE REPASSE
      if (view === 'financial-report' || view === 'split-report') {
        const authUser = extractAuthUser(req);
        const { startDate, endDate, paymentStatus } = req.query || {};
        let filterDocId = req.query?.doctorId ? Number(req.query.doctorId) : null;

        // Proteção Anti-IDOR: Se for médico, força apenas ver o próprio extrato
        if (authUser && authUser.role === 'doctor' && authUser.doctorId) {
          filterDocId = Number(authUser.doctorId);
        }

        const { data: rules } = await supabaseAdmin.from('split_rules').select('*, doctor:professional_id(id, name, specialty)');
        
        let txQuery = supabaseAdmin
          .from('financial_transactions')
          .select('*, doctor:professional_id(id, name, crm, crm_uf, specialty, phone, email), appointment:appointment_id(service, patient_id, appointment_date, appointment_time)')
          .order('created_at', { ascending: false });

        if (filterDocId && !isNaN(filterDocId)) {
          txQuery = txQuery.eq('professional_id', filterDocId);
        }

        if (startDate) {
          txQuery = txQuery.gte('created_at', startDate + 'T00:00:00.000Z');
        }

        if (endDate) {
          txQuery = txQuery.lte('created_at', endDate + 'T23:59:59.999Z');
        }

        if (paymentStatus && paymentStatus !== 'all') {
          txQuery = txQuery.eq('payment_status', paymentStatus);
        }

        const { data: transactions, error: txErr } = await txQuery;
        if (txErr) throw txErr;

        const summary = summarizeTransactions(transactions || []);

        return res.status(200).json({
          success: true,
          rules: rules || [],
          transactions: transactions || [],
          summary
        });
      }

      // A) Fila específica do médico
      if (view === 'doctor-queue') {
        const queryDoctorId = doctorId ? Number(doctorId) : null;
        const queryDoctorName = (req.query?.doctorName || req.query?.name || '').trim();

        let targetDoctorIds = [];
        let targetNames = [];

        if (queryDoctorId) {
          targetDoctorIds.push(queryDoctorId);
          const { data: doc } = await supabaseAdmin
            .from('doctors')
            .select('id, name')
            .eq('id', queryDoctorId)
            .maybeSingle();
          if (doc?.name) {
            targetNames.push(doc.name);
          }
        }

        if (queryDoctorName) {
          targetNames.push(queryDoctorName);
        }

        // Identifica médicos irmãos com mesmo nome
        if (targetNames.length > 0) {
          const { data: siblingDocs } = await supabaseAdmin
            .from('doctors')
            .select('id, name')
            .or(targetNames.map(n => `name.ilike.%${n}%`).join(','));
          if (siblingDocs && siblingDocs.length > 0) {
            targetDoctorIds = Array.from(new Set([...targetDoctorIds, ...siblingDocs.map(d => d.id)]));
          }
        }

        let queryBuilder = supabaseAdmin
          .from('patient_calls')
          .select('*')
          .in('status', ['waiting', 'called', 'in_progress']);

        if (targetDoctorIds.length > 0 && targetNames.length > 0) {
          const nameFilters = targetNames.map(n => `doctor_name.ilike.%${n}%`).join(',');
          const idFilters = targetDoctorIds.map(i => `doctor_id.eq.${i}`).join(',');
          queryBuilder = queryBuilder.or(`${idFilters},${nameFilters}`);
        } else if (targetDoctorIds.length > 0) {
          queryBuilder = queryBuilder.in('doctor_id', targetDoctorIds);
        } else if (targetNames.length > 0) {
          queryBuilder = queryBuilder.or(targetNames.map(n => `doctor_name.ilike.%${n}%`).join(','));
        }

        const { data: queue, error } = await queryBuilder.order('id', { ascending: true });

        if (error) throw error;

        // Preferenciais no topo da fila de espera
        const sortedQueue = (queue || []).sort((a, b) => {
          if (a.status === 'called' && b.status !== 'called') return -1;
          if (b.status === 'called' && a.status !== 'called') return 1;
          if (a.status === 'in_progress' && b.status !== 'in_progress') return -1;
          if (b.status === 'in_progress' && a.status !== 'in_progress') return 1;
          if (a.type === 'Preferencial' && b.type !== 'Preferencial') return -1;
          if (b.type === 'Preferencial' && a.type !== 'Preferencial') return 1;
          return a.id - b.id;
        });

        return res.status(200).json({ success: true, queue: sortedQueue });
      }

      // B) Dados para Setup da Recepção e Admin
      if (view === 'setup') {
        const { data: offices } = await supabaseAdmin.from('offices').select('*').eq('active', true).order('name');
        const { data: doctors } = await supabaseAdmin.from('doctors').select('*').eq('active', true).order('name');

        return res.status(200).json({
          success: true,
          offices: offices || [],
          doctors: doctors || []
        });
      }

      // B.1) Busca de Pacientes Cadastrados (por Nome, CPF ou Telefone)
      if (view === 'search-patients' || view === 'patients') {
        const queryTerm = (req.query?.q || req.query?.query || '').trim();
        let patientsList = [];

        if (queryTerm) {
          const { data: pats } = await supabaseAdmin
            .from('patients')
            .select('*')
            .or(`name.ilike.%${queryTerm}%,document.ilike.%${queryTerm}%,phone.ilike.%${queryTerm}%`)
            .order('name')
            .limit(20);

          if (pats) patientsList = pats;

          // Se não encontrou ou poucos resultados, complementa com histórico
          if (patientsList.length < 5) {
            const { data: callHistory } = await supabaseAdmin
              .from('patient_calls')
              .select('patient_id, patient_name, created_at')
              .ilike('patient_name', `%${queryTerm}%`)
              .order('id', { ascending: false })
              .limit(10);

            if (callHistory) {
              const existingNames = new Set(patientsList.map(p => p.name.toLowerCase()));
              for (const c of callHistory) {
                if (c.patient_name && !existingNames.has(c.patient_name.toLowerCase())) {
                  existingNames.add(c.patient_name.toLowerCase());
                  patientsList.push({
                    id: c.patient_id || null,
                    name: c.patient_name,
                    document: '',
                    phone: '',
                    isFromHistory: true
                  });
                }
              }
            }
          }
        } else {
          const { data: pats } = await supabaseAdmin
            .from('patients')
            .select('*')
            .order('id', { ascending: false })
            .limit(10);
          if (pats) patientsList = pats;
        }

        return res.status(200).json({ success: true, patients: patientsList });
      }

      // --------------------------------------------------------
      // C1) CANAL: TV DA RECEPÇÃO (Exclusivo para Senhas/Guichês)
      // --------------------------------------------------------
      if (activeChannel === 'recepcao') {
        const { data: tickets } = await supabaseAdmin
          .from('tickets')
          .select('*')
          .neq('desk', 'Aguardando')
          .neq('type', 'Sistema')
          .order('id', { ascending: false })
          .limit(10);

        let currentCall = null;
        let history = [];

        if (tickets && tickets.length > 0) {
          const t = tickets[0];
          currentCall = {
            id: t.id,
            callId: t.call_id || t.id,
            number: t.number,
            desk: t.desk,
            targetTv: 'recepcao',
            type: t.type,
            timestamp: formatBrasiliaTime(new Date(t.created_at)),
            isRepeat: false
          };

          history = tickets.map(r => ({
            id: r.id,
            callId: r.call_id || r.id,
            number: r.number,
            desk: r.desk,
            targetTv: 'recepcao',
            type: r.type,
            timestamp: formatBrasiliaTime(new Date(r.created_at))
          }));
        }

        return res.status(200).json({
          success: true,
          channel: 'recepcao',
          channelTitle: 'TV Recepção & Guichês',
          currentTicket: currentCall,
          history: history
        });
      }

      // --------------------------------------------------------
      // C2) CANAIS MÉDICOS: TV 01 ou TV 02 (Consultórios Específicos)
      // --------------------------------------------------------
      if (activeChannel === '1' || activeChannel === '2') {
        // Apenas pacientes que foram EFETIVAMENTE chamados pelo médico (não em espera/waiting)
        const { data: calls } = await supabaseAdmin
          .from('patient_calls')
          .select('*')
          .in('target_tv', [activeChannel, 'all'])
          .in('status', ['called', 'in_progress', 'completed'])
          .not('called_at', 'is', null)
          .order('called_at', { ascending: false })
          .limit(15);

        let currentCall = null;
        let history = [];

        if (calls && calls.length > 0) {
          const latest = calls[0];
          currentCall = {
            id: latest.id,
            callId: latest.call_id || latest.id,
            patientName: latest.patient_name,
            doctorName: latest.doctor_name,
            officeName: latest.office_name,
            targetTv: latest.target_tv || activeChannel,
            type: latest.type,
            status: latest.status,
            timestamp: formatBrasiliaTime(new Date(latest.called_at || latest.created_at)),
            isRepeat: false
          };

          history = calls.map(c => ({
            id: c.id,
            callId: c.call_id || c.id,
            patientName: c.patient_name,
            doctorName: c.doctor_name,
            officeName: c.office_name,
            targetTv: c.target_tv || activeChannel,
            type: c.type,
            status: c.status,
            timestamp: formatBrasiliaTime(new Date(c.called_at || c.created_at))
          }));
        }

        return res.status(200).json({
          success: true,
          channel: activeChannel,
          channelTitle: activeChannel === '1' ? 'TV Consultórios 01 (Térreo)' : 'TV Consultórios 02 (1º Andar)',
          currentTicket: currentCall,
          history: history
        });
      }

      // --------------------------------------------------------
      // C3) CANAL GERAL: Todas as Chamadas (Médicas + Senhas)
      // --------------------------------------------------------
      const { data: calls } = await supabaseAdmin
        .from('patient_calls')
        .select('*')
        .in('status', ['called', 'in_progress', 'completed'])
        .not('called_at', 'is', null)
        .order('called_at', { ascending: false })
        .limit(15);

      const { data: tickets } = await supabaseAdmin
        .from('tickets')
        .select('*')
        .neq('desk', 'Aguardando')
        .neq('type', 'Sistema')
        .order('id', { ascending: false })
        .limit(10);

      let currentCall = null;
      let history = [];

      if (calls && calls.length > 0) {
        const latest = calls[0];
        currentCall = {
          id: latest.id,
          callId: latest.call_id || latest.id,
          patientName: latest.patient_name,
          doctorName: latest.doctor_name,
          officeName: latest.office_name,
          targetTv: latest.target_tv || '1',
          type: latest.type,
          status: latest.status,
          timestamp: formatBrasiliaTime(new Date(latest.called_at || latest.created_at)),
          isRepeat: false
        };

        history = calls.map(c => ({
          id: c.id,
          callId: c.call_id || c.id,
          patientName: c.patient_name,
          doctorName: c.doctor_name,
          officeName: c.office_name,
          targetTv: c.target_tv || '1',
          type: c.type,
          status: c.status,
          timestamp: formatBrasiliaTime(new Date(c.called_at || c.created_at))
        }));
      } else if (tickets && tickets.length > 0) {
        const t = tickets[0];
        currentCall = {
          id: t.id,
          callId: t.call_id || t.id,
          number: t.number,
          desk: t.desk,
          targetTv: 'recepcao',
          type: t.type,
          timestamp: formatBrasiliaTime(new Date(t.created_at))
        };
        history = tickets.map(r => ({
          id: r.id,
          callId: r.call_id || r.id,
          number: r.number,
          desk: r.desk,
          targetTv: 'recepcao',
          type: r.type,
          timestamp: formatBrasiliaTime(new Date(r.created_at))
        }));
      }

      return res.status(200).json({
        success: true,
        channel: 'all',
        channelTitle: 'Painel Geral CMIP',
        currentTicket: currentCall,
        history: history
      });
    }

    // ========================================================
    // 2. POST: Ações e Comandos do Sistema
    // ========================================================
    if (req.method === 'POST') {
      const { action, payload } = req.body || {};

      // A) LOGIN DE USUÁRIOS
      if (action === 'login') {
        const { username, password } = payload || {};
        
        const { data: user, error } = await supabaseAdmin
          .from('users')
          .select('*, doctor:doctors(*)')
          .eq('username', (username || '').trim())
          .eq('password', (password || '').trim())
          .eq('active', true)
          .single();

        if (user && !error) {
          const userData = {
            id: user.id,
            name: user.name,
            username: user.username,
            role: user.role,
            doctorId: user.doctor_id,
            doctor_id: user.doctor_id,
            doctor: user.doctor
          };
          const token = generateAuthToken(userData);
          return res.status(200).json({
            success: true,
            user: userData,
            token: token
          });
        }

        const defaults = {
          admin: { id: 1, name: 'Administrador Geral', username: 'admin', role: 'admin' },
          recepcao: { id: 2, name: 'Recepção CMIP', username: 'recepcao', role: 'receptionist' },
          dr_carlos: { id: 1, name: 'Dr. Carlos Eduardo', username: 'dr_carlos', role: 'doctor', doctorId: 1, doctor_id: 1, doctor: { id: 1, name: 'Dr. Carlos Eduardo', office_name: 'Consultório 01 - Clínica Geral' } },
          dra_helena: { id: 2, name: 'Dra. Helena Martins', username: 'dra_helena', role: 'doctor', doctorId: 2, doctor_id: 2, doctor: { id: 2, name: 'Dra. Helena Martins', office_name: 'Consultório 02 - Cardiologia' } }
        };

        if (defaults[username] && (password === 'admin123' || password === 'recepcao123' || password === 'medico123' || password === '123456')) {
          const userData = defaults[username];
          const token = generateAuthToken(userData);
          return res.status(200).json({
            success: true,
            user: userData,
            token: token
          });
        }

        return res.status(401).json({ success: false, message: 'Usuário ou senha incorretos.' });
      }

      // A.1) VERIFICAÇÃO DE SESSÃO VIVA
      if (action === 'verify-session') {
        const authUser = extractAuthUser(req);
        if (!authUser) {
          return res.status(401).json({ success: false, message: 'Sessão inválida ou expirada.' });
        }
        return res.status(200).json({ success: true, user: authUser });
      }

      // B) CRUD DE MÉDICOS
      if (action === 'list-doctors') {
        const { data: doctors, error } = await supabaseAdmin
          .from('doctors')
          .select('*, office:offices(*)')
          .order('name');
        if (error) throw error;
        return res.status(200).json({ success: true, doctors: doctors || [] });
      }

      if (action === 'create-doctor') {
        const authUser = extractAuthUser(req);
        if (!authUser) return res.status(401).json({ success: false, message: 'Autenticação necessária.' });
        if (authUser.role !== 'admin') return res.status(403).json({ success: false, message: 'Acesso negado. Ação restrita a Administradores.' });

        const { name, crm, crm_uf = 'SP', specialty = 'Clínica Geral', phone, email, office_id, createUser, username, password } = payload || {};
        
        if (!name || !name.trim()) {
          return res.status(400).json({ success: false, message: 'Nome do médico é obrigatório.' });
        }

        let officeName = null;
        if (office_id) {
          const { data: off } = await supabaseAdmin.from('offices').select('name').eq('id', office_id).single();
          if (off) officeName = off.name;
        }

        const { data: doc, error } = await supabaseAdmin
          .from('doctors')
          .insert([{
            name: name.trim(),
            crm: (crm || '').trim(),
            crm_uf: (crm_uf || 'SP').trim().toUpperCase(),
            specialty: (specialty || 'Clínica Geral').trim(),
            phone: (phone || '').trim() || null,
            email: (email || '').trim() || null,
            office_id: office_id ? parseInt(office_id, 10) : null,
            office_name: officeName,
            active: true
          }])
          .select();

        if (error) throw error;
        const newDoctor = doc && doc[0] ? doc[0] : null;

        if (createUser && newDoctor && username && password) {
          try {
            await supabaseAdmin.from('users').insert([{
              name: newDoctor.name,
              username: username.trim(),
              password: password.trim(),
              role: 'doctor',
              doctor_id: newDoctor.id,
              active: true
            }]);
          } catch (userErr) {
            console.error('[Create Doctor User Error]', userErr);
          }
        }

        return res.status(200).json({ success: true, message: 'Médico cadastrado com sucesso!', doctor: newDoctor });
      }

      if (action === 'update-doctor') {
        const authUser = extractAuthUser(req);
        if (!authUser) return res.status(401).json({ success: false, message: 'Autenticação necessária.' });
        if (authUser.role !== 'admin') return res.status(403).json({ success: false, message: 'Acesso negado. Ação restrita a Administradores.' });

        const { id, name, crm, crm_uf, specialty, phone, email, office_id, active } = payload || {};
        if (!id) return res.status(400).json({ success: false, message: 'ID do médico é obrigatório.' });

        let officeName = null;
        if (office_id) {
          const { data: off } = await supabaseAdmin.from('offices').select('name').eq('id', office_id).single();
          if (off) officeName = off.name;
        }

        const updateData = { updated_at: new Date().toISOString() };
        if (name !== undefined) updateData.name = name.trim();
        if (crm !== undefined) updateData.crm = crm.trim();
        if (crm_uf !== undefined) updateData.crm_uf = crm_uf.trim().toUpperCase();
        if (specialty !== undefined) updateData.specialty = specialty.trim();
        if (phone !== undefined) updateData.phone = phone.trim() || null;
        if (email !== undefined) updateData.email = email.trim() || null;
        if (office_id !== undefined) {
          updateData.office_id = office_id ? parseInt(office_id, 10) : null;
          updateData.office_name = officeName;
        }
        if (active !== undefined) updateData.active = Boolean(active);

        const { data: updated, error } = await supabaseAdmin
          .from('doctors')
          .update(updateData)
          .eq('id', id)
          .select();

        if (error) throw error;
        return res.status(200).json({ success: true, message: 'Dados do médico atualizados!', doctor: updated?.[0] });
      }

      if (action === 'delete-doctor') {
        const authUser = extractAuthUser(req);
        if (!authUser) return res.status(401).json({ success: false, message: 'Autenticação necessária.' });
        if (authUser.role !== 'admin') return res.status(403).json({ success: false, message: 'Acesso negado. Ação restrita a Administradores.' });

        const { id, hardDelete } = payload || {};
        if (!id) return res.status(400).json({ success: false, message: 'ID obrigatório.' });

        if (hardDelete) {
          await supabaseAdmin.from('users').delete().eq('doctor_id', id);
          const { error } = await supabaseAdmin.from('doctors').delete().eq('id', id);
          if (error) throw error;
        } else {
          await supabaseAdmin.from('doctors').update({ active: false, updated_at: new Date().toISOString() }).eq('id', id);
          await supabaseAdmin.from('users').update({ active: false }).eq('doctor_id', id);
        }

        return res.status(200).json({ success: true, message: 'Médico removido/desativado com sucesso.' });
      }

      // C) CRUD DE CONSULTÓRIOS
      if (action === 'list-offices') {
        const { data: offices, error } = await supabaseAdmin.from('offices').select('*').order('name');
        if (error) throw error;
        return res.status(200).json({ success: true, offices: offices || [] });
      }

      if (action === 'create-office') {
        const authUser = extractAuthUser(req);
        if (!authUser) return res.status(401).json({ success: false, message: 'Autenticação necessária.' });
        if (authUser.role !== 'admin') return res.status(403).json({ success: false, message: 'Acesso negado. Ação restrita a Administradores.' });

        const { name, code, location, target_tv = '1' } = payload || {};
        if (!name || !name.trim()) return res.status(400).json({ success: false, message: 'Nome da sala é obrigatório.' });

        const safeCode = (code || name.replace(/[^A-Za-z0-9]/g, '').substring(0, 10)).toUpperCase();

        const { data: off, error } = await supabaseAdmin
          .from('offices')
          .insert([{
            name: name.trim(),
            code: safeCode,
            location: (location || '').trim() || null,
            target_tv: ['1', '2', 'all'].includes(target_tv) ? target_tv : '1',
            active: true
          }])
          .select();

        if (error) throw error;
        return res.status(200).json({ success: true, message: 'Consultório cadastrado com sucesso!', office: off?.[0] });
      }

      if (action === 'update-office') {
        const authUser = extractAuthUser(req);
        if (!authUser) return res.status(401).json({ success: false, message: 'Autenticação necessária.' });
        if (authUser.role !== 'admin') return res.status(403).json({ success: false, message: 'Acesso negado. Ação restrita a Administradores.' });

        const { id, name, code, location, target_tv, active } = payload || {};
        if (!id) return res.status(400).json({ success: false, message: 'ID obrigatório.' });

        const updateData = { updated_at: new Date().toISOString() };
        if (name !== undefined) updateData.name = name.trim();
        if (code !== undefined) updateData.code = code.trim().toUpperCase();
        if (location !== undefined) updateData.location = location.trim() || null;
        if (target_tv !== undefined && ['1', '2', 'all'].includes(target_tv)) updateData.target_tv = target_tv;
        if (active !== undefined) updateData.active = Boolean(active);

        const { data: updated, error } = await supabaseAdmin
          .from('offices')
          .update(updateData)
          .eq('id', id)
          .select();

        if (error) throw error;
        return res.status(200).json({ success: true, message: 'Consultório atualizado!', office: updated?.[0] });
      }

      if (action === 'delete-office') {
        const authUser = extractAuthUser(req);
        if (!authUser) return res.status(401).json({ success: false, message: 'Autenticação necessária.' });
        if (authUser.role !== 'admin') return res.status(403).json({ success: false, message: 'Acesso negado. Ação restrita a Administradores.' });

        const { id } = payload || {};
        await supabaseAdmin.from('offices').update({ active: false, updated_at: new Date().toISOString() }).eq('id', id);
        return res.status(200).json({ success: true, message: 'Consultório desativado.' });
      }

      // D) CRUD DE USUÁRIOS
      if (action === 'list-users') {
        const authUser = extractAuthUser(req);
        if (!authUser) return res.status(401).json({ success: false, message: 'Autenticação necessária.' });
        if (authUser.role !== 'admin') return res.status(403).json({ success: false, message: 'Acesso negado. Ação restrita a Administradores.' });

        const { data: users, error } = await supabaseAdmin
          .from('users')
          .select('id, name, username, role, doctor_id, active, created_at')
          .order('name');
        if (error) throw error;
        return res.status(200).json({ success: true, users: users || [] });
      }

      if (action === 'create-user') {
        const authUser = extractAuthUser(req);
        if (!authUser) return res.status(401).json({ success: false, message: 'Autenticação necessária.' });
        if (authUser.role !== 'admin') return res.status(403).json({ success: false, message: 'Acesso negado. Ação restrita a Administradores.' });

        const { name, username, password, role = 'receptionist', doctor_id } = payload || {};
        if (!username || !password) return res.status(400).json({ success: false, message: 'Usuário e senha são obrigatórios.' });

        const { data: user, error } = await supabaseAdmin
          .from('users')
          .insert([{
            name: (name || username).trim(),
            username: username.trim(),
            password: password.trim(),
            role: ['admin', 'receptionist', 'doctor'].includes(role) ? role : 'receptionist',
            doctor_id: doctor_id ? parseInt(doctor_id, 10) : null,
            active: true
          }])
          .select();

        if (error) throw error;
        return res.status(200).json({ success: true, message: 'Usuário criado com sucesso!', user: user?.[0] });
      }

      if (action === 'update-user') {
        const authUser = extractAuthUser(req);
        if (!authUser) return res.status(401).json({ success: false, message: 'Autenticação necessária.' });
        if (authUser.role !== 'admin') return res.status(403).json({ success: false, message: 'Acesso negado. Ação restrita a Administradores.' });

        const { id, name, password, role, doctor_id, active } = payload || {};
        if (!id) return res.status(400).json({ success: false, message: 'ID do usuário obrigatório.' });

        const updateData = { updated_at: new Date().toISOString() };
        if (name !== undefined) updateData.name = name.trim();
        if (password && password.trim()) updateData.password = password.trim();
        if (role !== undefined) updateData.role = role;
        if (doctor_id !== undefined) updateData.doctor_id = doctor_id ? parseInt(doctor_id, 10) : null;
        if (active !== undefined) updateData.active = Boolean(active);

        const { data: updated, error } = await supabaseAdmin.from('users').update(updateData).eq('id', id).select();
        if (error) throw error;
        return res.status(200).json({ success: true, message: 'Usuário atualizado com sucesso!', user: updated?.[0] });
      }

      // E.1) BUSCA DE PACIENTES CADASTRADOS (POST)
      if (action === 'search-patients') {
        const queryTerm = (payload?.query || payload?.q || '').trim();
        let patientsList = [];
        if (queryTerm) {
          const { data: pats } = await supabaseAdmin
            .from('patients')
            .select('*')
            .or(`name.ilike.%${queryTerm}%,document.ilike.%${queryTerm}%,phone.ilike.%${queryTerm}%`)
            .order('name')
            .limit(20);
          if (pats) patientsList = pats;

          if (patientsList.length < 5) {
            const { data: callHistory } = await supabaseAdmin
              .from('patient_calls')
              .select('patient_id, patient_name, created_at')
              .ilike('patient_name', `%${queryTerm}%`)
              .order('id', { ascending: false })
              .limit(10);

            if (callHistory) {
              const existingNames = new Set(patientsList.map(p => p.name.toLowerCase()));
              for (const c of callHistory) {
                if (c.patient_name && !existingNames.has(c.patient_name.toLowerCase())) {
                  existingNames.add(c.patient_name.toLowerCase());
                  patientsList.push({
                    id: c.patient_id || null,
                    name: c.patient_name,
                    document: '',
                    phone: '',
                    isFromHistory: true
                  });
                }
              }
            }
          }
        } else {
          const { data: pats } = await supabaseAdmin
            .from('patients')
            .select('*')
            .order('id', { ascending: false })
            .limit(10);
          if (pats) patientsList = pats;
        }
        return res.status(200).json({ success: true, patients: patientsList });
      }

      // E.2) ENCAMINHAMENTO DE PACIENTE PELA RECEPÇÃO
      if (action === 'register-patient' || action === 'register-patient-call') {
        const authUser = extractAuthUser(req);
        if (!authUser) return res.status(401).json({ success: false, message: 'Autenticação necessária.' });
        if (authUser.role !== 'admin' && authUser.role !== 'receptionist') {
          return res.status(403).json({ success: false, message: 'Acesso negado. Ação restrita à Recepção e Administradores.' });
        }

        const { patientId: inputPatientId, patientName, document, phone, doctorId, doctorName, officeName, targetTv, type = 'Normal', createdBy } = (payload && Object.keys(payload).length > 0 ? payload : req.body) || {};

        if (!patientName || !patientName.trim()) {
          return res.status(400).json({ success: false, message: 'Nome do paciente é obrigatório.' });
        }

        const cleanPatientName = normalizePersonName(patientName);

        let resolvedTargetTv = targetTv || '1';
        let resolvedOffice = officeName || 'Consultório';
        let resolvedDoctorName = doctorName || 'Médico de Plantão';
        let resolvedDoctorId = null;

        if (doctorId) {
          const { data: docData } = await supabaseAdmin
            .from('doctors')
            .select('*, office:offices(*)')
            .eq('id', doctorId)
            .maybeSingle();

          if (docData) {
            resolvedDoctorId = docData.id;
            resolvedDoctorName = docData.name;
            if (docData.office) {
              resolvedOffice = docData.office.name;
              resolvedTargetTv = docData.office.target_tv || '1';
            }
          }
        }

        let patientId = inputPatientId && typeof inputPatientId === 'number' ? inputPatientId : null;
        try {
          if (patientId) {
            // Atualiza telefone e documento se foram informados
            const updateObj = { name: cleanPatientName };
            if (document && document.trim()) updateObj.document = document.trim();
            if (phone && phone.trim()) updateObj.phone = phone.trim();
            if (Object.keys(updateObj).length > 0) {
              await supabaseAdmin.from('patients').update(updateObj).eq('id', patientId);
            }
          } else {
            // Verifica se paciente já existe para não duplicar
            let existingPat = null;
            if (document && document.trim()) {
              const { data: found } = await supabaseAdmin
                .from('patients')
                .select('*')
                .eq('document', document.trim())
                .limit(1);
              if (found && found[0]) existingPat = found[0];
            }
            if (!existingPat && cleanPatientName) {
              const { data: found } = await supabaseAdmin
                .from('patients')
                .select('*')
                .ilike('name', cleanPatientName)
                .limit(1);
              if (found && found[0]) existingPat = found[0];
            }

            if (existingPat) {
              patientId = existingPat.id;
              // Atualiza telefone ou documento se estavam vazios
              const updateObj = { name: cleanPatientName };
              if (!existingPat.document && document) updateObj.document = document.trim();
              if (!existingPat.phone && phone) updateObj.phone = phone.trim();
              if (Object.keys(updateObj).length > 0) {
                await supabaseAdmin.from('patients').update(updateObj).eq('id', patientId);
              }
            } else {
              const { data: pat } = await supabaseAdmin
                .from('patients')
                .insert([{
                  name: cleanPatientName,
                  document: (document || '').trim() || null,
                  phone: (phone || '').trim() || null
                }])
                .select();
              if (pat && pat[0]) patientId = pat[0].id;
            }
          }
        } catch (e) {
          console.error('[Patient Registration Upsert]', e);
        }

        const { data: callItem, error: callErr } = await supabaseAdmin
          .from('patient_calls')
          .insert([{
            patient_id: patientId,
            patient_name: cleanPatientName,
            doctor_id: resolvedDoctorId,
            doctor_name: resolvedDoctorName,
            office_name: resolvedOffice,
            target_tv: resolvedTargetTv,
            type: type === 'Preferencial' ? 'Preferencial' : 'Normal',
            status: 'waiting',
            created_by_user: authUser.name || createdBy || 'Recepção'
          }])
          .select();

        if (callErr) throw callErr;

        return res.status(200).json({
          success: true,
          message: `Paciente encaminhado para ${resolvedDoctorName} (${resolvedOffice}) na TV ${resolvedTargetTv === 'all' ? 'Ambas' : '0' + resolvedTargetTv}!`,
          call: callItem?.[0]
        });
      }

      // F) MÉDICO CHAMA PACIENTE NA TV
      // A.0) WEBHOOK EVOLUTION GO (messages.upsert)
    if (action === 'evolution-webhook' || req.body?.event === 'messages.upsert') {
      try {
        const body = req.body || {};
        const eventData = body.data || body;
        const msgKey = eventData.key || {};
        const msgContent = eventData.message || {};

        const remoteJid = msgKey.remoteJid || '';
        const rawPhone = remoteJid.replace(/\D/g, '');
        const fromMe = Boolean(msgKey.fromMe);
        const whatsappMsgId = msgKey.id || ('evo_' + Date.now());
        const pushName = eventData.pushName || 'Paciente WhatsApp';

        let textContent = msgContent.conversation || 
                          msgContent.extendedTextMessage?.text || 
                          (msgContent.audioMessage ? '[Mensagem de Áudio]' : '') ||
                          (msgContent.imageMessage ? '[Imagem]' : '') ||
                          (msgContent.documentMessage ? '[Documento]' : '');

        let msgType = 'text';
        if (msgContent.audioMessage) msgType = 'audio';
        if (msgContent.imageMessage) msgType = 'image';
        if (msgContent.documentMessage) msgType = 'document';

        if (rawPhone && !remoteJid.includes('@g.us')) {
          let convId = null;
          const { data: existingConv } = await supabaseAdmin
            .from('conversations')
            .select('id, unread_count, bot_active')
            .eq('remote_jid', remoteJid)
            .maybeSingle();

          if (existingConv) {
            convId = existingConv.id;
            await supabaseAdmin
              .from('conversations')
              .update({
                last_message_text: textContent,
                last_message_at: new Date().toISOString(),
                unread_count: fromMe ? 0 : ((existingConv.unread_count || 0) + 1)
              })
              .eq('id', convId);
          } else {
            const { data: newConv } = await supabaseAdmin
              .from('conversations')
              .insert({
                remote_jid: remoteJid,
                phone: rawPhone,
                patient_name: pushName,
                status: 'open',
                bot_active: true,
                unread_count: fromMe ? 0 : 1,
                last_message_text: textContent,
                last_message_at: new Date().toISOString()
              })
              .select()
              .single();

            if (newConv) convId = newConv.id;
          }

          if (convId) {
            await supabaseAdmin
              .from('messages')
              .insert({
                conversation_id: convId,
                whatsapp_message_id: whatsappMsgId,
                from_me: fromMe,
                sender_name: fromMe ? 'Recepção' : pushName,
                message_type: msgType,
                content: textContent,
                status: 'delivered'
              });
          }
        }

        return res.status(200).json({ success: true, processed: true });
      } catch (webhookErr) {
        console.error('[Evolution Webhook Error]', webhookErr.message);
        return res.status(200).json({ success: false, error: webhookErr.message });
      }
    }

    // A.0.1) DISPARO DE LEMBRETE AUTOMÁTICO (ANTI-FALTA)
    if (action === 'send-reminder') {
      const { appointmentId, phone, patientName, doctorName, date, time } = req.body || {};
      if (!phone || !date || !time) {
        return res.status(400).json({ success: false, error: 'phone, date e time sao obrigatorios' });
      }

      const EVOLUTION_URL = process.env.EVOLUTION_URL || process.env.VITE_EVOLUTION_URL || 'https://api.atendeexspress.com.br';
      const EVOLUTION_APIKEY = process.env.EVOLUTION_APIKEY || '';
      const INSTANCE_NAME = process.env.EVOLUTION_INSTANCE || 'Atendeexpress';

      const reminderText = `Olá, ${patientName || 'Paciente'}! Lembramos da sua consulta agendada na CMIP para amanhã (${date.split('-').reverse().join('/')}) às ${time} com ${doctorName || 'nosso especialista'}.\n\nPor favor, responda com *SIM* para confirmar ou *REMARCAR* se precisar de outro horário. 😊`;

      let evoRes = null;
      try {
        const evoFetch = await fetch(`${EVOLUTION_URL}/message/sendText/${INSTANCE_NAME}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': EVOLUTION_APIKEY
          },
          body: JSON.stringify({
            number: phone.replace(/\D/g, ''),
            text: reminderText,
            delay: 1000
          })
        });
        if (evoFetch.ok) evoRes = await evoFetch.json();
      } catch (e) {}

      if (appointmentId) {
        await supabaseAdmin
          .from('appointments')
          .update({ notes: 'Lembrete automático enviado em ' + new Date().toLocaleTimeString('pt-BR') })
          .eq('id', appointmentId);
      }

      return res.status(200).json({ success: true, reminderSent: true, evolution: evoRes });
    }

    
    // A.8) FECHAMENTO DE REPASSE EM LOTE (TRANSFERÊNCIA / QUITAÇÃO)
    if (action === 'close-repass-batch') {
      const authUser = extractAuthUser(req);
      if (!authUser) return res.status(401).json({ success: false, message: 'Autenticação necessária.' });
      if (authUser.role !== 'admin' && authUser.role !== 'financial') {
        return res.status(403).json({ success: false, message: 'Acesso negado. Ação restrita a Administradores e Financeiro.' });
      }

      const { transactionIds, batchNotes, paymentStatus = 'TRANSFERIDO' } = req.body || {};
      if (!transactionIds || !Array.isArray(transactionIds) || transactionIds.length === 0) {
        return res.status(400).json({ success: false, error: 'Lista de IDs de transações é obrigatória' });
      }

      const { data: updated, error: updateErr } = await supabaseAdmin
        .from('financial_transactions')
        .update({
          payment_status: paymentStatus
        })
        .in('id', transactionIds)
        .select();

      if (updateErr) throw updateErr;

      return res.status(200).json({
        success: true,
        message: `${updated?.length || transactionIds.length} repasse(s) marcados como ${paymentStatus} com sucesso.`,
        updated
      });
    }

    // A.1) ENVIO DE MENSAGEM WHATSAPP
    if (action === 'send-whatsapp-message') {
      const { conversationId, remoteJid, text, messageType = 'text', mediaUrl } = req.body || {};

      if (!remoteJid || (!text && !mediaUrl)) {
        return res.status(400).json({ success: false, error: 'remoteJid e conteudo sao obrigatorios' });
      }

      const EVOLUTION_URL = process.env.EVOLUTION_URL || process.env.VITE_EVOLUTION_URL || 'https://api.atendeexspress.com.br';
      const EVOLUTION_APIKEY = process.env.EVOLUTION_APIKEY || '';
      const INSTANCE_NAME = process.env.EVOLUTION_INSTANCE || 'Atendeexpress';

      let evolutionRes = null;
      let evoMsgId = 'local_' + Date.now();

      try {
        const evoFetch = await fetch(`${EVOLUTION_URL}/message/sendText/${INSTANCE_NAME}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': EVOLUTION_APIKEY
          },
          body: JSON.stringify({
            number: remoteJid.replace(/\D/g, ''),
            text: text,
            delay: 1000
          })
        });

        if (evoFetch.ok) {
          evolutionRes = await evoFetch.json();
          evoMsgId = evolutionRes?.key?.id || evoMsgId;
        }
      } catch (evoErr) {
        console.warn('[Evolution API Warning] Offline:', evoErr.message);
      }

      const { data: savedMsg, error: msgErr } = await supabaseAdmin
        .from('messages')
        .insert({
          conversation_id: conversationId,
          whatsapp_message_id: evoMsgId,
          from_me: true,
          sender_name: req.body?.senderName || 'Recepção CMIP',
          message_type: messageType,
          content: text || '',
          media_url: mediaUrl || null,
          status: 'sent'
        })
        .select()
        .single();

      if (msgErr) throw msgErr;

      await supabaseAdmin
        .from('conversations')
        .update({
          last_message_text: text || '[Mídia]',
          last_message_at: new Date().toISOString(),
          bot_active: false
        })
        .eq('id', conversationId);

      return res.status(200).json({ success: true, message: savedMsg, evolution: evolutionRes });
    }

    // A.2) TOGGLE DO ROBÔ DE IA
    if (action === 'toggle-bot') {
      const { conversationId, botActive } = req.body || {};
      const { data: updated, error } = await supabaseAdmin
        .from('conversations')
        .update({ bot_active: Boolean(botActive) })
        .eq('id', conversationId)
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json({ success: true, conversation: updated });
    }

    // A.3) CRIAR AGENDAMENTO
    if (action === 'create-appointment') {
      const {
        patientId,
        name,
        phone,
        professionalId,
        doctorName,
        service = 'Consulta de Rotina',
        appointmentDate,
        appointmentTime,
        durationMinutes = 30,
        roomNumber = '1',
        insuranceType = 'PARTICULAR',
        price = 0,
        notes
      } = req.body || {};

      if (!appointmentDate || !appointmentTime || (!phone && !patientId)) {
        return res.status(400).json({ success: false, error: 'Data, hora e contato sao obrigatorios' });
      }

      const { data: newAppt, error } = await supabaseAdmin
        .from('appointments')
        .insert({
          patient_id: patientId || null,
          name: name || '',
          phone: phone || '',
          professional_id: professionalId || null,
          doctor_name: doctorName || '',
          service,
          appointment_date: appointmentDate,
          appointment_time: appointmentTime,
          duration_minutes: durationMinutes,
          room_number: String(roomNumber),
          status: 'AGENDADO',
          insurance_type: insuranceType,
          price: Number(price || 0),
          notes: notes || ''
        })
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json({ success: true, appointment: newAppt });
    }

    // A.4) ATUALIZAR STATUS DO AGENDAMENTO (CHECKIN / CHAMADA / FINALIZAÇÃO)
    if (action === 'update-appointment-status') {
      const { appointmentId, status, targetTv = '1', roomNumber = '1', doctorName } = req.body || {};

      if (!appointmentId || !status) {
        return res.status(400).json({ success: false, error: 'appointmentId e status sao obrigatorios' });
      }

      const { data: updatedAppt, error: apptErr } = await supabaseAdmin
        .from('appointments')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', appointmentId)
        .select('*, patient:patient_id(*)')
        .single();

      if (apptErr) throw apptErr;

      let callRecord = null;

      if (status === 'CHAMADO') {
        const patName = updatedAppt.patient?.full_name || updatedAppt.name || 'Paciente';
        const docName = updatedAppt.doctor_name || doctorName || 'Médico de Plantão';
        const roomName = `Consultório ${roomNumber}`;

        const { data: callSaved, error: callErr } = await supabaseAdmin
          .from('patient_calls')
          .insert({
            call_id: Date.now() % 100000,
            patient_id: updatedAppt.patient_id,
            patient_name: patName,
            doctor_id: updatedAppt.professional_id,
            doctor_name: docName,
            office_name: roomName,
            target_tv: targetTv,
            status: 'called',
            called_at: new Date().toISOString()
          })
          .select()
          .single();

        if (!callErr && callSaved) {
          callRecord = callSaved;
        }
      }

      return res.status(200).json({ success: true, appointment: updatedAppt, callRecord });
    }

    // A.5) SALVAR PRONTUÁRIO ELETRÔNICO (PEP)
    if (action === 'save-medical-record') {
      const {
        appointmentId,
        patientId,
        professionalId,
        specialty = 'Medicina',
        isConfidential = false,
        cid10Code,
        clinicalNotes,
        specialtyData = {}
      } = req.body || {};

      if (!patientId || !professionalId || !clinicalNotes) {
        return res.status(400).json({ success: false, error: 'patientId, professionalId e clinicalNotes sao obrigatorios' });
      }

      const { data: savedRecord, error } = await supabaseAdmin
        .from('medical_records')
        .insert({
          appointment_id: appointmentId || null,
          patient_id: Number(patientId),
          professional_id: Number(professionalId),
          specialty,
          is_confidential: Boolean(isConfidential),
          cid10_code: cid10Code || '',
          clinical_notes: clinicalNotes,
          specialty_data: specialtyData
        })
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json({ success: true, record: savedRecord });
    }

    // A.6) REGISTRAR TRANSAÇÃO FINANCEIRA COM SPLIT
    if (action === 'save-financial-transaction') {
      const { appointmentId, professionalId, grossAmount, gatewayFee = 0, suppliesCost = 0, rule } = req.body || {};

      const splitResult = calculateFinancialSplit({
        grossAmount,
        gatewayFee,
        suppliesCost,
        rule
      });

      const { data: tx, error } = await supabaseAdmin
        .from('financial_transactions')
        .insert({
          appointment_id: appointmentId || null,
          professional_id: Number(professionalId),
          gross_amount: Number(splitResult.grossAmount),
          gateway_fee: Number(splitResult.gatewayFee),
          supplies_cost: Number(splitResult.suppliesCost),
          clinic_net: Number(splitResult.clinicNet),
          professional_net: Number(splitResult.professionalNet),
          split_snapshot: splitResult.splitSnapshot,
          payment_status: 'PAGO',
          paid_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json({ success: true, transaction: tx, splitResult });
    }

    if (action === 'call-patient') {
        const authUser = extractAuthUser(req);
        if (!authUser) return res.status(401).json({ success: false, message: 'Autenticação necessária.' });
        if (authUser.role !== 'admin' && authUser.role !== 'doctor') {
          return res.status(403).json({ success: false, message: 'Acesso negado. Ação restrita a Médicos e Administradores.' });
        }

        const { callId, doctorId } = (payload && Object.keys(payload).length > 0 ? payload : req.body) || {};

        // Se for médico, valida se não está chamando paciente de outro médico
        if (authUser.role === 'doctor' && authUser.doctorId && doctorId && Number(doctorId) !== Number(authUser.doctorId)) {
          return res.status(403).json({ success: false, message: 'Acesso negado. Você só pode chamar pacientes da sua própria fila.' });
        }

        const nowIso = new Date().toISOString();

        const { data: updated, error } = await supabaseAdmin
          .from('patient_calls')
          .update({ status: 'called', called_at: nowIso })
          .eq('id', callId)
          .select();

        if (error) throw error;

        const ticket = updated && updated[0] ? {
          id: updated[0].id,
          callId: updated[0].call_id || updated[0].id,
          patientName: updated[0].patient_name,
          doctorName: updated[0].doctor_name,
          officeName: updated[0].office_name,
          targetTv: updated[0].target_tv || '1',
          type: updated[0].type,
          status: 'called',
          timestamp: formatBrasiliaTime(),
          isRepeat: false
        } : null;

        if (ticket && req.io) {
          req.io.emit('patient-called', ticket);
          req.io.emit('ticket-called', ticket);
        }

        return res.status(200).json({
          success: true,
          message: 'Chamada enviada para a TV correspondente.',
          ticket
        });
      }

      // G) MÉDICO RECHAMA PACIENTE NA TV
      if (action === 'repeat-patient' || action === 'repeat-call') {
        const authUser = extractAuthUser(req);
        if (!authUser) return res.status(401).json({ success: false, message: 'Autenticação necessária.' });
        if (authUser.role !== 'admin' && authUser.role !== 'doctor') {
          return res.status(403).json({ success: false, message: 'Acesso negado. Ação restrita a Médicos e Administradores.' });
        }

        const { callId } = (payload && Object.keys(payload).length > 0 ? payload : req.body) || {};
        const nowIso = new Date().toISOString();

        const { data: updated, error } = await supabaseAdmin
          .from('patient_calls')
          .update({ called_at: nowIso, status: 'called' })
          .eq('id', callId)
          .select();

        if (error) throw error;

        const ticket = updated && updated[0] ? {
          id: updated[0].id,
          callId: updated[0].call_id || updated[0].id,
          patientName: updated[0].patient_name,
          doctorName: updated[0].doctor_name,
          officeName: updated[0].office_name,
          targetTv: updated[0].target_tv || '1',
          type: updated[0].type,
          status: 'called',
          timestamp: formatBrasiliaTime(),
          isRepeat: true
        } : null;

        if (ticket && req.io) {
          req.io.emit('patient-called', ticket);
          req.io.emit('ticket-called', ticket);
        }

        return res.status(200).json({
          success: true,
          message: 'Rechamada enviada para a TV.',
          ticket
        });
      }

      // H) ATUALIZAR STATUS DO ATENDIMENTO
      if (action === 'update-status') {
        const authUser = extractAuthUser(req);
        if (!authUser) return res.status(401).json({ success: false, message: 'Autenticação necessária.' });
        if (authUser.role !== 'admin' && authUser.role !== 'doctor') {
          return res.status(403).json({ success: false, message: 'Acesso negado.' });
        }

        const { callId, status } = (payload && Object.keys(payload).length > 0 ? payload : req.body) || {};
        const updateData = { status };
        if (status === 'completed') {
          updateData.finished_at = new Date().toISOString();
        }

        const { data: updated, error } = await supabaseAdmin
          .from('patient_calls')
          .update(updateData)
          .eq('id', callId)
          .select();

        if (error) throw error;
        return res.status(200).json({
          success: true,
          message: `Status atualizado para ${status}`,
          call: updated?.[0]
        });
      }

      // I) ADMIN: ZERAR TODAS AS FILAS
      if (action === 'reset-all') {
        const authUser = extractAuthUser(req);
        if (!authUser) return res.status(401).json({ success: false, message: 'Autenticação necessária.' });
        if (authUser.role !== 'admin') return res.status(403).json({ success: false, message: 'Acesso negado. Ação restrita a Administradores.' });

        await supabaseAdmin.from('patient_calls').delete().gt('id', 0);
        await supabaseAdmin.from('tickets').delete().gt('id', 0);

        return res.status(200).json({
          success: true,
          message: 'Todas as filas e atendimentos foram resetados com sucesso.'
        });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[API Medical Error]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
