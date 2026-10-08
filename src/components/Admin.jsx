import React, { useEffect, useState } from 'react';
import { cmipApi } from '../utils/cmipApi';
import { normalizeUsername, isValidUsername } from '../utils/identity';
import { MIN_PASSWORD_LENGTH } from '../utils/validation';
import { Shell } from './Shell';
import { Button, Field, Card, err } from './ui';

export function Admin({ profile }) {
  const isMaster = profile.role === 'master';
  const isAdminOrMaster = profile.role === 'admin' || profile.role === 'master';
  const [tabs, setTabs] = useState('dashboard'),
    [users, setUsers] = useState([]),
    [resources, setResources] = useState({
      offices: [],
      service_points: [],
      displays: [],
      display_offices: [],
      display_service_points: [],
      doctors: [],
    }),
    [stats, setStats] = useState({}),
    [msg, setMsg] = useState(''),
    [query, setQuery] = useState(''),
    [modal, setModal] = useState(null),
    [editing, setEditing] = useState(null),
    [resetUser, setResetUser] = useState(null),
    [busy, setBusy] = useState(false);
  const load = async () => {
    setMsg('');
    try {
      const u = await cmipApi.adminListUsers();
      setUsers(u || []);
      if (isAdminOrMaster) {
        const [d, r] = await Promise.all([cmipApi.masterDashboard(), cmipApi.masterResources()]);
        setStats(d || {});
        setResources(r || resources);
      }
    } catch (e) {
      setMsg(err(e));
    }
  };
  useEffect(() => {
    load();
  }, []);
  const toggle = async (u) => {
    if (u.role === 'master') return;
    setBusy(true);
    try {
      await cmipApi.adminUpdateUser(u.id, { active: !u.active });
      await load();
    } catch (e) {
      setMsg(err(e));
    } finally {
      setBusy(false);
    }
  };
  const resetPassword = async (u) => {
    if (u.role === 'master' && !isMaster) return;
    setBusy(true);
    try {
      const res = await cmipApi.requestAdminPasswordReset(u.id);
      await load();
      return res;
    } finally {
      setBusy(false);
    }
  };
  const saveUser = async (e) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      role = f.get('role');
    // O login só aceita letras minúsculas, números e pontos; o cadastro precisa seguir a mesma regra.
    const username = normalizeUsername(String(f.get('username') || ''));
    if (!isValidUsername(username)) {
      setMsg('Usuário inválido. Use de 3 a 40 caracteres: letras, números e pontos (ex.: dr.joao).');
      return;
    }
    if (String(f.get('password') || '').length < MIN_PASSWORD_LENGTH) {
      setMsg(`A senha temporária deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    setBusy(true);
    try {
      await cmipApi.masterUserAdmin({
        action: 'create',
        full_name: f.get('full_name'),
        display_name: f.get('display_name'),
        username,
        email: f.get('email'),
        role,
        active: true,
        temporary_password: f.get('password'),
        crm: f.get('crm'),
        specialty: f.get('specialty'),
      });
      setModal(null);
      await load();
      setMsg(`Usuário ${username} criado. No primeiro login será exigida troca de senha.`);
    } catch (e) {
      setMsg(err(e));
    } finally {
      setBusy(false);
    }
  };
  const saveResource = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const f = new FormData(e.currentTarget);
      if (modal === 'office')
        await cmipApi.masterSaveOffice({
          id: editing?.id,
          name: f.get('name'),
          code: f.get('code'),
          active: f.get('active') === 'on',
        });
      if (modal === 'point')
        await cmipApi.masterSaveServicePoint({
          id: editing?.id,
          name: f.get('name'),
          code: f.get('code'),
          active: f.get('active') === 'on',
        });
      if (modal === 'display')
        await cmipApi.masterSaveDisplay({
          id: editing?.id,
          name: f.get('name'),
          code: f.get('code'),
          description: f.get('description'),
          active: f.get('active') === 'on',
          office_ids: f.getAll('office_ids'),
          service_point_ids: f.getAll('service_point_ids'),
        });
      setModal(null);
      setEditing(null);
      await load();
    } catch (e) {
      setMsg(err(e));
    } finally {
      setBusy(false);
    }
  };
  const filtered = users.filter((u) =>
    `${u.full_name} ${u.display_name || ''} ${u.username || ''} ${u.email || ''} ${u.role}`
      .toLowerCase()
      .includes(query.toLowerCase())
  );
  const nav = [
    ['dashboard', 'Dashboard'],
    ['users', 'Usuários'],
    ['doctors', 'Médicos'],
    ['offices', 'Consultórios'],
    ['points', 'Guichês'],
    ['displays', 'TVs'],
  ];
  const open = (kind, row = null) => {
    setEditing(row);
    setModal(kind);
  };
  return (
    <Shell profile={profile}>
      <div className="grid lg:grid-cols-[220px_1fr] gap-6">
        <Card className="h-fit">
          <h1 className="text-xl font-black mb-4">{isMaster ? 'PAINEL MASTER' : 'PAINEL ADMIN'}</h1>
          <div className="grid gap-2">
            {nav.map(([k, l]) => (
              <button
                key={k}
                onClick={() => setTabs(k)}
                className={`text-left px-4 py-3 rounded-xl font-bold ${tabs === k ? 'bg-cmip-500 text-cmip-950' : 'bg-cmip-950'}`}
              >
                {l}
              </button>
            ))}
          </div>
          <a
            className="block mt-4 text-center px-3 py-3 rounded-xl bg-cmip-950 border border-cmip-600/40"
            href="/tv/recepcao"
            target="_blank"
          >
            Abrir TV
          </a>
        </Card>
        <div className="space-y-5">
          {msg && (
            <p className="rounded-xl bg-amber-950/50 border border-amber-700/40 p-3 text-amber-200">{msg}</p>
          )}
          {tabs === 'dashboard' && (
            <>
              <Card>
                <h2 className="text-2xl font-black">Visão geral</h2>
                <p className="text-cmip-100/60 mt-1">Administração global do CMIP.</p>
              </Card>
              <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-3">
                {[
                  ['Usuários', stats.active_users],
                  ['Médicos', stats.active_doctors],
                  ['Consultórios', stats.active_offices],
                  ['Guichês', stats.active_service_points],
                  ['TVs', stats.active_displays],
                ].map(([l, v]) => (
                  <Card key={l}>
                    <div className="text-3xl font-black">{v ?? '—'}</div>
                    <div className="text-xs uppercase text-cmip-100/60">{l} ativos</div>
                  </Card>
                ))}
              </div>
            </>
          )}
          {tabs === 'users' && (
            <Card>
              <div className="flex flex-wrap justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-xl font-black">Usuários</h2>
                  <Field
                    className="mt-3"
                    placeholder="Pesquisar nome, usuário ou perfil"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <Button onClick={() => open('user')}>+ Novo usuário</Button>
              </div>
              <div className="space-y-2">
                {filtered.map((u) => (
                  <UserIdentityRow
                    key={u.id}
                    user={u}
                    busy={busy}
                    protectedUser={u.role === 'master' && !isMaster}
                    onToggle={() => toggle(u)}
                    onReset={() => setResetUser(u)}
                  />
                ))}
              </div>
            </Card>
          )}
          {tabs === 'doctors' && (
            <Card>
              <h2 className="text-xl font-black mb-4">Médicos</h2>
              <div className="space-y-2">
                {resources.doctors.map((d) => (
                  <div key={d.id} className="bg-cmip-950 rounded-xl p-4">
                    <b>{d.display_name || d.full_name}</b>
                    <p className="text-sm text-cmip-100/60">
                      Nome completo: {d.full_name} • Usuário: {d.username || 'não configurado'} • CRM{' '}
                      {d.crm || '—'} • {d.specialty || 'Sem especialidade'} • {d.active ? 'Ativo' : 'Inativo'}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          )}
          {tabs === 'offices' && (
            <ResourceList
              title="Consultórios"
              button="+ Novo consultório"
              rows={resources.offices}
              onNew={() => open('office')}
              onEdit={(r) => open('office', r)}
            />
          )}
          {tabs === 'points' && (
            <ResourceList
              title="Guichês / Pontos de atendimento"
              button="+ Novo guichê"
              rows={resources.service_points}
              onNew={() => open('point')}
              onEdit={(r) => open('point', r)}
            />
          )}
          {tabs === 'displays' && (
            <Card>
              <div className="flex justify-between mb-4">
                <h2 className="text-xl font-black">TVs / Painéis</h2>
                <Button onClick={() => open('display')}>+ Nova TV</Button>
              </div>
              <div className="space-y-2">
                {resources.displays.map((r) => (
                  <div key={r.id} className="bg-cmip-950 rounded-xl p-4 flex flex-wrap justify-between gap-3">
                    <div>
                      <b>{r.name}</b>
                      <p className="text-xs text-cmip-100/60">
                        /tv/{r.code} • {r.active ? 'Ativa' : 'Inativa'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <a
                        className="px-4 py-3 rounded-xl bg-cmip-800 font-bold"
                        href={`/tv/${encodeURIComponent(r.code)}`}
                        target="_blank"
                      >
                        Abrir
                      </a>
                      <Button onClick={() => open('display', r)}>Editar / vínculos</Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
      {modal && (
        <MasterModal
          kind={modal}
          row={editing}
          resources={resources}
          busy={busy}
          onClose={() => {
            setModal(null);
            setEditing(null);
          }}
          onSave={modal === 'user' ? saveUser : saveResource}
        />
      )}{' '}
      {resetUser && (
        <PasswordResetModal
          user={resetUser}
          busy={busy}
          onClose={() => setResetUser(null)}
          onRequest={() => resetPassword(resetUser)}
        />
      )}
    </Shell>
  );
}
function UserIdentityRow({ user, busy, protectedUser, onToggle, onReset }) {
  return (
    <div className="grid lg:grid-cols-[1fr_auto] gap-3 items-center bg-cmip-950 rounded-xl p-3">
      <div>
        <b>{user.display_name || user.full_name}</b>
        <p className="text-xs text-cmip-100/60">
          Nome completo: {user.full_name} • Usuário: {user.username || 'não configurado'} • {user.role}
          {user.must_change_password ? ' • primeiro acesso pendente' : ''}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span>{user.active ? 'Ativo' : 'Inativo'}</span>
        <Button disabled={busy || protectedUser} className="bg-slate-700 text-white" onClick={onReset}>
          Redefinir senha
        </Button>
        <Button disabled={busy || protectedUser || user.role === 'master'} onClick={onToggle}>
          {user.active ? 'Desativar' : 'Ativar'}
        </Button>
      </div>
    </div>
  );
}
function PasswordResetModal({ user, busy, onClose, onRequest }) {
  const [feedback, setFeedback] = useState(''),
    [successMsg, setSuccessMsg] = useState('');
  const request = async () => {
    setFeedback('');
    setSuccessMsg('');
    try {
      const res = await onRequest();
      const tempPassword = res?.temporary_password ? ` A senha padrão é ${res.temporary_password}.` : '';
      setSuccessMsg(
        `Senha redefinida com sucesso.${tempPassword} O usuário deverá criar uma nova senha no próximo acesso.`
      );
    } catch (e) {
      setFeedback(err(e));
    }
  };
  return (
    <div className="fixed inset-0 z-[60] bg-black/70 grid place-items-center p-4">
      <Card className="w-full max-w-lg">
        <div className="flex justify-between mb-4">
          <div>
            <h2 className="text-xl font-black">Redefinir senha</h2>
            <p className="text-sm text-cmip-100/60">
              {user.display_name || user.full_name} • {user.username || 'username não configurado'}
            </p>
          </div>
          <button onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </div>
        <p className="rounded-xl border border-amber-700/40 bg-amber-950/40 p-3 text-amber-200">
          Tem certeza de que deseja redefinir a senha deste usuário? O usuário precisará definir uma nova
          senha no próximo acesso.
        </p>
        {feedback && (
          <p className="mt-3 text-rose-300" role="status">
            {feedback}
          </p>
        )}
        {successMsg && (
          <p className="mt-3 text-emerald-300 font-bold" role="status">
            {successMsg}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" className="bg-slate-700 text-white" onClick={onClose}>
            Fechar
          </Button>
          {!successMsg && (
            <Button disabled={busy} onClick={request}>
              {busy ? 'Redefinindo…' : 'Confirmar redefinição'}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
function ResourceList({ title, button, rows, onNew, onEdit }) {
  return (
    <Card>
      <div className="flex justify-between mb-4">
        <h2 className="text-xl font-black">{title}</h2>
        <Button onClick={onNew}>{button}</Button>
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="bg-cmip-950 rounded-xl p-4 flex justify-between gap-3">
            <div>
              <b>{r.name}</b>
              <p className="text-xs text-cmip-100/60">
                {r.code || 'Sem código'} • {r.active ? 'Ativo' : 'Inativo'}
              </p>
            </div>
            <Button onClick={() => onEdit(r)}>Editar</Button>
          </div>
        ))}
      </div>
    </Card>
  );
}
function MasterModal({ kind, row, resources, busy, onClose, onSave }) {
  const [role, setRole] = useState('receptionist');
  const offices = new Set(
      (resources.display_offices || []).filter((x) => x.display_panel_id === row?.id).map((x) => x.office_id)
    ),
    points = new Set(
      (resources.display_service_points || [])
        .filter((x) => x.display_panel_id === row?.id)
        .map((x) => x.service_point_id)
    );
  return (
    <div className="fixed inset-0 z-50 bg-black/70 grid place-items-center p-4">
      <Card className="w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between mb-4">
          <h2 className="text-xl font-black">
            {row ? 'Editar' : 'Cadastrar'}{' '}
            {kind === 'user'
              ? 'usuário'
              : kind === 'office'
                ? 'consultório'
                : kind === 'point'
                  ? 'guichê'
                  : 'TV'}
          </h2>
          <button onClick={onClose}>✕</button>
        </div>
        <form onSubmit={onSave} className="space-y-3">
          {kind === 'user' ? (
            <>
              <Field name="full_name" required placeholder="Nome completo" />
              <Field name="display_name" placeholder="Nome de exibição (ex.: Dr. João)" />
              <Field name="username" required placeholder="Usuário de login (ex.: dr.joao)" />
              <Field name="email" type="email" required placeholder="E-mail" />
              <select
                name="role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full bg-cmip-950 rounded-xl p-3"
              >
                <option value="receptionist">Recepcionista</option>
                <option value="admin">Administrador</option>
                <option value="doctor">Médico</option>
              </select>
              {role === 'doctor' && (
                <>
                  <Field name="crm" placeholder="CRM" />
                  <Field name="specialty" placeholder="Especialidade" />
                </>
              )}
              <Field
                name="password"
                type="password"
                minLength={MIN_PASSWORD_LENGTH}
                required
                placeholder="Senha temporária (mín. 10 caracteres)"
              />
              <p className="text-xs text-cmip-100/60">
                A senha temporária não é armazenada em tabela pública. O usuário será obrigado a trocá-la no
                primeiro acesso.
              </p>
            </>
          ) : (
            <>
              <Field name="name" required defaultValue={row?.name || ''} placeholder="Nome" />
              <Field
                name="code"
                required={kind !== 'office'}
                defaultValue={row?.code || ''}
                placeholder="Código / slug"
              />
              {kind === 'display' && (
                <>
                  <Field name="description" defaultValue={row?.description || ''} placeholder="Descrição" />
                  <div>
                    <b className="text-sm">Consultórios vinculados</b>
                    {resources.offices.map((x) => (
                      <label key={x.id} className="flex gap-2 mt-2">
                        <input
                          type="checkbox"
                          name="office_ids"
                          value={x.id}
                          defaultChecked={offices.has(x.id)}
                        />
                        {x.name}
                      </label>
                    ))}
                  </div>
                  <div>
                    <b className="text-sm">Guichês vinculados</b>
                    {resources.service_points.map((x) => (
                      <label key={x.id} className="flex gap-2 mt-2">
                        <input
                          type="checkbox"
                          name="service_point_ids"
                          value={x.id}
                          defaultChecked={points.has(x.id)}
                        />
                        {x.name}
                      </label>
                    ))}
                  </div>
                </>
              )}
              <label className="flex gap-2">
                <input type="checkbox" name="active" defaultChecked={row?.active !== false} /> Ativo
              </label>
            </>
          )}
          <div className="flex justify-end gap-2 pt-3">
            <Button type="button" className="bg-slate-700 text-white" onClick={onClose}>
              Cancelar
            </Button>
            <Button disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
