import React, { useState } from 'react';
import { loginUser } from '../utils/socket';
import { UserCheck, Lock, AlertCircle, LogIn } from 'lucide-react';

export default function LoginModal({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!username.trim()) {
      setErrorMsg('Informe o usuário.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    const res = await loginUser(username.trim(), password.trim());
    setLoading(false);

    if (res?.success && res.user) {
      onLoginSuccess(res.user);
    } else {
      setErrorMsg(res?.message || 'Falha ao autenticar. Verifique usuário e senha.');
    }
  };

  return (
    <div className="min-h-screen bg-cmip-950 text-slate-100 flex items-center justify-center p-4 font-['Montserrat',sans-serif] cmip-plus-pattern relative">
      <div className="max-w-md w-full bg-cmip-900/90 border border-cmip-600/40 p-8 rounded-3xl shadow-2xl backdrop-blur-xl space-y-6 relative z-10">
        
        {/* LOGO & CABEÇALHO */}
        <div className="text-center space-y-3">
          <div className="inline-block bg-white p-3 rounded-2xl shadow-xl border border-cmip-100 mb-2">
            <img src="/logo.png" alt="CMIP Logo" className="h-12 object-contain mx-auto" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight uppercase">
            <span className="text-cmip-400">CMIP</span> Atendimento Médico
          </h1>
          <p className="text-xs text-cmip-100/70">
            Acesse o sistema com suas credenciais para continuar
          </p>
        </div>

        {/* MENSAGEM DE ERRO */}
        {errorMsg && (
          <div className="p-3.5 bg-rose-950/80 border border-rose-500/50 rounded-2xl text-rose-200 text-xs font-bold flex items-center gap-2.5 animate-pulse">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* FORMULÁRIO DE LOGIN */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-cmip-300 uppercase tracking-wider">
              Usuário
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Ex: admin, recepcao ou dr_carlos"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                className="w-full bg-cmip-950 border border-cmip-500/40 text-white rounded-xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-cmip-400 placeholder:text-cmip-100/30"
              />
              <UserCheck className="w-4 h-4 text-cmip-400 absolute right-3.5 top-3.5" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-cmip-300 uppercase tracking-wider">
              Senha
            </label>
            <div className="relative">
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-cmip-950 border border-cmip-500/40 text-white rounded-xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-cmip-400 placeholder:text-cmip-100/30"
              />
              <Lock className="w-4 h-4 text-cmip-400 absolute right-3.5 top-3.5" />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-gradient-to-r from-cmip-500 to-cmip-600 hover:from-cmip-400 hover:to-cmip-500 text-cmip-950 font-black rounded-xl text-sm shadow-lg shadow-cmip-500/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? (
              <span>Entrando...</span>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                <span>ACESSAR PAINEL</span>
              </>
            )}
          </button>
        </form>

      </div>
    </div>
  );
}
