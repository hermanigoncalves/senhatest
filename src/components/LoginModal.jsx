import React, { useState } from 'react';
import { loginUser } from '../utils/socket';
import { UserCheck, ShieldCheck, Stethoscope, ClipboardList, Lock, ArrowRight, AlertCircle, LogIn } from 'lucide-react';

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

  const handleQuickLogin = async (quickUser, quickPass) => {
    setUsername(quickUser);
    setPassword(quickPass);
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await loginUser(quickUser, quickPass);
      setLoading(false);
      if (res?.success && res.user) {
        onLoginSuccess(res.user);
      } else {
        setErrorMsg(res?.message || 'Falha ao autenticar com este perfil.');
      }
    } catch {
      setLoading(false);
      setErrorMsg('Erro de conexão ao autenticar.');
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
          <p className="text-xs text-cmip-100/80 font-medium">Acesse o sistema com suas credenciais ou escolha um perfil</p>
        </div>

        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-950/80 border border-rose-600/50 text-rose-300 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* FORMULÁRIO DE LOGIN */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-cmip-100 uppercase tracking-wider mb-1.5">Usuário</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Ex: recepcao ou dr_carlos"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-cmip-950 border border-cmip-500/40 text-white rounded-xl px-4 py-3 text-sm font-semibold focus:outline-none focus:border-cmip-400 placeholder:text-cmip-100/30"
              />
              <UserCheck className="w-4 h-4 text-cmip-400 absolute right-3.5 top-3.5" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-cmip-100 uppercase tracking-wider mb-1.5">Senha</label>
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

        {/* ATALHOS RÁPIDOS DE PERFIL */}
        <div className="pt-4 border-t border-cmip-600/30 space-y-2.5">
          <span className="block text-[11px] font-bold text-cmip-400 uppercase tracking-wider text-center mb-2">
            Ou acesse diretamente pelos perfis:
          </span>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleQuickLogin('recepcao', 'recepcao123')}
              className="p-2.5 bg-cmip-950/80 hover:bg-cmip-800 border border-cmip-600/30 rounded-xl text-left flex items-center gap-2 transition-colors"
            >
              <ClipboardList className="w-4 h-4 text-emerald-400 shrink-0" />
              <div>
                <div className="text-xs font-bold text-white">Recepção</div>
                <div className="text-[10px] text-cmip-100/60">Cadastro Direto</div>
              </div>
            </button>

            <button
              onClick={() => handleQuickLogin('dr_carlos', 'medico123')}
              className="p-2.5 bg-cmip-950/80 hover:bg-cmip-800 border border-cmip-600/30 rounded-xl text-left flex items-center gap-2 transition-colors"
            >
              <Stethoscope className="w-4 h-4 text-cyan-400 shrink-0" />
              <div>
                <div className="text-xs font-bold text-white">Dr. Carlos</div>
                <div className="text-[10px] text-cmip-100/60">Consultório 01</div>
              </div>
            </button>

            <button
              onClick={() => handleQuickLogin('dra_helena', 'medico123')}
              className="p-2.5 bg-cmip-950/80 hover:bg-cmip-800 border border-cmip-600/30 rounded-xl text-left flex items-center gap-2 transition-colors"
            >
              <Stethoscope className="w-4 h-4 text-purple-400 shrink-0" />
              <div>
                <div className="text-xs font-bold text-white">Dra. Helena</div>
                <div className="text-[10px] text-cmip-100/60">Consultório 02</div>
              </div>
            </button>

            <button
              onClick={() => handleQuickLogin('admin', 'admin123')}
              className="p-2.5 bg-cmip-950/80 hover:bg-cmip-800 border border-cmip-600/30 rounded-xl text-left flex items-center gap-2 transition-colors"
            >
              <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <div className="text-xs font-bold text-white">Admin Geral</div>
                <div className="text-[10px] text-cmip-100/60">Gestão Total</div>
              </div>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
