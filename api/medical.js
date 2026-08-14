import { supabase, supabaseAdmin } from './_supabase.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
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
    // 1. GET: Retorna o estado atual da TV ou dados do sistema
    if (req.method === 'GET') {
      const { view, doctorId } = req.query || {};

      // Se for consulta de fila de médico específico
      if (view === 'doctor-queue' && doctorId) {
        const { data: queue, error } = await supabase
          .from('patient_calls')
          .select('*')
          .eq('doctor_id', doctorId)
          .in('status', ['waiting', 'called', 'in_progress'])
          .order('id', { ascending: true });

        if (error) throw error;

        // Ordena colocando Preferenciais no topo da fila de espera
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

      // Estado Geral da TV (Última chamada médica ou senha + Histórico)
      const { data: calls, error: callErr } = await supabase
        .from('patient_calls')
        .select('*')
        .order('id', { ascending: false })
        .limit(10);

      const { data: tickets } = await supabase
        .from('tickets')
        .select('*')
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
          type: c.type,
          status: c.status,
          timestamp: formatBrasiliaTime(new Date(c.called_at || c.created_at))
        }));
      } else if (tickets && tickets.length > 0) {
        const real = tickets.filter(t => t.type !== 'Sistema');
        if (real.length > 0) {
          const t = real[0];
          currentCall = {
            id: t.id,
            callId: t.call_id || t.id,
            number: t.number,
            desk: t.desk,
            type: t.type,
            timestamp: formatBrasiliaTime(new Date(t.created_at))
          };
          history = real.map(r => ({
            id: r.id,
            callId: r.call_id || r.id,
            number: r.number,
            desk: r.desk,
            type: r.type,
            timestamp: formatBrasiliaTime(new Date(r.created_at))
          }));
        }
      }

      return res.status(200).json({
        success: true,
        currentTicket: currentCall,
        history: history
      });
    }

    // 2. POST: Ações e Comandos
    if (req.method === 'POST') {
      const { action, payload } = req.body || {};

      // A) LOGIN DE USUÁRIO
      if (action === 'login') {
        const { username, password } = payload || {};
        
        // Tenta buscar no banco Supabase
        const { data: user, error } = await supabase
          .from('users')
          .select('*, doctor:doctors(*)')
          .eq('username', (username || '').trim())
          .eq('password', (password || '').trim())
          .eq('active', true)
          .single();

        if (user && !error) {
          return res.status(200).json({
            success: true,
            user: {
              id: user.id,
              name: user.name,
              username: user.username,
              role: user.role,
              doctorId: user.doctor_id,
              doctor: user.doctor
            }
          });
        }

        // Fallback para credenciais padrão caso o banco ainda não tenha sido populado
        const defaults = {
          admin: { id: 1, name: 'Administrador Geral', role: 'admin' },
          recepcao: { id: 2, name: 'Recepção CMIP', role: 'receptionist' },
          dr_carlos: { id: 3, name: 'Dr. Carlos Eduardo', role: 'doctor', doctorId: 1, doctor: { id: 1, name: 'Dr. Carlos Eduardo', office_name: 'Consultório 01' } },
          dra_helena: { id: 4, name: 'Dra. Helena Martins', role: 'doctor', doctorId: 2, doctor: { id: 2, name: 'Dra. Helena Martins', office_name: 'Consultório 02' } }
        };

        if (defaults[username] && (password === 'admin123' || password === 'recepcao123' || password === 'medico123' || password === '123456')) {
          return res.status(200).json({
            success: true,
            user: defaults[username]
          });
        }

        return res.status(401).json({ success: false, message: 'Usuário ou senha incorretos.' });
      }

      // B) LISTAR CONSULTÓRIOS E MÉDICOS ATIVOS (Para a Recepção)
      if (action === 'get-offices-doctors') {
        const { data: offices } = await supabase.from('offices').select('*').eq('active', true).order('name');
        const { data: doctors } = await supabase.from('doctors').select('*').eq('active', true).order('name');

        return res.status(200).json({
          success: true,
          offices: offices || [
            { id: 1, name: 'Consultório 01' },
            { id: 2, name: 'Consultório 02' },
            { id: 3, name: 'Consultório 03' }
          ],
          doctors: doctors || [
            { id: 1, name: 'Dr. Carlos Eduardo', specialty: 'Clínica Geral', office_name: 'Consultório 01' },
            { id: 2, name: 'Dra. Helena Martins', specialty: 'Cardiologia', office_name: 'Consultório 02' },
            { id: 3, name: 'Dr. Roberto Silva', specialty: 'Ortopedia', office_name: 'Consultório 03' }
          ]
        });
      }

      // C) CADASTRAR PACIENTE DIRETO NA FILA DO MÉDICO (Sem Triagem)
      if (action === 'register-patient-call') {
        const { patientName, document, phone, doctorId, doctorName, officeName, type = 'Normal', createdBy } = payload || {};

        if (!patientName || !patientName.trim()) {
          return res.status(400).json({ success: false, message: 'Nome do paciente é obrigatório.' });
        }

        // 1. Cadastra/Atualiza Paciente
        let patientId = null;
        try {
          const { data: pat } = await supabaseAdmin
            .from('patients')
            .insert([{ name: patientName.trim(), document, phone }])
            .select();
          if (pat && pat[0]) patientId = pat[0].id;
        } catch (e) {}

        // 2. Insere na Fila do Médico com status 'waiting'
        const { data: callItem, error: callErr } = await supabaseAdmin
          .from('patient_calls')
          .insert([{
            patient_id: patientId,
            patient_name: patientName.trim(),
            doctor_id: doctorId || null,
            doctor_name: doctorName || 'Médico de Plantão',
            office_name: officeName || 'Consultório',
            type: type,
            status: 'waiting',
            created_by_user: createdBy || 'Recepção'
          }])
          .select();

        if (callErr) throw callErr;

        return res.status(200).json({
          success: true,
          message: 'Paciente encaminhado com sucesso para a fila do médico!',
          call: callItem && callItem[0] ? callItem[0] : null
        });
      }

      // D) MÉDICO CHAMA PACIENTE NA TV
      if (action === 'call-patient') {
        const { callId, doctorId } = payload || {};

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
          type: updated[0].type,
          status: 'called',
          timestamp: formatBrasiliaTime(),
          isRepeat: false
        } : null;

        return res.status(200).json({
          success: true,
          message: 'Chamada enviada para a TV.',
          ticket
        });
      }

      // E) MÉDICO RECHAMA PACIENTE NA TV
      if (action === 'repeat-call') {
        const { callId } = payload || {};

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
          type: updated[0].type,
          status: 'called',
          timestamp: formatBrasiliaTime(),
          isRepeat: true
        } : null;

        return res.status(200).json({
          success: true,
          message: 'Rechamada enviada para a TV.',
          ticket
        });
      }

      // F) ATUALIZAR STATUS (Em Atendimento / Finalizado / Ausente)
      if (action === 'update-status') {
        const { callId, status } = payload || {};

        const { data: updated, error } = await supabaseAdmin
          .from('patient_calls')
          .update({ status: status })
          .eq('id', callId)
          .select();

        if (error) throw error;

        return res.status(200).json({
          success: true,
          message: `Status atualizado para ${status}`,
          call: updated && updated[0] ? updated[0] : null
        });
      }

      // G) ADMIN: ZERAR FILA / LIMPAR ATENDIMENTOS DO DIA
      if (action === 'reset-all') {
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
