import React, { useEffect, useState } from 'react';
import { cmipApi } from '../utils/cmipApi';
import { Tv } from 'lucide-react';
import { Button, Field, Card } from './ui';

export function Login() {
  const [identifier, setIdentifier] = useState(''),
    [password, setPassword] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [activeDisplayPanels, setActiveDisplayPanels] = useState([]),
    [displayError, setDisplayError] = useState('');
  useEffect(() => {
    let alive = true;
    cmipApi
      .activeDisplayPanels()
      .then((rows) => {
        if (!alive) return;
        setActiveDisplayPanels(Array.isArray(rows) ? rows : []);
        setDisplayError('');
      })
      .catch((e) => {
        console.warn('Falha ao carregar painéis públicos', e);
        if (alive) setDisplayError('Não foi possível carregar os painéis de TV.');
      });
    return () => {
      alive = false;
    };
  }, []);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { error: x } = await cmipApi.signIn(identifier, password);
      if (x) throw x;
    } catch (e) {
      const msg = e?.message || '';
      if (
        msg === 'Acesso negado.' ||
        msg === 'Não foi possível autenticar no momento.' ||
        msg.includes('conexão') ||
        msg.includes('usuário válido')
      )
        setError(msg);
      else setError('Usuário ou senha inválidos.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="min-h-screen bg-cmip-950 cmip-plus-pattern grid place-items-center p-4 text-white">
      <div className="w-full max-w-md space-y-4">
        <Card>
          <img src="/logo.png" className="h-16 mx-auto mb-5" alt="CMIP" />
          <h1 className="text-2xl font-black text-center">CMIP CHAMADOR</h1>
          <p className="text-center text-cmip-100/60 mt-2 mb-6">Acesso seguro</p>
          {error && <p className="text-rose-300 mb-3">{error}</p>}
          <form onSubmit={submit} className="space-y-4">
            <Field
              aria-label="Usuário"
              autoComplete="username"
              required
              placeholder="Usuário"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
            />
            <Field
              type="password"
              autoComplete="current-password"
              required
              placeholder="Senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="text-xs text-cmip-100/60">Use sua identificação institucional.</p>
            <Button disabled={busy} className="w-full">
              {busy ? 'Entrando…' : 'Entrar'}
            </Button>
          </form>
        </Card>
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Tv className="w-5 h-5 text-cmip-400" />
            <h2 className="font-black">Painéis de TV</h2>
          </div>
          <p className="text-xs text-cmip-100/60 mb-3">Acesso direto aos painéis ativos, sem login.</p>
          {displayError && <p className="text-amber-300 text-sm mb-3">{displayError}</p>}
          <div className="grid grid-cols-2 gap-2">
            {activeDisplayPanels.map((panel) => (
              <a
                key={panel.code}
                href={`/tv/${encodeURIComponent(panel.code)}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border border-cmip-500/40 bg-cmip-950 px-3 py-3 text-center font-bold hover:bg-cmip-800"
              >
                {panel.name}
              </a>
            ))}
            {!displayError && activeDisplayPanels.length === 0 && (
              <p className="col-span-2 text-xs text-cmip-100/50 text-center py-2">
                Nenhuma TV ativa cadastrada.
              </p>
            )}
          </div>
        </Card>
      </div>
    </main>
  );
}
