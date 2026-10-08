import React, { useEffect, useState } from 'react';
import { supabase } from './utils/supabaseClient';
import { cmipApi } from './utils/cmipApi';
import { classifyProfile } from './utils/profile';
import { isTvPath, tvSlug } from './utils/routes';
import { CAPABILITIES, hasCapability } from './utils/capabilities';
import V1TvPanel from './components/V1TvPanel';
import { Login } from './components/Login';
import { Reception } from './components/Reception';
import { Doctor } from './components/Doctor';
import { SuperuserWorkspace } from './components/SuperuserWorkspace';
import { PasswordChange } from './components/PasswordChange';
import { Button, Card } from './components/ui';

export default function App() {
  const isTv = isTvPath(location.pathname),
    slug = tvSlug(location.pathname, location.search);
  const [session, setSession] = useState(null),
    [ready, setReady] = useState(false),
    [profile, setProfile] = useState(null),
    [profileState, setProfileState] = useState('loading'),
    [error, setError] = useState('');
  const loadProfile = async () => {
    setError('');
    setProfileState('loading');
    try {
      const p = await cmipApi.profile();
      setProfile(p);
      setProfileState(classifyProfile(p));
    } catch (e) {
      console.error('Falha ao carregar profile', e);
      setProfile(null);
      setProfileState('error');
      setError('Não foi possível carregar a configuração da sua conta. Tente sair e entrar novamente.');
    }
  };
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!session) {
      setProfile(null);
      setProfileState('loading');
      setError('');
      return;
    }
    loadProfile();
  }, [session?.user?.id]);
  if (isTv) return <V1TvPanel slug={slug} />;
  if (!ready) return null;
  if (!session) return <Login />;
  if (profileState === 'error')
    return (
      <main className="min-h-screen bg-cmip-950 cmip-plus-pattern grid place-items-center p-4 text-white">
        <Card className="w-full max-w-lg">
          <h1 className="text-xl font-black">Erro ao carregar conta</h1>
          <p className="my-3 text-rose-200">{error}</p>
          <Button onClick={() => cmipApi.signOut()}>Voltar ao login</Button>
        </Card>
      </main>
    );
  if (profileState === 'missing')
    return (
      <main className="min-h-screen bg-cmip-950 cmip-plus-pattern grid place-items-center p-4 text-white">
        <Card className="w-full max-w-lg">
          <h1 className="text-xl font-black">Conta sem configuração</h1>
          <p className="my-3 text-amber-200">
            Seu login foi autenticado, mas não existe um profile vinculado a esta conta. Procure um
            administrador.
          </p>
          <Button onClick={() => cmipApi.signOut()}>Voltar ao login</Button>
        </Card>
      </main>
    );
  if (profileState === 'inactive')
    return (
      <main className="min-h-screen bg-cmip-950 cmip-plus-pattern grid place-items-center p-4 text-white">
        <Card className="w-full max-w-lg">
          <h1 className="text-xl font-black">Acesso inativo</h1>
          <p className="my-3 text-amber-200">Esta conta está inativa. Procure um administrador.</p>
          <Button onClick={() => cmipApi.signOut()}>Voltar ao login</Button>
        </Card>
      </main>
    );
  if (profileState === 'loading' || !profile)
    return <div className="min-h-screen bg-cmip-950 text-white grid place-items-center">Carregando…</div>;
  if (profileState === 'password_change') return <PasswordChange profile={profile} onDone={loadProfile} />;
  if (hasCapability(profile.role, CAPABILITIES.DOCTOR_SELF)) return <Doctor profile={profile} />;
  if (
    hasCapability(profile.role, CAPABILITIES.RECEPTION) &&
    !hasCapability(profile.role, CAPABILITIES.ADMINISTRATION)
  )
    return <Reception profile={profile} />;
  if (hasCapability(profile.role, CAPABILITIES.ADMINISTRATION))
    return <SuperuserWorkspace profile={profile} />;
  return (
    <main className="min-h-screen bg-cmip-950 cmip-plus-pattern grid place-items-center p-4 text-white">
      <Card className="w-full max-w-lg">
        <h1 className="text-xl font-black">Acesso não autorizado</h1>
        <p className="my-3 text-amber-200">
          Seu perfil ({String(profile.role || 'desconhecido')}) não possui módulos disponíveis. Procure um
          administrador.
        </p>
        <Button onClick={() => cmipApi.signOut()}>Voltar ao login</Button>
      </Card>
    </main>
  );
}
