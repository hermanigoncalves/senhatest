-- Troca TODOS os médicos por um único login "medico", usado em todos os consultórios.
-- MANUAL: rodar inteiro no SQL Editor de produção (echypqclxnztvjicnkbf), DEPOIS da migration
-- 20261104120000_doctor_multi_office_sessions.sql (sem ela, o mesmo login só abre um consultório por vez).
--
-- ANTES DE RODAR: troque o e-mail e a senha temporária no passo 3 (mín. 10 caracteres).
-- No primeiro acesso o sistema obriga a trocar a senha.
--
-- Tudo roda numa transação: se qualquer passo falhar (ex.: um médico ainda ligado a pacientes na fila),
-- NADA é apagado nem criado. Os médicos apagados ficam copiados em private.backup_medicos_20261104
-- (schema não exposto pela API).

begin;

-- 1) Backup dos médicos atuais
create table if not exists private.backup_medicos_20261104 as
select p.*, d.id as doctor_id, d.crm, d.specialty, d.active as doctor_active, now() as backup_at
from public.profiles p
join public.doctors d on d.profile_id = p.id
where p.role = 'doctor';

-- 2) Apaga os médicos atuais (sessões de consultório, cadastro de médico, perfil e login)
create temporary table medicos_antigos on commit drop as
select p.id as profile_id, d.id as doctor_id
from public.profiles p
join public.doctors d on d.profile_id = p.id
where p.role = 'doctor';

delete from public.doctor_sessions where doctor_id in (select doctor_id from medicos_antigos);
delete from public.doctors where id in (select doctor_id from medicos_antigos);
delete from public.profiles where id in (select profile_id from medicos_antigos);
delete from auth.users where id in (select profile_id from medicos_antigos);

-- 3) Cria o login único "medico"
do $$
declare
  uid uuid := gen_random_uuid();
  v_email text := lower('medico@cmip.com.br');   -- TROQUE: e-mail da clínica (só precisa ser único)
  v_senha text := 'TROQUE-ESTA-SENHA';             -- TROQUE: senha temporária, mín. 10 caracteres
begin
  if v_senha = 'TROQUE-ESTA-SENHA' or length(v_senha) < 10 then
    raise exception 'Defina a senha temporária no passo 3 (mín. 10 caracteres)';
  end if;
  if exists (select 1 from public.profiles where username = 'medico') then
    raise exception 'Já existe outro usuário com login "medico" (não é médico): renomeie-o antes';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', v_email,
    extensions.crypt(v_senha, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{"full_name":"Médico","role":"doctor"}', now(), now(),
    '', '', '', ''
  );

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text,
          jsonb_build_object('sub', uid::text, 'email', v_email, 'email_verified', true),
          'email', now(), now(), now());

  -- Um gatilho do Supabase pode já ter criado o perfil: completa em vez de duplicar.
  insert into public.profiles (id, full_name, display_name, username, role, active, must_change_password, updated_at)
  values (uid, 'Médico', 'Médico', 'medico', 'doctor', true, true, now())
  on conflict (id) do update
    set full_name = excluded.full_name, display_name = excluded.display_name, username = excluded.username,
        role = excluded.role, active = true, must_change_password = true, updated_at = now();

  insert into public.doctors (profile_id, active)
  select uid, true
  where not exists (select 1 from public.doctors where profile_id = uid);
end $$;

-- 4) Confere: deve sobrar só o "medico"
select p.full_name, p.username, p.active, d.active as medico_ativo, u.email
from public.profiles p
join public.doctors d on d.profile_id = p.id
join auth.users u on u.id = p.id
where p.role = 'doctor';

commit;
