import { createClient } from 'npm:@supabase/supabase-js@2';

// Origens permitidas: ALLOWED_ORIGINS="https://cmip.exemplo.com,https://outro.exemplo.com".
// Sem a variável, mantém o comportamento anterior (qualquer origem). A autenticação é por Bearer token,
// então o CORS aberto não concede acesso por si só, mas restringir é a configuração recomendada.
const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const corsFor = (req: Request) => {
  const origin = req.headers.get('Origin') || '';
  const allow = allowedOrigins.length === 0 ? '*' : allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
};

const MIN_PASSWORD = 10;
// Mesmo formato aceito pelo login por usuário (src/utils/identity.js).
const USERNAME_RE = /^[a-z0-9]+(?:\.[a-z0-9]+)*$/;

Deno.serve(async (req) => {
  const cors = corsFor(req);
  const out = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const auth = req.headers.get('Authorization') || '';
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const {
      data: { user },
      error: ue,
    } = await userClient.auth.getUser();
    if (ue || !user) return out({ error: 'Authentication required' }, 401);

    const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: actor, error: ae } = await admin
      .from('profiles')
      .select('role,active,must_change_password')
      .eq('id', user.id)
      .maybeSingle();
    if (ae || !actor || !['admin', 'master'].includes(actor.role) || !actor.active || actor.must_change_password) {
      return out({ error: 'Admin/Master authorization required' }, 403);
    }

    // Auditoria best-effort (tabela criada por 20261008120000_v1_review_fixes.sql). Nunca grava senha.
    const audit = async (action: string, targetId: string | null, metadata: Record<string, unknown> = {}) => {
      try {
        const { error } = await admin.from('admin_user_audit').insert({
          actor_user_id: user.id,
          target_user_id: targetId,
          action,
          metadata,
        });
        if (error) console.warn('[audit] não gravado:', error.message);
      } catch (e) {
        console.warn('[audit] não gravado:', (e as Error)?.message);
      }
    };

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return out({ error: 'Corpo da requisição inválido' }, 400);
    }
    const action = body.action;

    if (action === 'create') {
      const full_name = String(body.full_name || '').trim(),
        email = String(body.email || '').trim().toLowerCase(),
        role = String(body.role || '');
      if (full_name.length < 2 || !email || !['admin', 'receptionist', 'doctor'].includes(role)) {
        return out({ error: 'Dados inválidos' }, 400);
      }
      const username = body.username ? String(body.username).trim().toLowerCase() : '';
      if (username && (username.length < 3 || username.length > 40 || !USERNAME_RE.test(username))) {
        return out({ error: 'Usuário inválido: use 3 a 40 caracteres (letras minúsculas, números e pontos)' }, 400);
      }
      const password = String(body.temporary_password || '');
      if (password.length < MIN_PASSWORD) {
        return out({ error: `Senha temporária deve ter ao menos ${MIN_PASSWORD} caracteres` }, 400);
      }
      const { data: created, error: ce } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name, role },
      });
      if (ce || !created.user) return out({ error: ce?.message || 'Falha ao criar usuário' }, 400);
      const uid = created.user.id;
      try {
        const profilePayload: Record<string, unknown> = {
          id: uid,
          full_name,
          role,
          active: body.active !== false,
          must_change_password: true,
          updated_at: new Date().toISOString(),
        };
        if (username) profilePayload.username = username;
        if (body.display_name) profilePayload.display_name = String(body.display_name).trim();
        const { error: pe } = await admin.from('profiles').upsert(profilePayload);
        if (pe) throw pe;
        if (role === 'doctor') {
          const { error: de } = await admin.from('doctors').insert({
            profile_id: uid,
            crm: String(body.crm || '').trim() || null,
            specialty: String(body.specialty || '').trim() || null,
            active: body.active !== false,
          });
          if (de) throw de;
        }
        await audit('create_user', uid, { role, username: username || null });
        return out({ id: uid, email, role, must_change_password: true });
      } catch (e) {
        await admin.auth.admin.deleteUser(uid);
        const msg = (e as { message?: string })?.message || '';
        // Violação de unicidade (usuário já existe) é uma mensagem útil; o resto não é exposto ao cliente.
        if (/duplicate key|unique/i.test(msg)) return out({ error: 'Usuário ou CRM já cadastrado' }, 400);
        console.error('[create_user] rollback:', msg);
        return out({ error: 'Falha ao criar perfil' }, 400);
      }
    }

    if (action === 'reset_password') {
      const target = String(body.user_id || ''),
        password = String(body.temporary_password || '');
      if (password.length < MIN_PASSWORD) {
        return out({ error: `Senha temporária deve ter ao menos ${MIN_PASSWORD} caracteres` }, 400);
      }
      const { data: tp } = await admin
        .from('profiles')
        .select('role,must_change_password')
        .eq('id', target)
        .maybeSingle();
      if (!tp) return out({ error: 'Usuário não encontrado' }, 404);
      if (tp.role === 'master' && actor.role !== 'master') {
        return out({ error: 'Admin não pode redefinir senha de Master' }, 403);
      }

      // Ordem importa: primeiro exige a troca no próximo acesso, depois altera a senha. Assim, se a senha
      // for alterada, a conta nunca fica com a senha padrão sem a troca obrigatória.
      const { error: pe } = await admin
        .from('profiles')
        .update({ must_change_password: true, updated_at: new Date().toISOString() })
        .eq('id', target);
      if (pe) {
        console.error('[reset_password] profile:', pe.message);
        return out({ error: 'Não foi possível preparar a redefinição' }, 400);
      }
      const { error: re } = await admin.auth.admin.updateUserById(target, { password });
      if (re) {
        // Restaura o estado anterior: a senha não mudou, então não há motivo para exigir troca.
        await admin
          .from('profiles')
          .update({ must_change_password: tp.must_change_password, updated_at: new Date().toISOString() })
          .eq('id', target);
        return out({ error: re.message }, 400);
      }
      await audit('reset_password', target, { target_role: tp.role });
      return out({ ok: true });
    }

    return out({ error: 'Ação inválida' }, 400);
  } catch (e) {
    console.error('[master-user-admin]', (e as Error)?.message || e);
    return out({ error: 'Erro interno' }, 500);
  }
});
