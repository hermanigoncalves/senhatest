import React, { useState, useEffect } from 'react';
import { 
  fetchDoctorQueue, callPatient, repeatPatientCall, updatePatientStatus, socket, fetchDoctorsList 
} from '../utils/socket';
import { 
  Stethoscope, Bell, RotateCcw, CheckCircle2, UserX, Clock, Star, Users, 
  Tv, LogOut, Activity, Sparkles, RefreshCw, CheckCheck, Monitor
} from 'lucide-react';

export default function DoctorPanel({ user, onLogout, onNavigateTv }) {
  const doctorId = user?.doctorId || user?.doctor_id || user?.id || 1;
  const doctorName = user?.name || 'Dr. Médico';
  const initialOffice = user?.doctor?.office_name || 'Consultório CMIP';

  const [officeName, setOfficeName] = useState(initialOffice);
  const [targetTv, setTargetTv] = useState('1');
  const [queue, setQueue] = useState([]);
  const [callingId, setCallingId] = useState(null);
  const [activePatient, setActivePatient] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  // Busca dados do médico logado para obter a TV e consultório exatos
  const loadDoctorInfo = async () => {
    try {
      const res = await fetchDoctorsList();
      if (res?.doctors) {
        const currentDoc = res.doctors.find(d => d.id === doctorId || d.name === doctorName);
        if (currentDoc) {
          if (currentDoc.office_name) setOfficeName(currentDoc.office_name);
          if (currentDoc.office?.target_tv) setTargetTv(currentDoc.office.target_tv);
        }
      }
    } catch (e) {}
  };

  const loadQueue = async () => {
    const res = await fetchDoctorQueue(doctorId);
    if (res?.success && res.queue) {
      setQueue(res.queue);
      const inProgress = res.queue.find(p => p.status === 'in_progress' || p.status === 'called');
      if (inProgress) setActivePatient(inProgress);
    }
  };

  useEffect(() => {
    loadDoctorInfo();
    loadQueue();

    // Sincronização em tempo real via Socket
    const handlePatientRegistered = () => loadQueue();
    const handleStatusUpdated = () => loadQueue();

    socket.on('patient-registered', handlePatientRegistered);
    socket.on('status-updated', handleStatusUpdated);

    // Polling resiliente a cada 2.5s
    const interval = setInterval(loadQueue, 2500);

    return () => {
      socket.off('patient-registered', handlePatientRegistered);
      socket.off('status-updated', handleStatusUpdated);
      clearInterval(interval);
    };
  }, [doctorId]);

  const handleCall = async (item) => {
    setCallingId(item.id);
    setLoading(true);
    setMsg(`Chamando ${item.patient_name} na TV ${item.target_tv === '2' ? '02' : '01'}...`);

    const res = await callPatient(item.id, doctorId);
    setLoading(false);
    setCallingId(null);

    if (res?.success) {
      setActivePatient({ ...item, status: 'called' });
      loadQueue();
      setTimeout(() => setMsg(''), 4000);
    }
  };

  const handleRepeat = async (item) => {
    if (!item) return;
    setCallingId(item.id);
    setMsg(`Rechamando ${item.patient_name} na TV...`);

    const res = await repeatPatientCall(item.id);
    setCallingId(null);

    if (res?.success) {
      setTimeout(() => setMsg(''), 4000);
    }
  };

  const handleStartAttendance = async (item) => {
    await updatePatientStatus(item.id, 'in_progress');
    setActivePatient({ ...item, status: 'in_progress' });
    loadQueue();
    setMsg(`Consulta iniciada com ${item.patient_name}.`);
    setTimeout(() => setMsg(''), 3000);
  };

  const handleFinishAttendance = async (item) => {
    await updatePatientStatus(item.id, 'completed');
    setActivePatient(null);
    loadQueue();
    setMsg(`Consulta com ${item.patient_name} finalizada com sucesso.`);
    setTimeout(() => setMsg(''), 3500);
  };

  const handleMarkAbsent = async (item) => {
    await updatePatientStatus(item.id, 'absent');
    setActivePatient(null);
    loadQueue();
    setMsg(`Paciente ${item.patient_name} marcado como ausente.`);
    setTimeout(() => setMsg(''), 3000);
  };

  const waitingPatients = queue.filter(p => p.status === 'waiting');

  const tvBadgeLabel = targetTv === '2' ? 'TV 02 (1º Andar)' : targetTv === 'all' ? 'Ambas as TVs' : 'TV 01 (Térreo)';

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
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-black uppercase flex items-center gap-1">
                  <Stethoscope className="w-3 h-3" />
                  Painel do Médico
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-cmip-500/20 text-cmip-400 border border-cmip-500/30 text-[10px] font-black uppercase">
                  {officeName}
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-black uppercase flex items-center gap-1">
                  <Monitor className="w-3 h-3" />
                  {tvBadgeLabel}
                </span>
              </div>
              <h1 className="text-xl md:text-2xl font-black text-white uppercase tracking-tight mt-1">
                {doctorName}
              </h1>
              <p className="text-xs text-cmip-100/70">Gestão de fila de espera e chamada por voz na {tvBadgeLabel}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadQueue}
              className="p-2.5 bg-cmip-950 hover:bg-cmip-800 text-cmip-100 rounded-xl border border-cmip-600/40 transition-colors"
              title="Atualizar Fila"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            <button
              onClick={onNavigateTv}
              className="px-4 py-2.5 bg-cmip-950 hover:bg-cmip-800 text-cmip-400 font-bold text-xs rounded-xl border border-cmip-600/40 flex items-center gap-2 transition-colors shadow-md"
            >
              <Tv className="w-4 h-4" />
              <span>Abrir TV</span>
            </button>

            <button
              onClick={onLogout}
              className="px-4 py-2.5 bg-rose-950/80 hover:bg-rose-900 text-rose-300 font-bold text-xs rounded-xl border border-rose-800/40 flex items-center gap-2 transition-colors shadow-md"
            >
              <LogOut className="w-4 h-4" />
              <span>Sair</span>
            </button>
          </div>
        </header>

        {/* NOTIFICAÇÃO */}
        {msg && (
          <div className="p-4 rounded-2xl bg-cyan-950/90 border border-cyan-500/50 text-cyan-200 text-sm font-bold flex items-center gap-3 shadow-xl animate-fade-in">
            <Sparkles className="w-5 h-5 text-cyan-400 shrink-0" />
            <span>{msg}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* PACIENTE EM ATENDIMENTO / CHAMADO */}
          <div className="lg:col-span-6 space-y-6">
            
            <div className="bg-cmip-900/80 border border-cmip-600/40 p-6 md:p-8 rounded-3xl glass-panel space-y-6 shadow-2xl relative overflow-hidden">
              <div className="flex items-center justify-between border-b border-cmip-600/30 pb-4">
                <span className="text-xs font-bold text-cmip-400 uppercase tracking-widest flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  Paciente em Foco / Chamado
                </span>
                {activePatient && (
                  <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${
                    activePatient.status === 'in_progress'
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-amber-400 text-slate-950 animate-pulse'
                  }`}>
                    {activePatient.status === 'in_progress' ? 'Em Atendimento' : 'Chamando na TV'}
                  </span>
                )}
              </div>

              {activePatient ? (
                <div className="space-y-6">
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="text-2xl md:text-3xl font-black text-white">{activePatient.patient_name}</h2>
                      {activePatient.type === 'Preferencial' && (
                        <span className="px-2.5 py-1 rounded-lg bg-amber-400 text-slate-950 text-xs font-black uppercase flex items-center gap-1 shadow">
                          <Star className="w-3.5 h-3.5 fill-current" />
                          Preferencial
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-cmip-100/70 mt-1">
                      Destino: <strong>{activePatient.office_name}</strong> | Transmissão: <strong className="text-cyan-300">{activePatient.target_tv === '2' ? 'TV 02' : 'TV 01'}</strong>
                    </p>
                  </div>

                  {/* AÇÕES NO PACIENTE ATIVO */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <button
                      onClick={() => handleRepeat(activePatient)}
                      disabled={loading}
                      className="py-3.5 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm rounded-xl flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-[0.98]"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>RECHAMAR NA TV</span>
                    </button>

                    {activePatient.status !== 'in_progress' ? (
                      <button
                        onClick={() => handleStartAttendance(activePatient)}
                        className="py-3.5 px-4 bg-cmip-500 hover:bg-cmip-400 text-cmip-950 font-black text-sm rounded-xl flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-[0.98]"
                      >
                        <Activity className="w-4 h-4" />
                        <span>INICIAR CONSULTA</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleFinishAttendance(activePatient)}
                        className="py-3.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm rounded-xl flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-[0.98]"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>FINALIZAR CONSULTA</span>
                      </button>
                    )}

                    <button
                      onClick={() => handleMarkAbsent(activePatient)}
                      className="sm:col-span-2 py-2.5 px-4 bg-cmip-950 hover:bg-rose-950/80 text-rose-300 border border-rose-800/40 text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-colors"
                    >
                      <UserX className="w-4 h-4" />
                      <span>Marcar como Ausente / Cancelar</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-cmip-100/50 space-y-3">
                  <Stethoscope className="w-12 h-12 mx-auto text-cmip-100/20" />
                  <p className="text-sm font-semibold text-slate-300">Nenhum paciente chamado no momento.</p>
                  <p className="text-xs text-cmip-100/60">Selecione um paciente na fila ao lado para chamar na TV.</p>
                </div>
              )}
            </div>

          </div>

          {/* FILA DE ESPERA DO MÉDICO */}
          <div className="lg:col-span-6 space-y-6">
            
            <div className="bg-cmip-900/80 border border-cmip-600/30 p-6 md:p-8 rounded-3xl glass-panel space-y-4 shadow-2xl">
              
              <div className="flex items-center justify-between border-b border-cmip-600/30 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-cmip-500/20 text-cmip-400 rounded-xl">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white uppercase tracking-wider">Fila de Espera</h3>
                    <p className="text-xs text-cmip-100/70">{waitingPatients.length} paciente(s) aguardando atendimento</p>
                  </div>
                </div>

                {waitingPatients.length > 0 && (
                  <button
                    onClick={() => handleCall(waitingPatients[0])}
                    disabled={loading || callingId !== null}
                    className="px-4 py-2.5 bg-gradient-to-r from-cmip-500 to-cmip-600 hover:from-cmip-400 hover:to-cmip-500 text-cmip-950 font-black text-xs rounded-xl shadow-lg flex items-center gap-2 transition-transform active:scale-95 disabled:opacity-50"
                  >
                    <Bell className="w-4 h-4" />
                    <span>CHAMAR PRÓXIMO</span>
                  </button>
                )}
              </div>

              {/* LISTAGEM DE PACIENTES NA FILA */}
              <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
                {waitingPatients.map((item, idx) => (
                  <div
                    key={item.id}
                    className={`p-4 rounded-2xl border transition-all flex items-center justify-between gap-4 ${
                      item.type === 'Preferencial'
                        ? 'bg-amber-950/40 border-amber-500/40 hover:border-amber-400'
                        : 'bg-cmip-950/80 border-cmip-600/30 hover:border-cmip-500/50'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-cmip-400">#{idx + 1}</span>
                        <h4 className="font-bold text-white text-base">{item.patient_name}</h4>
                        {item.type === 'Preferencial' && (
                          <span className="px-2 py-0.5 rounded bg-amber-400 text-slate-950 text-[10px] font-black uppercase flex items-center gap-1 shadow">
                            <Star className="w-3 h-3 fill-current" />
                            Preferencial
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-cmip-100/60 mt-1">
                        Encaminhado às {new Date(item.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>

                    <button
                      onClick={() => handleCall(item)}
                      disabled={loading || callingId === item.id}
                      className="px-4 py-2.5 bg-cmip-500 hover:bg-cmip-400 text-cmip-950 font-black text-xs rounded-xl shadow flex items-center gap-1.5 shrink-0 transition-transform active:scale-95"
                    >
                      <Bell className="w-3.5 h-3.5" />
                      <span>Chamar</span>
                    </button>
                  </div>
                ))}

                {waitingPatients.length === 0 && (
                  <div className="py-16 text-center text-cmip-100/50 space-y-2">
                    <CheckCircle2 className="w-10 h-10 mx-auto text-cmip-400/30" />
                    <p className="text-sm font-semibold text-slate-300">Nenhum paciente aguardando na fila!</p>
                    <p className="text-xs text-cmip-100/60">Novos pacientes cadastrados pela recepção aparecerão aqui em tempo real.</p>
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
