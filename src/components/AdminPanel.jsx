import React, { useState, useEffect } from 'react';
import { fetchOfficesAndDoctors, resetAllQueues } from '../utils/socket';
import { 
  ShieldCheck, Users, Stethoscope, DoorOpen, Trash2, ShieldAlert, 
  Tv, LogOut, Plus, CheckCircle, RefreshCw 
} from 'lucide-react';

export default function AdminPanel({ user, onLogout, onNavigateTv }) {
  const [offices, setOffices] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [showResetModal, setShowResetModal] = useState(false);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    const res = await fetchOfficesAndDoctors();
    setLoading(false);
    if (res?.offices) setOffices(res.offices);
    if (res?.doctors) setDoctors(res.doctors);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleResetAll = async () => {
    setLoading(true);
    const res = await resetAllQueues();
    setLoading(false);
    setShowResetModal(false);
    if (res?.success) {
      setMsg('Todas as filas de pacientes e senhas foram zeradas.');
      setTimeout(() => setMsg(''), 4000);
    }
  };

  return (
    <div className="min-h-screen bg-cmip-950 text-slate-100 font-['Montserrat',sans-serif] p-4 md:p-8 cmip-plus-pattern relative">
      <div className="max-w-7xl mx-auto space-y-8 relative z-10">
        
        {/* CABEÇALHO */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 p-6 bg-cmip-900/90 border border-cmip-600/30 rounded-3xl shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-5">
            <div className="bg-white p-3 rounded-2xl shadow-lg border border-cmip-100 max-w-[180px]">
              <img src="/logo.png" alt="CMIP Logo" className="h-10 object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-black uppercase flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  Painel de Administração
                </span>
              </div>
              <h1 className="text-xl md:text-2xl font-black text-white uppercase tracking-tight mt-1">
                Controle Geral & Cadastros
              </h1>
              <p className="text-xs text-cmip-100/70">Gestão de consultórios, corpo clínico, acessos e filas</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onNavigateTv}
              className="px-4 py-2.5 bg-cmip-950 hover:bg-cmip-800 text-cmip-400 font-bold text-xs rounded-xl border border-cmip-600/40 flex items-center gap-2 transition-colors shadow-md"
            >
              <Tv className="w-4 h-4" />
              <span>Abrir TV</span>
            </button>

            <button
              onClick={() => setShowResetModal(true)}
              className="px-4 py-2.5 bg-rose-950 hover:bg-rose-900 text-rose-300 font-bold text-xs rounded-xl border border-rose-800/40 flex items-center gap-2 transition-colors shadow-md"
            >
              <Trash2 className="w-4 h-4" />
              <span>Zerar Filas do Dia</span>
            </button>

            <button
              onClick={onLogout}
              className="px-4 py-2.5 bg-cmip-950 hover:bg-cmip-800 text-cmip-100/80 font-bold text-xs rounded-xl border border-cmip-600/40 flex items-center gap-2 transition-colors shadow-md"
            >
              <LogOut className="w-4 h-4" />
              <span>Sair</span>
            </button>
          </div>
        </header>

        {msg && (
          <div className="p-4 rounded-2xl bg-emerald-950/90 border border-emerald-500/50 text-emerald-200 text-sm font-bold flex items-center gap-3 shadow-xl">
            <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{msg}</span>
          </div>
        )}

        {/* CARDS DE VISÃO GERAL */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-3xl bg-cmip-900/80 border border-cmip-600/30 glass-panel flex items-center gap-4">
            <div className="p-4 bg-purple-500/20 text-purple-400 rounded-2xl">
              <Stethoscope className="w-8 h-8" />
            </div>
            <div>
              <span className="text-xs text-cmip-100/60 font-bold uppercase tracking-wider">Médicos Ativos</span>
              <div className="text-3xl font-black text-white mt-1">{doctors.length}</div>
            </div>
          </div>

          <div className="p-6 rounded-3xl bg-cmip-900/80 border border-cmip-600/30 glass-panel flex items-center gap-4">
            <div className="p-4 bg-cyan-500/20 text-cyan-400 rounded-2xl">
              <DoorOpen className="w-8 h-8" />
            </div>
            <div>
              <span className="text-xs text-cmip-100/60 font-bold uppercase tracking-wider">Consultórios / Salas</span>
              <div className="text-3xl font-black text-white mt-1">{offices.length}</div>
            </div>
          </div>

          <div className="p-6 rounded-3xl bg-cmip-900/80 border border-cmip-600/30 glass-panel flex items-center gap-4">
            <div className="p-4 bg-emerald-500/20 text-emerald-400 rounded-2xl">
              <Users className="w-8 h-8" />
            </div>
            <div>
              <span className="text-xs text-cmip-100/60 font-bold uppercase tracking-wider">Status do Sistema</span>
              <div className="text-sm font-black text-emerald-300 mt-1 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                Operação Normal
              </div>
            </div>
          </div>
        </div>

        {/* TABELAS DE CORPO CLÍNICO E CONSULTÓRIOS */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* MÉDICOS */}
          <div className="lg:col-span-7 bg-cmip-900/80 border border-cmip-600/30 p-6 md:p-8 rounded-3xl glass-panel space-y-4">
            <div className="flex items-center justify-between border-b border-cmip-600/30 pb-4">
              <h3 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Stethoscope className="w-5 h-5 text-cmip-400" />
                Corpo Clínico (Médicos)
              </h3>
              <button
                onClick={loadData}
                className="p-2 bg-cmip-950 hover:bg-cmip-800 rounded-xl text-cmip-100 transition-colors"
                title="Atualizar"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="space-y-3">
              {doctors.map(doc => (
                <div key={doc.id} className="p-4 rounded-2xl bg-cmip-950/80 border border-cmip-600/30 flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-white text-base">{doc.name}</h4>
                    <p className="text-xs text-cmip-100/70 mt-0.5">
                      {doc.specialty || 'Clínica Geral'} | <span className="font-mono text-cyan-300">{doc.crm || 'CRM Ativo'}</span>
                    </p>
                  </div>
                  <span className="px-3 py-1 rounded-xl bg-cmip-900 border border-cmip-500/30 text-cmip-400 text-xs font-bold">
                    {doc.office_name || 'Consultório'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* CONSULTÓRIOS */}
          <div className="lg:col-span-5 bg-cmip-900/80 border border-cmip-600/30 p-6 md:p-8 rounded-3xl glass-panel space-y-4">
            <div className="flex items-center justify-between border-b border-cmip-600/30 pb-4">
              <h3 className="text-base font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <DoorOpen className="w-5 h-5 text-cmip-400" />
                Consultórios Cadastrados
              </h3>
            </div>

            <div className="space-y-3">
              {offices.map(off => (
                <div key={off.id} className="p-4 rounded-2xl bg-cmip-950/80 border border-cmip-600/30 flex items-center justify-between">
                  <span className="font-bold text-white text-sm">{off.name}</span>
                  <span className="text-xs font-mono text-cmip-100/60 font-semibold">{off.code || 'SALA'}</span>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>

      {/* MODAL PARA ZERAR FILA */}
      {showResetModal && (
        <div className="fixed inset-0 bg-cmip-950/85 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-cmip-900 border border-cmip-600/50 p-6 rounded-3xl max-w-md w-full text-center space-y-5">
            <div className="w-12 h-12 bg-rose-950 text-rose-400 rounded-2xl flex items-center justify-center mx-auto border border-rose-800">
              <ShieldAlert className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-xl font-bold text-white">Zerar Todas as Filas?</h3>
              <p className="text-sm text-cmip-100/70 mt-2">
                Isso limpará os registros de chamadas ativas e o histórico do dia na TV e nos consultórios médicos.
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowResetModal(false)}
                className="flex-1 py-3 bg-cmip-950 hover:bg-cmip-800 text-cmip-100 font-bold rounded-xl"
              >
                Cancelar
              </button>
              <button
                onClick={handleResetAll}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl shadow-lg"
              >
                Sim, Limpar Tudo
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
