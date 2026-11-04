-- Conserta o login "medico" que já existe: senha padrão nova (mostrada no resultado), sem troca obrigatória,
-- login desbloqueado; desativa os demais médicos se ainda estiverem ativos.
-- MANUAL: rodar no SQL Editor de produção. O passo 1 é um bloco só: roda inteiro ou nada muda.

-- 1) Conserta
do $$
declare
  m uuid;
  v_email text;
  v_senha text := 'medico' || lpad((floor(random() * 10000))::int::text, 4, '0');
  outros_perfis uuid[];
  outros_medicos uuid[];
begin
  select p.id into m
  from public.profiles p join public.doctors d on d.profile_id = p.id
  where p.username = 'medico' and p.role = 'doctor'
  limit 1;
  if m is null then
    raise exception 'Não existe médico com login "medico": use 20261104_medico_unico.sql';
  end if;
  select email into v_email from auth.users where id = m;

  -- Demais médicos: desativados e com login bloqueado (histórico continua)
  select array_agg(p.id), array_agg(d.id) into outros_perfis, outros_medicos
  from public.profiles p join public.doctors d on d.profile_id = p.id
  where p.role = 'doctor' and p.id <> m;
  update public.doctor_sessions set status = 'finished', finished_at = coalesce(finished_at, now())
  where status = 'active' and doctor_id = any(outros_medicos);
  update public.doctors set active = false where id = any(outros_medicos);
  update public.profiles set active = false where id = any(outros_perfis);
  update auth.users set banned_until = 'infinity' where id = any(outros_perfis);

  -- O "medico": senha padrão, e-mail confirmado, sem bloqueio, sem troca obrigatória
  update auth.users
  set encrypted_password = extensions.crypt(v_senha, extensions.gen_salt('bf')),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      banned_until = null,
      updated_at = now()
  where id = m;
  if not exists (select 1 from auth.identities where user_id = m and provider = 'email') then
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), m, m::text,
            jsonb_build_object('sub', m::text, 'email', v_email, 'email_verified', true),
            'email', now(), now(), now());
  end if;
  update public.profiles set active = true, must_change_password = false, updated_at = now() where id = m;
  update public.doctors set active = true where profile_id = m;

  create table if not exists private.senha_medico_tmp (senha text);
  alter table private.senha_medico_tmp add column if not exists email text;
  delete from private.senha_medico_tmp;
  insert into private.senha_medico_tmp (senha, email) values (v_senha, v_email);
end $$;

-- 2) Mostra usuário, senha e e-mail UMA vez e apaga a senha guardada
delete from private.senha_medico_tmp
returning 'medico' as usuario, senha, email as email_alternativo;
