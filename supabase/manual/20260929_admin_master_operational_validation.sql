-- READ-ONLY VALIDATION - run manually only in CMIPtst.
-- Expected project ref: echypqclxnztvjicnkbf.
-- This file does not mutate schema or data.

select current_database() as database_name, current_user as connected_as;

select n.nspname as schema_name,
       p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer,
       p.proconfig as function_settings
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where (n.nspname = 'public' and p.proname in (
  'admin_list_delegable_doctors', 'admin_enqueue_patient',
  'admin_available_offices', 'admin_get_doctor_session',
  'admin_start_doctor_session', 'admin_end_doctor_session',
  'admin_doctor_heartbeat', 'admin_get_doctor_queue',
  'admin_doctor_queue_action'
)) or (n.nspname = 'private' and p.proname in (
  'is_operational_superuser', 'assert_operational_superuser',
  'assert_active_delegated_doctor'
))
order by n.nspname, p.proname, arguments;

select routine_schema, routine_name, grantee, privilege_type
from information_schema.routine_privileges
where routine_schema in ('public', 'private')
  and (routine_name like 'admin_%' or routine_name in (
    'is_operational_superuser', 'assert_operational_superuser',
    'assert_active_delegated_doctor'
  ))
order by routine_schema, routine_name, grantee;

select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'delegated_medical_audit', 'doctors', 'offices', 'doctor_sessions',
    'patients', 'service_points', 'ticket_calls', 'medical_queue',
    'queue_history', 'display_panels', 'display_panel_offices',
    'display_panel_service_points', 'patient_calls', 'patient_call_displays'
  )
order by tablename;

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and policyname in (
    'cmip_operational_superusers_select',
    'delegated_medical_audit_superuser_select'
  )
order by tablename, policyname;

select event_object_schema, event_object_table, privilege_type, grantee
from information_schema.role_table_grants
where event_object_schema = 'public'
  and event_object_table = 'delegated_medical_audit'
order by grantee, privilege_type;

