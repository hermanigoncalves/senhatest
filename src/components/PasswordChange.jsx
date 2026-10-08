import React, { useRef, useState } from 'react';
import { cmipApi } from '../utils/cmipApi';
import { MIN_PASSWORD_LENGTH } from '../utils/validation';
import { Eye, EyeOff } from 'lucide-react';
import { Button, Field, Card, err } from './ui';

export function PasswordChange({ profile, onDone }) {
  const [p1, setP1] = useState(''),
    [p2, setP2] = useState(''),
    [show, setShow] = useState(false),
    [msg, setMsg] = useState(''),
    [busy, setBusy] = useState(false);
  // Se a senha já foi trocada mas a confirmação (complete_first_password_change) falhou, a nova tentativa
  // não pode chamar updateUser de novo: o Supabase recusa "nova senha igual à atual" e o usuário ficaria preso.
  const passwordUpdated = useRef(false);
  const submit = async (e) => {
    e.preventDefault();
    if (p1.length < MIN_PASSWORD_LENGTH) {
      setMsg(`Use uma senha com pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (p1 !== p2) {
      setMsg('As senhas não conferem.');
      return;
    }
    setBusy(true);
    setMsg('');
    try {
      if (!passwordUpdated.current) {
        const { error } = await cmipApi.updateOwnPassword(p1);
        if (error && error.code !== 'same_password') throw error;
        passwordUpdated.current = true;
      }
      await cmipApi.completeFirstPasswordChange();
      setMsg('Senha alterada com sucesso.');
      await onDone();
    } catch (e) {
      setMsg(err(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="min-h-screen bg-cmip-950 cmip-plus-pattern grid place-items-center p-4 text-white">
      <Card className="w-full max-w-md">
        <h1 className="text-2xl font-black">Primeiro acesso</h1>
        <p className="my-3 text-cmip-100/70">
          {profile.full_name}, defina sua senha definitiva antes de continuar.
        </p>
        <form onSubmit={submit} className="space-y-3">
          <Field
            aria-label="Nova senha"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            required
            value={p1}
            onChange={(e) => setP1(e.target.value)}
            placeholder="Nova senha"
          />
          <Field
            aria-label="Confirmar nova senha"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            required
            value={p2}
            onChange={(e) => setP2(e.target.value)}
            placeholder="Confirmar nova senha"
          />
          <button
            type="button"
            aria-label={show ? 'Ocultar senhas' : 'Mostrar senhas'}
            className="flex items-center gap-2 text-sm text-cmip-200"
            onClick={() => setShow(!show)}
          >
            {show ? <EyeOff className="w-4" /> : <Eye className="w-4" />}
            {show ? 'Ocultar senhas' : 'Mostrar senhas'}
          </button>
          <Button disabled={busy} className="w-full">
            {busy ? 'Alterando…' : 'Alterar senha'}
          </Button>
        </form>
        {msg && (
          <p className="mt-3" role="status">
            {msg}
          </p>
        )}
      </Card>
    </main>
  );
}
