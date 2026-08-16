import React, { useState, useEffect } from 'react';
import { fetchOfficesAndDoctors, registerPatientCall } from '../utils/socket';
import { 
  UserPlus, Users, Stethoscope, Star, CheckCircle, AlertCircle, Clock, 
  Send, Tv, LogOut, UserCheck, RefreshCw, Monitor, DoorOpen, ExternalLink
} from 'lucide-react';

export default function ReceptionPanel({ 
  user, 
  onLogout, 
  onNavigateTv, 
  onNavigateAttendant, 
  onNavigateAdmin 
}) {
  const [patientName, setPatientName] = useState('');
  const [document, setDocument] = useState('');
  const [phone, setPhone] = useState('');
  const [priorityType, setPriorityType] = useState('Normal'); // 'Normal' ou 'Preferencial'
  
  const [offices, setOffices] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState('');

  const [loading, setLoading] = useState(false);
  const [loadingSetup, setLoadingSetup] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [recentPatients, setRecentPatients] = useState([]);

  const loadData = async () => {
    setLoadingSetup(true);
    const res = await fetchOfficesAndDoctors();
    setLoadingSetup(false);

    if (res?.doctors) {
      const activeDocs = res.doctors.filter(d => d.active !== false);
      setDoctors(activeDocs);
      if (activeDocs.length > 0 && !selectedDoctorId) {
        setSelectedDoctorId(String(activeDocs[0].id));
      }
    }
    if (res?.offices) {
      setOffices(res.offices);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const selectedDoctor = doctors.find(d => String(d.id) === String(selectedDoctorId));

  const openTvTab = (tvPath) => {
    if (typeof window !== 'undefined') {
      window.open(tvPath, '_blank');
    }
  };

  const handleRegister = async (e) => {
    e?.preventDefault();
    if (!patientName.trim()) {
      setErrorMsg('Por favor, informe o nome completo do paciente.');
      return;
    }

    if (!selectedDoctorId) {
      setErrorMsg('Por favor, selecione um médico ativo.');
      return;
    }

    const doctorName = selectedDoctor ? selectedDoctor.name : 'Médico de Plantão';
    const officeName = selectedDoctor?.office_name || selectedDoctor?.office?.name || 'Consultório';
    const targetTv = selectedDoctor?.office?.target_tv || '1';

    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    const res = await registerPatientCall({
      patientName: patientName.trim(),
      document: document.trim(),
      phone: phone.trim(),
      doctorId: parseInt(selectedDoctorId, 10),
      doctorName: doctorName,
      officeName: officeName,
      targetTv: targetTv,
      type: priorityType,
      createdBy: user?.name || 'Recepção'
    });

    setLoading(false);

    if (res?.success) {
      const tvLabel = targetTv === '2' ? 'TV 02 (1º Andar)' : targetTv === 'all' ? 'Ambas as TVs' : 'TV 01 (Térreo)';
      
      const newEntry = {
        id: res.call?.id || Date.now(),
        name: patientName.trim(),
        doctor: doctorName,
        office: officeName,
        tv: tvLabel,
        type: priorityType,
        time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      };

      setRecentPatients(prev => [newEntry, ...prev.slice(0, 8)]);
      setSuccessMsg(`Paciente ${patientName.trim()} encaminhado com sucesso para ${doctorName} (${officeName} • ${tvLabel})!`);
      
      // Limpa os campos
      setPatientName('');
      setDocument('');
      setPhone('');
      setPriorityType('Normal');

      setTimeout(() => setSuccessMsg(''), 5000);
    } else {
      setErrorMsg(res?.message || 'Erro ao encaminhar paciente para o médico.');
    }
  };

  return (
    <div className="min-h-screen bg-cmip-950 text-slate-100 font-['Montserrat',sans-serif] p-4 md:p-8 cmip-plus-pattern relative">
      <div className="max-w-7xl mx-auto space-y-8 relative z-10">
        
        {/* CABEÇALHO COM ATALHOS DE TV */}
        <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 p-6 bg-cmip-900/90 border border-cmip-600/30 rounded-3xl shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-5">
            <div className="bg-white p-3 rounded-2xl shadow-lg border border-cmip-100 max-w-[180px]">
              <img src="/logo.png" alt="CMIP Logo" className="h-10 object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-black uppercase">
                  Recepção / Encaminhamento Direto
                </span>
              </div>
              <h1 className="text-xl md:text-2xl font-black text-white uppercase tracking-tight mt-1">
                Cadastro Imediato de Pacientes
              </h1>
              <p className="text-xs text-cmip-100/70">Encaminhamento em tempo real para a fila do médico sem triagem</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={loadData}
              className="p-2.5 bg-cmip-950 hover:bg-cmip-800 text-cmip-100 rounded-xl border border-cmip-600/40 transition-colors"
              title="Atualizar Médicos"
            >
              <RefreshCw className={`w-4 h-4 ${loadingSetup ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={() => openTvTab('/tv-recepcao')}
              className="px-3.5 py-2 bg-emerald-950 hover:bg-emerald-900 text-emerald-300 font-bold text-xs rounded-xl border border-emerald-600/40 flex items-center gap-1.5 transition-colors shadow"
              title="Abrir TV da Recepção"
            >
              <Users className="w-3.5 h-3.5 text-emerald-400" />
              <span>TV Recepção</span>
              <ExternalLink className="w-3 h-3 opacity-60" />
            </button>

            <button
              onClick={() => openTvTab('/tv1')}
              className="px-3.5 py-2 bg-cyan-950 hover:bg-cyan-900 text-cyan-300 font-bold text-xs rounded-xl border border-cyan-600/40 flex items-center gap-1.5 transition-colors shadow"
              title="Abrir TV Consultórios 01"
            >
              <DoorOpen className="w-3.5 h-3.5 text-cyan-400" />
              <span>TV 01 (Térreo)</span>
              <ExternalLink className="w-3 h-3 opacity-60" />
            </button>

            <button
              onClick={() => openTvTab('/tv2')}
              className="px-3.5 py-2 bg-purple-950 hover:bg-purple-900 text-purple-300 font-bold text-xs rounded-xl border border-purple-600/40 flex items-center gap-1.5 transition-colors shadow"
              title="Abrir TV Consultórios 02"
            >
              <DoorOpen className="w-3.5 h-3.5 text-purple-400" />
              <span>TV 02 (1º Andar)</span>
              <ExternalLink className="w-3 h-3 opacity-60" />
            </button>

            <button
              onClick={onLogout}
              className="px-3.5 py-2 bg-rose-950/80 hover:bg-rose-900 text-rose-300 font-bold text-xs rounded-xl border border-rose-800/40 flex items-center gap-1.5 transition-colors shadow ml-2"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sair</span>
            </button>
          </div>
        </header>

        {/* MENSAGENS DE STATUS */}
        {successMsg && (
          <div className="p-4 rounded-2xl bg-emerald-950/90 border border-emerald-500/50 text-emerald-200 text-sm font-bold flex items-center gap-3 shadow-xl animate-fade-in">
            <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="p-4 rounded-2xl bg-rose-950/90 border border-rose-500/50 text-rose-200 text-sm font-bold flex items-center gap-3 shadow-xl">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* GRID PRINCIPAL */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* FORMULÁRIO DE CADASTRO */}
          <div className="lg:col-span-7 bg-cmip-900/80 border border-cmip-600/30 p-6 md:p-8 rounded-3xl glass-panel space-y-6 shadow-2xl">
            
            <div className="flex items-center gap-3 border-b border-cmip-600/30 pb-4">
              <div className="p-2.5 bg-cmip-500/20 text-cmip-400 rounded-xl">
                <UserPlus className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Cadastrar Paciente na Fila do Médico</h2>
                <p className="text-xs text-cmip-100/70">O paciente será adicionado em tempo real no painel do consultório</p>
              </div>
            </div>

            <form onSubmit={handleRegister} className="space-y-5">
              
              {/* NOME COMPLETO */}
              <div>
                <label className="block text-xs font-bold text-cmip-100 uppercase tracking-wider mb-2">
                  Nome Completo do Paciente <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ex: João da Silva Santos"
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  className="w-full bg-cmip-950 border border-cmip-500/40 text-white rounded-xl px-4 py-3.5 text-base font-bold focus:outline-none focus:border-cmip-400 placeholder:text-cmip-100/30 shadow-inner"
                  autoFocus
                />
              </div>

              {/* SELETOR DE MÉDICO / CONSULTÓRIO */}
              <div>
                <label className="block text-xs font-bold text-cmip-100 uppercase tracking-wider mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Stethoscope className="w-4 h-4 text-cmip-400" />
                    Médico / Consultório de Destino <span className="text-rose-400">*</span>
                  </span>
                  {selectedDoctor && (
                    <span className="text-[11px] font-bold text-cyan-300">
                      Destino: {selectedDoctor.office_name || 'Consultório'}
                    </span>
                  )}
                </label>

                <select
                  value={selectedDoctorId}
                  onChange={(e) => setSelectedDoctorId(e.target.value)}
                  className="w-full bg-cmip-950 border border-cmip-500/40 text-white rounded-xl px-4 py-3.5 text-sm font-bold focus:outline-none focus:border-cmip-400 shadow-inner"
                >
                  {doctors.map(doc => (
                    <option key={doc.id} value={doc.id}>
                      {doc.name} — {doc.specialty || 'Geral'} ({doc.office_name || 'Consultório'})
                    </option>
                  ))}
                </select>
              </div>

              {/* SELEÇÃO DE PRIORIDADE */}
              <div>
                <label className="block text-xs font-bold text-cmip-100 uppercase tracking-wider mb-2">
                  Prioridade de Atendimento
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPriorityType('Normal')}
                    className={`py-3 px-4 rounded-xl border text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                      priorityType === 'Normal'
                        ? 'bg-cmip-800 text-white border-cmip-400 shadow-lg scale-[1.02]'
                        : 'bg-cmip-950 text-cmip-100/60 border-cmip-600/30 hover:bg-cmip-900'
                    }`}
                  >
                    <Users className="w-4 h-4" />
                    <span>Atendimento Normal</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPriorityType('Preferencial')}
                    className={`py-3 px-4 rounded-xl border text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                      priorityType === 'Preferencial'
                        ? 'bg-amber-500 text-slate-950 border-amber-300 shadow-lg scale-[1.02]'
                        : 'bg-cmip-950 text-amber-400/70 border-amber-600/30 hover:bg-cmip-900'
                    }`}
                  >
                    <Star className="w-4 h-4 fill-current" />
                    <span>Preferencial (Idoso/PCD)</span>
                  </button>
                </div>
              </div>

              {/* CAMPOS OPCIONAIS (CPF / TELEFONE) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-cmip-100 uppercase tracking-wider mb-1.5">
                    CPF / Documento (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="000.000.000-00"
                    value={document}
                    onChange={(e) => setDocument(e.target.value)}
                    className="w-full bg-cmip-950 border border-cmip-600/30 text-white rounded-xl px-3.5 py-2.5 text-xs font-semibold focus:outline-none focus:border-cmip-400 placeholder:text-cmip-100/30"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-cmip-100 uppercase tracking-wider mb-1.5">
                    Telefone / Celular (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="(00) 00000-0000"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-cmip-950 border border-cmip-600/30 text-white rounded-xl px-3.5 py-2.5 text-xs font-semibold focus:outline-none focus:border-cmip-400 placeholder:text-cmip-100/30"
                  />
                </div>
              </div>

              {/* BOTÃO SUBMIT */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-gradient-to-r from-cmip-500 to-cmip-600 hover:from-cmip-400 hover:to-cmip-500 text-cmip-950 font-black text-lg rounded-2xl shadow-xl shadow-cmip-500/25 flex items-center justify-center gap-3 transition-all hover:scale-[1.01] active:scale-[0.98] disabled:opacity-50"
              >
                <Send className="w-5 h-5" />
                <span>{loading ? 'Encaminhando...' : 'CADASTRAR E ENVIAR PARA O MÉDICO'}</span>
              </button>

            </form>

          </div>

          {/* PAINEL LATERAL: ÚLTIMOS CADASTRADOS */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-cmip-900/80 border border-cmip-600/30 p-6 rounded-3xl glass-panel space-y-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-cmip-600/30 pb-3">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Clock className="w-4 h-4 text-cmip-400" />
                  Últimos Pacientes Encaminhados
                </h3>
                <span className="text-[10px] bg-cmip-500/20 text-cmip-400 px-2 py-0.5 rounded-full font-bold">
                  Hoje
                </span>
              </div>

              <div className="space-y-2.5 max-h-[450px] overflow-y-auto pr-1">
                {recentPatients.map((p, idx) => (
                  <div 
                    key={p.id || idx}
                    className="p-3.5 rounded-2xl bg-cmip-950/80 border border-cmip-600/30 flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">{p.name}</span>
                        {p.type === 'Preferencial' && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 text-[9px] font-black uppercase">
                            Pref
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-cmip-100/70 mt-0.5">
                        Destino: <strong className="text-cmip-400">{p.doctor}</strong> ({p.office} • <span className="text-cyan-300">{p.tv}</span>)
                      </div>
                    </div>
                    <span className="text-[11px] font-mono text-cmip-100/60 font-semibold">{p.time}</span>
                  </div>
                ))}

                {recentPatients.length === 0 && (
                  <div className="py-12 text-center text-cmip-100/50 text-xs font-medium space-y-2">
                    <UserCheck className="w-8 h-8 mx-auto text-cmip-100/30" />
                    <p>Nenhum paciente cadastrado nesta sessão.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
