import { supabase } from './supabaseClient.js';
import { PROFILE_COLUMNS } from './profile.js';
import { parseLoginIdentifier } from './identity.js';
const rpc = async (name, args = {}) => { const { data, error } = await supabase.rpc(name, args); if (error) throw error; return data; };
export const cmipApi = {
  signIn: async (identifier, password) => {
    const parsed = parseLoginIdentifier(identifier);
    if (parsed.kind === 'email') return supabase.auth.signInWithPassword({ email: parsed.email, password });
    if (parsed.kind === 'username') {
      const { data, error, response } = await supabase.functions.invoke('username-login', {
        body: { username: parsed.username, password },
      });
      if (error) {
        const status = error.context?.status || response?.status;
        if (status === 401) throw new Error('Usuário ou senha inválidos.');
        if (status === 403) throw new Error('Acesso negado.');
        if (status === 500) throw new Error('Não foi possível autenticar no momento.');
        if (error.name === 'FunctionsFetchError') throw new Error('Falha na conexão de rede. Verifique seu acesso e tente novamente.');
        throw new Error('Não foi possível autenticar no momento.');
      }
      if (!data?.success || !data?.session?.access_token || !data?.session?.refresh_token) {
        if (data?.error) throw new Error('Usuário ou senha inválidos.');
        throw new Error('Não foi possível autenticar no momento.');
      }
      const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
      if (sessionError) throw new Error('Não foi possível autenticar no momento.');
      return { data: sessionData, error: null };
    }
    throw new Error('Informe um usuário válido.');
  }, signOut: () => supabase.auth.signOut(), signOutDoctor: async () => { try { await rpc('end_doctor_session'); } finally { return supabase.auth.signOut(); } },
  profile: async () => {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!user) return null;
    const { data, error } = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', user.id).maybeSingle();
    if (error) throw error;
    return data;
  },
  servicePoints: async () => (await supabase.from('service_points').select('*').eq('active', true).order('name')).data || [],
  callNextTicket: (id) => rpc('call_next_ticket', { p_service_point_id: id }), recallTicket: (id) => rpc('recall_ticket', { p_service_point_id: id }),
  callSpecificTicket: (id, n) => rpc('call_specific_ticket', { p_service_point_id: id, p_number: Number(n) }), setNextTicket: (id, n) => rpc('set_next_ticket', { p_service_point_id: id, p_number: Number(n) }),
  searchPatients: (term = '') => rpc('search_patients', { p_term: term }), savePatient: (patient) => rpc('save_patient', { p_patient: patient }),
  availableDoctors: () => rpc('list_available_doctors'),
  enqueue: (patientId, doctorId, delegated = false) => rpc(delegated ? 'admin_enqueue_patient' : 'enqueue_patient', { p_patient_id: patientId, p_doctor_id: doctorId }), transfer: (queueId, doctorId, reason) => rpc('transfer_patient', { p_queue_id: queueId, p_new_doctor_id: doctorId, p_reason: reason || null }),
  receptionQueue: async () => (await supabase.from('reception_queue_view').select('*').order('created_at', { ascending: false }).limit(100)).data || [],
  offices: () => rpc('available_offices'), doctorHeartbeat: () => rpc('doctor_heartbeat'), myDoctorSession: async () => { const rows = await rpc('get_my_doctor_session'); return rows?.[0] || null; }, startSession: (officeId) => rpc('start_doctor_session', { p_office_id: officeId }), endSession: () => rpc('end_doctor_session'),
  doctorQueue: async () => (await supabase.from('doctor_queue_view').select('*').order('created_at')).data || [], queueAction: (queueId, action) => rpc('doctor_queue_action', { p_queue_id: queueId, p_action: action }),
  delegatedDoctors: () => rpc('admin_list_delegable_doctors'),
  delegatedOffices: (doctorId) => rpc('admin_available_offices', { p_doctor_id: doctorId }),
  delegatedDoctorHeartbeat: (doctorId) => rpc('admin_doctor_heartbeat', { p_doctor_id: doctorId }),
  delegatedDoctorSession: async (doctorId) => { const rows = await rpc('admin_get_doctor_session', { p_doctor_id: doctorId }); return rows?.[0] || null; },
  startDelegatedDoctorSession: (doctorId, officeId) => rpc('admin_start_doctor_session', { p_doctor_id: doctorId, p_office_id: officeId }),
  endDelegatedDoctorSession: (doctorId) => rpc('admin_end_doctor_session', { p_doctor_id: doctorId }),
  delegatedDoctorQueue: (doctorId) => rpc('admin_get_doctor_queue', { p_doctor_id: doctorId }),
  delegatedDoctorQueueAction: (doctorId, queueId, action) => rpc('admin_doctor_queue_action', { p_doctor_id: doctorId, p_queue_id: queueId, p_action: action }),
  latestMedicalCallEvent: (queueId) => rpc('get_latest_medical_call_event', { p_queue_id: queueId }),
  panelState: (slug) => rpc('get_display_state', { p_panel_slug: slug }),
  activeDisplayPanels: () => rpc('list_active_display_panels'),
  publicPanelState: (slug) => rpc('get_public_display_state', { p_panel_slug: slug }),
  ticketCounterState: (id) => rpc('get_ticket_counter_state', { p_service_point_id: id }),
  completeFirstPasswordChange: () => rpc('complete_first_password_change'),
  updateOwnPassword: (password) => supabase.auth.updateUser({ password }),
  adminListUsers: () => rpc('admin_list_users'),
  adminUpdateUser: (id, changes = {}) => rpc('admin_update_user', { p_user_id: id, p_full_name: changes.full_name ?? null, p_role: changes.role ?? null, p_active: changes.active ?? null }),
  requestAdminPasswordReset: async (userId) => {
    const { data, error, response } = await supabase.functions.invoke('master-user-admin', {
      body: { action: 'reset_password', user_id: userId, temporary_password: 'CMIP123456' },
    });
    if (error) {
      const status = error.context?.status || response?.status;
      if (status === 401) throw new Error('Sua sessão expirou. Entre novamente.');
      if (status === 403) throw new Error('Você não tem permissão para redefinir a senha deste usuário.');
      if (status === 404) throw new Error('Usuário não encontrado.');
      if (status === 500) throw new Error('Não foi possível redefinir a senha.');
      if (error.name === 'FunctionsFetchError') throw new Error('Falha na conexão de rede. Verifique seu acesso e tente novamente.');
      throw new Error('Não foi possível redefinir a senha.');
    }
    if (data?.error) throw new Error(data.error);
    return data;
  },
  masterDashboard: () => rpc('master_dashboard'),
  masterResources: () => rpc('master_list_resources'),
  masterSaveOffice: (x) => rpc('master_save_office', { p_id:x.id||null,p_name:x.name,p_code:x.code||null,p_active:x.active!==false }),
  masterSaveServicePoint: (x) => rpc('master_save_service_point', { p_id:x.id||null,p_name:x.name,p_code:x.code,p_active:x.active!==false }),
  masterSaveDisplay: (x) => rpc('master_save_display', { p_id:x.id||null,p_name:x.name,p_code:x.code,p_description:x.description||null,p_active:x.active!==false,p_office_ids:x.office_ids||[],p_service_point_ids:x.service_point_ids||[] }),
  masterUpdateDoctor: (x) => rpc('master_update_doctor', { p_profile_id:x.profile_id,p_crm:x.crm||null,p_specialty:x.specialty||null,p_active:x.active!==false }),
  masterUserAdmin: async (payload) => { const { data, error } = await supabase.functions.invoke('master-user-admin',{body:payload}); if(error) throw error; if(data?.error) throw new Error(data.error); return data; },
  subscribe: (name, tables, refresh) => { const channel = supabase.channel(name); tables.forEach((table) => channel.on('postgres_changes', { event: '*', schema: 'public', table }, refresh)); channel.subscribe((status) => { if (status === 'SUBSCRIBED') refresh(); if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setTimeout(refresh, 750); }); return () => supabase.removeChannel(channel); },
  _broadcastChannels: new Map(),
  getReadyBroadcastChannel: async (slug) => {
    if (!slug) return null;
    let entry = cmipApi._broadcastChannels.get(slug);
    if (!entry) {
      const channel = supabase.channel(`display-${slug}`);
      let resolveReady;
      const readyPromise = new Promise((resolve) => {
        resolveReady = resolve;
      });
      entry = { channel, status: 'CONNECTING', promise: readyPromise };
      cmipApi._broadcastChannels.set(slug, entry);

      channel.subscribe((status) => {
        entry.status = status;
        if (status === 'SUBSCRIBED') {
          resolveReady(true);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          resolveReady(false);
        }
      });
    }

    if (entry.status === 'SUBSCRIBED') {
      return entry.channel;
    }

    try {
      // Aguarda no máximo 100ms caso o canal esteja terminando de conectar, sem travar o chamador
      await Promise.race([
        entry.promise,
        new Promise((resolve) => setTimeout(() => resolve(false), 100))
      ]);
    } catch {}

    return entry.channel;
  },
  broadcastCall: async (targetSlug, payload) => {
    try {
      const channel = await cmipApi.getReadyBroadcastChannel(targetSlug);
      if (!channel) return false;
      const result = await channel.send({
        type: 'broadcast',
        event: 'ticket-called',
        payload
      });
      return result === 'ok';
    } catch (err) {
      console.warn('[Broadcast Error]', err);
      return false;
    }
  },
  cleanupBroadcastChannels: () => {
    for (const [slug, entry] of cmipApi._broadcastChannels.entries()) {
      try {
        if (entry.channel) {
          supabase.removeChannel(entry.channel);
        }
      } catch (err) {
        console.warn('[Cleanup Broadcast Error]', err);
      }
    }
    cmipApi._broadcastChannels.clear();
  },
  panelsForOffice: async (officeId) => {
    if (!officeId) return [];
    try {
      const { data, error } = await supabase
        .from('display_panel_offices')
        .select('display_panel_id, display_panels!inner(code, active)')
        .eq('office_id', officeId)
        .eq('display_panels.active', true);
      if (error) {
        console.warn('[cmipApi] panelsForOffice query error:', error);
        return [];
      }
      return (data || []).map((r) => r.display_panels?.code).filter(Boolean);
    } catch (err) {
      console.warn('[cmipApi] panelsForOffice exception:', err);
      return [];
    }
  },
  panelsForServicePoint: async (servicePointId) => {
    if (!servicePointId) return [];
    try {
      const { data, error } = await supabase
        .from('display_panel_service_points')
        .select('display_panel_id, display_panels!inner(code, active)')
        .eq('service_point_id', servicePointId)
        .eq('display_panels.active', true);
      if (error) {
        console.warn('[cmipApi] panelsForServicePoint query error:', error);
        return [];
      }
      return (data || []).map((r) => r.display_panels?.code).filter(Boolean);
    } catch (err) {
      console.warn('[cmipApi] panelsForServicePoint exception:', err);
      return [];
    }
  },
  subscribeDisplay: (slug, refreshOrOptions, statusCb = () => {}) => {
    const isOptions = typeof refreshOrOptions === 'object' && refreshOrOptions !== null;
    const onRefresh = isOptions ? refreshOrOptions.onRefresh : refreshOrOptions;
    const onBroadcast = isOptions ? refreshOrOptions.onBroadcast : null;
    const onStatus = isOptions ? (refreshOrOptions.onStatus || statusCb) : statusCb;

    const channel = supabase.channel(`display-${slug}`)
      .on('broadcast', { event: 'ticket-called' }, ({ payload }) => {
        if (onBroadcast && payload) onBroadcast(payload);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table:'display_panels', filter: `code=eq.${slug}` }, () => {
        if (onRefresh) onRefresh();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table:'ticket_calls' }, () => {
        if (onRefresh) onRefresh();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table:'patient_calls' }, () => {
        if (onRefresh) onRefresh();
      });

    channel.subscribe((status) => {
      onStatus(status === 'SUBSCRIBED');
      if (status === 'SUBSCRIBED' && onRefresh) onRefresh();
      if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') && onRefresh) {
        setTimeout(() => onRefresh(), 750);
      }
    });

    return () => supabase.removeChannel(channel);
  },
};


