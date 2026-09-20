import { supabase } from './supabaseClient';
import { PROFILE_COLUMNS } from './profile';
const rpc = async (name, args = {}) => { const { data, error } = await supabase.rpc(name, args); if (error) throw error; return data; };
export const cmipApi = {
  signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }), signOut: () => supabase.auth.signOut(), signOutDoctor: async () => { try { await rpc('end_doctor_session'); } finally { return supabase.auth.signOut(); } },
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
  enqueue: (patientId, doctorId) => rpc('enqueue_patient', { p_patient_id: patientId, p_doctor_id: doctorId }), transfer: (queueId, doctorId, reason) => rpc('transfer_patient', { p_queue_id: queueId, p_new_doctor_id: doctorId, p_reason: reason || null }),
  receptionQueue: async () => (await supabase.from('reception_queue_view').select('*').order('created_at', { ascending: false }).limit(100)).data || [],
  offices: () => rpc('available_offices'), doctorHeartbeat: () => rpc('doctor_heartbeat'), myDoctorSession: async () => { const rows = await rpc('get_my_doctor_session'); return rows?.[0] || null; }, startSession: (officeId) => rpc('start_doctor_session', { p_office_id: officeId }), endSession: () => rpc('end_doctor_session'),
  doctorQueue: async () => (await supabase.from('doctor_queue_view').select('*').order('created_at')).data || [], queueAction: (queueId, action) => rpc('doctor_queue_action', { p_queue_id: queueId, p_action: action }),
  panelState: (slug) => rpc('get_display_state', { p_panel_slug: slug }),
  activeDisplayPanels: () => rpc('list_active_display_panels'),
  ticketCounterState: (id) => rpc('get_ticket_counter_state', { p_service_point_id: id }),
  completeFirstPasswordChange: () => rpc('complete_first_password_change'),
  updateOwnPassword: (password) => supabase.auth.updateUser({ password }),
  adminListUsers: () => rpc('admin_list_users'),
  adminUpdateUser: (id, changes = {}) => rpc('admin_update_user', { p_user_id: id, p_full_name: changes.full_name ?? null, p_role: changes.role ?? null, p_active: changes.active ?? null }),
  masterDashboard: () => rpc('master_dashboard'),
  masterResources: () => rpc('master_list_resources'),
  masterSaveOffice: (x) => rpc('master_save_office', { p_id:x.id||null,p_name:x.name,p_code:x.code||null,p_active:x.active!==false }),
  masterSaveServicePoint: (x) => rpc('master_save_service_point', { p_id:x.id||null,p_name:x.name,p_code:x.code,p_active:x.active!==false }),
  masterSaveDisplay: (x) => rpc('master_save_display', { p_id:x.id||null,p_name:x.name,p_code:x.code,p_description:x.description||null,p_active:x.active!==false,p_office_ids:x.office_ids||[],p_service_point_ids:x.service_point_ids||[] }),
  masterUpdateDoctor: (x) => rpc('master_update_doctor', { p_profile_id:x.profile_id,p_crm:x.crm||null,p_specialty:x.specialty||null,p_active:x.active!==false }),
  masterUserAdmin: async (payload) => { const { data, error } = await supabase.functions.invoke('master-user-admin',{body:payload}); if(error) throw error; if(data?.error) throw new Error(data.error); return data; },
  subscribe: (name, tables, refresh) => { const channel = supabase.channel(name); tables.forEach((table) => channel.on('postgres_changes', { event: '*', schema: 'public', table }, refresh)); channel.subscribe((status) => { if (status === 'SUBSCRIBED') refresh(); if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setTimeout(refresh, 750); }); return () => supabase.removeChannel(channel); },
  subscribeDisplay: (slug, refresh, statusCb=()=>{}) => { const channel=supabase.channel(`display-${slug}`).on('postgres_changes',{event:'UPDATE',schema:'public',table:'display_panels',filter:`code=eq.${slug}`},()=>refresh()); channel.subscribe((status)=>{statusCb(status==='SUBSCRIBED');if(status==='SUBSCRIBED')refresh();if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED')setTimeout(()=>refresh(),750)}); return ()=>supabase.removeChannel(channel); },
};
