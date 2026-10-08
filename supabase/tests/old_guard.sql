create or replace function private.guard_patient_call_insert() returns trigger language plpgsql set search_path='' as $f$
declare queue_status text;
begin
  select q.status::text into queue_status from public.medical_queue q where q.id=new.queue_id;
  if new.call_kind='call' and queue_status<>'waiting' then raise exception 'Chamada inicial permitida somente para paciente aguardando'; end if;
  if exists (select 1 from public.patient_calls pc where pc.queue_id=new.queue_id and pc.call_kind=new.call_kind and pc.called_at>=now()-interval '2 seconds') then raise exception 'Chamada duplicada bloqueada'; end if;
  return new; end $f$;
