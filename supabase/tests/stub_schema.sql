-- Schema MÍNIMO só para testar as migrations de revisão em um Postgres descartável. NÃO representa o banco real.
do $$ begin if not exists (select 1 from pg_roles where rolname=$q$anon$q$) then create role anon nologin; create role authenticated nologin; end if; end $$;
create schema private; create schema auth;
create function auth.uid() returns uuid language sql as $$ select '00000000-0000-0000-0000-000000000001'::uuid $$;
create table public.profiles(id uuid primary key, role text, active bool, must_change_password bool);
create table public.doctors(id uuid primary key default gen_random_uuid(), profile_id uuid, active bool default true);
create table public.offices(id uuid primary key default gen_random_uuid(), name text, active bool default true);
create table public.patients(id uuid primary key default gen_random_uuid(), full_name text);
create table public.doctor_sessions(id uuid primary key default gen_random_uuid(), doctor_id uuid, office_id uuid, status text, started_at timestamptz default now(), last_seen_at timestamptz);
create table public.medical_queue(id uuid primary key default gen_random_uuid(), patient_id uuid, doctor_id uuid, status text, created_at timestamptz default now());
create table public.patient_calls(id uuid primary key default gen_random_uuid(), queue_id uuid, doctor_session_id uuid, call_kind text, called_at timestamptz default now(), called_by uuid);
create function private.is_operational_superuser() returns bool language sql as $$ select true $$;
create function private.assert_active_delegated_doctor(uuid) returns void language sql as $$ select $$;
create function public.list_active_display_panels() returns jsonb language sql as $$ select '[]'::jsonb $$;
create function public.get_display_state(p text) returns jsonb language sql as $$ select jsonb_build_object(
 'panel', jsonb_build_object('code',p,'name','TV Teste','secret_cfg','x'),
 'current', jsonb_build_object('event_key','m123','id','abc','kind','medical','patient_name','Maria Aparecida Souza','destination','Consultório 1','at','2026-10-08T10:00:00Z','patient_cpf','12345678900','doctor_id','d1'),
 'history', jsonb_build_array(
   jsonb_build_object('event_key','t9','kind','ticket','display_number','0045','destination','Guichê 1','at','2026-10-08T09:59:00Z','phone','999'),
   jsonb_build_object('event_key','m122','kind','medical','patient_name','João','destination','Consultório 2','cpf','000'),
   to_jsonb('lixo'::text))) $$;
-- migration 0930: trigger original (sem trava)
create function private.guard_patient_call_insert() returns trigger language plpgsql set search_path='' as $f$
declare queue_status text;
begin
  select q.status::text into queue_status from public.medical_queue q where q.id=new.queue_id;
  if new.call_kind='call' and queue_status<>'waiting' then raise exception 'Chamada inicial permitida somente para paciente aguardando'; end if;
  if exists (select 1 from public.patient_calls pc where pc.queue_id=new.queue_id and pc.call_kind=new.call_kind and pc.called_at>=now()-interval '2 seconds') then raise exception 'Chamada duplicada bloqueada'; end if;
  return new; end $f$;
create trigger trg_patient_calls_guard before insert on public.patient_calls for each row execute function private.guard_patient_call_insert();
