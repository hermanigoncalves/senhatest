-- Desativa TODOS os médicos atuais e cria um único login "medico", usado em todos os consultórios.
-- MANUAL: rodar inteiro no SQL Editor de produção (echypqclxnztvjicnkbf), DEPOIS da migration
-- 20261104120000_doctor_multi_office_sessions.sql (sem ela, o mesmo login só abre um consultório por vez).
--
-- O passo 1 é UM bloco só: ou roda inteiro, ou nada muda (o SQL Editor executa cada comando separado,
-- então begin/commit e tabelas temporárias não servem aqui).
-- Médicos não são apagados: patient_calls (histórico de atendimentos) depende deles. Ficam desativados e
-- com login bloqueado; cópia em private.backup_medicos_20261104. Reativar: Admin, ou active=true e
-- banned_until=null.
--
-- A senha padrão é gerada pelo script e aparece UMA vez no resultado do passo 2 (anote!). Ela é fixa:
-- must_change_password=false, então o "medico" nunca vê a tela de troca de senha (a única do sistema).
-- Para mudar depois: Admin → redefinir senha do usuário "medico".

-- 1) Desativa os médicos atuais e cria o "medico"
do $$
declare
  uid uuid := gen_random_uuid();
  v_email text := 'medico@cmip.com.br';  -- interno (o Supabase exige e-mail); ninguém digita
  v_senha text := 'medico' || lpad((floor(random() * 10000))::int::text, 4, '0');
  antigos_perfis uuid[];
  antigos_medicos uuid[];
begin
  if exists (select 1 from public.profiles p join public.doctors d on d.profile_id = p.id
             where p.username = 'medico' and p.role = 'doctor' and p.active and d.active) then
    raise exception 'O login "medico" já existe e está ativo: nada a fazer';
  end if;

  create table if not exists private.backup_medicos_20261104 as
  select p.*, d.id as doctor_id, d.crm, d.specialty, d.active as doctor_active, now() as backup_at
  from public.profiles p join public.doctors d on d.profile_id = p.id
  where p.role = 'doctor';

  select array_agg(p.id), array_agg(d.id) into antigos_perfis, antigos_medicos
  from public.profiles p join public.doctors d on d.profile_id = p.id
  where p.role = 'doctor';

  update public.doctor_sessions set status = 'finished', finished_at = coalesce(finished_at, now())
  where status = 'active' and doctor_id = any(antigos_medicos);
  update public.doctors set active = false where id = any(antigos_medicos);
  update public.profiles set active = false where id = any(antigos_perfis);
  update auth.users set banned_until = 'infinity' where id = any(antigos_perfis);
  -- Libera o login "medico" se um médico antigo o usava.
  update public.profiles set username = null where username = 'medico' and id = any(antigos_perfis);

  if exists (select 1 from public.profiles where username = 'medico') then
    raise exception 'Outro usuário (não médico) já usa o login "medico": renomeie-o antes';
  end if;
  if exists (select 1 from auth.users where email = v_email) then
    raise exception 'O e-mail % já está em uso: troque v_email no script', v_email;
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
  values (uid, 'Médico', 'Médico', 'medico', 'doctor', true, false, now())
  on conflict (id) do update
    set full_name = excluded.full_name, display_name = excluded.display_name, username = excluded.username,
        role = excluded.role, active = true, must_change_password = false, updated_at = now();

  insert into public.doctors (profile_id, active)
  select uid, true where not exists (select 1 from public.doctors where profile_id = uid);

  -- Guarda a senha só até o passo 2 mostrar e apagar (schema private, fora da API).
  create table if not exists private.senha_medico_tmp (senha text);
  delete from private.senha_medico_tmp;
  insert into private.senha_medico_tmp values (v_senha);
end $$;

-- 2) Mostra usuário e senha UMA vez e apaga a senha guardada
delete from private.senha_medico_tmp
returning 'medico' as usuario, senha;
