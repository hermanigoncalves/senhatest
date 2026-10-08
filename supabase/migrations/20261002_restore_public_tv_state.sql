-- Nota: private.mask_public_patient_name e public.get_public_display_state também são definidas em
-- 20260930_v1_runtime_hardening.sql. A repetição é intencional (reinstala o estado público no CMIPtst) e idempotente;
-- a versão final da get_public_display_state está em 20261008120000_v1_review_fixes.sql.

-- Restaura o estado público sanitizado das TVs no CMIPtst.
-- Mantém get_display_state autenticado e expõe somente dados mínimos para anon.

begin;

create or replace function private.mask_public_patient_name(p_name text)
returns text
language plpgsql
immutable
set search_path=''
as $$
declare
  parts text[];
begin
  if p_name is null or btrim(p_name) = '' then
    return 'Paciente';
  end if;
  parts := regexp_split_to_array(btrim(p_name), '\s+');
  if coalesce(array_length(parts,1),0) <= 1 then
    return parts[1];
  end if;
  return parts[1] || ' ' || upper(left(parts[array_length(parts,1)],1)) || '.';
end
$$;

create or replace function public.get_public_display_state(p_panel_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  state jsonb;
  current_event jsonb;
  history_events jsonb;
begin
  state := public.get_display_state(p_panel_slug);
  if state is null then
    return null;
  end if;

  current_event := state->'current';
  if current_event is not null and current_event->>'kind' = 'medical' then
    current_event := jsonb_set(
      current_event,
      '{patient_name}',
      to_jsonb(private.mask_public_patient_name(current_event->>'patient_name')),
      true
    );
  end if;

  select coalesce(
    jsonb_agg(
      case
        when item->>'kind' = 'medical' then jsonb_set(
          item,
          '{patient_name}',
          to_jsonb(private.mask_public_patient_name(item->>'patient_name')),
          true
        )
        else item
      end
    ),
    '[]'::jsonb
  )
  into history_events
  from jsonb_array_elements(coalesce(state->'history','[]'::jsonb)) item;

  return jsonb_set(
    jsonb_set(state,'{current}',coalesce(current_event,'null'::jsonb),true),
    '{history}',history_events,true
  );
end
$$;

revoke all on function public.get_public_display_state(text) from public,anon,authenticated;
grant execute on function public.get_public_display_state(text) to anon,authenticated;

revoke execute on function public.get_display_state(text) from anon;
grant execute on function public.get_display_state(text) to authenticated;

grant execute on function public.list_active_display_panels() to anon,authenticated;

commit;
