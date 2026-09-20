import NavigationHeader from './NavigationHeader';
import React, { useState, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  User,
  Plus,
  Tv,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Search,
  Filter,
  Phone,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  DollarSign,
  FileText,
  LogOut,
  MessageSquare
} from 'lucide-react';
import { fetchWithAuth } from '../utils/socket';

export default function AgendaCalendar({ user, onLogout, onNavigateChat, onNavigateTv }) {
  const [currentDate, setCurrentDate] = useState(new Date().toISOString().split('T')[0]);
  const [appointments, setAppointments] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState('all');
  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState(null);
  const [showNewModal, setShowNewModal] = useState(false);

  const [form, setForm] = useState({
    name: '',
    phone: '',
    doctorId: '',
    service: 'Consulta de Rotina',
    time: '09:00',
    duration: 30,
    roomNumber: '1',
    price: 150.00,
    insuranceType: 'PARTICULAR'
  });

  const showToast = (text, type = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const docQuery = selectedDoctorId !== 'all' ? '&doctorId=' + selectedDoctorId : '';
      const res = await fetchWithAuth('/api/medical?view=appointments&date=' + currentDate + docQuery);
      const data = await res.json();
      if (data.success) {
        setAppointments(data.appointments || []);
      }

      const setupRes = await fetchWithAuth('/api/medical?view=setup');
      const setupData = await setupRes.json();
      if (setupData.success) {
        setDoctors(setupData.doctors || []);
        if (!form.doctorId && setupData.doctors?.[0]) {
          setForm(f => ({ ...f, doctorId: setupData.doctors[0].id }));
        }
      }
    } catch (e) {
      showToast('Erro ao carregar dados da agenda', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [currentDate, selectedDoctorId]);

  const handleDateShift = (days) => {
    const d = new Date(currentDate + 'T12:00:00');
    d.setDate(d.getDate() + days);
    setCurrentDate(d.toISOString().split('T')[0]);
  };

  const handleUpdateStatus = async (appt, newStatus) => {
    try {
      const res = await fetchWithAuth('/api/medical?action=update-appointment-status', {
        method: 'POST',
        body: JSON.stringify({
          appointmentId: appt.id,
          status: newStatus,
          targetTv: appt.room_number === '2' || appt.room_number === '4' ? '2' : '1',
          roomNumber: appt.room_number || '1',
          doctorName: appt.doctor_name
        })
      });

      const data = await res.json();
      if (data.success) {
        setAppointments(prev => prev.map(a => a.id === appt.id ? { ...a, status: newStatus } : a));
        if (newStatus === 'CHECKIN') showToast('Check-in realizado para ' + appt.name + '!');
        if (newStatus === 'CHAMADO') showToast('Chamada enviada para as TVs CMIP!');
        if (newStatus === 'FINALIZADO') showToast('Atendimento finalizado com sucesso!');
      }
    } catch (e) {
      showToast('Erro ao atualizar status', 'error');
    }
  };

  const handleCreateAppointment = async (e) => {
    e.preventDefault();
    try {
      const doc = doctors.find(d => String(d.id) === String(form.doctorId));
      const res = await fetchWithAuth('/api/medical?action=create-appointment', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          professionalId: form.doctorId,
          doctorName: doc?.name || '',
          service: form.service,
          appointmentDate: currentDate,
          appointmentTime: form.time,
          durationMinutes: Number(form.duration),
          roomNumber: form.roomNumber,
          insuranceType: form.insuranceType,
          price: Number(form.price)
        })
      });

      const data = await res.json();
      if (data.success) {
        showToast('Agendamento registrado com sucesso!');
        setShowNewModal(false);
        setForm({
          name: '',
          phone: '',
          doctorId: doctors[0]?.id || '',
          service: 'Consulta de Rotina',
          time: '09:00',
          duration: 30,
          roomNumber: '1',
          price: 150.00,
          insuranceType: 'PARTICULAR'
        });
        loadData();
      } else {
        showToast(data.error || 'Erro ao registrar agendamento', 'error');
      }
    } catch (e) {
      showToast('Falha na comunicacao com o servidor', 'error');
    }
  };

  const totalCount = appointments.length;
  const checkinCount = appointments.filter(a => a.status === 'CHECKIN').length;
  const calledCount = appointments.filter(a => a.status === 'CHAMADO' || a.status === 'EM_ATENDIMENTO').length;
  const finishedCount = appointments.filter(a => a.status === 'FINALIZADO').length;

  return (
    <div className="min-h-screen bg-cmip-950 text-slate-100 flex flex-col font-['Montserrat',sans-serif]">
      {toastMessage && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border ${toastMessage.type === 'error' ? 'bg-rose-950 border-rose-600 text-rose-200' : 'bg-emerald-950 border-emerald-500 text-emerald-200'}`}>
          <Sparkles className="w-4 h-4" />
          <span className="text-xs font-bold">{toastMessage.text}</span>
        </div>
      )}

      <NavigationHeader user={user} activeModule="agenda" onLogout={onLogout} />

      <div className="p-6 max-w-7xl mx-auto w-full space-y-6">
        <div className="bg-cmip-900/60 border border-cmip-800 rounded-3xl p-4 flex flex-wrap items-center justify-between gap-4 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleDateShift(-1)}
              className="p-2 rounded-xl bg-cmip-800 hover:bg-cmip-700 border border-cmip-700 text-cmip-200 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <input
              type="date"
              value={currentDate}
              onChange={e => setCurrentDate(e.target.value)}
              className="bg-cmip-950 border border-cmip-700 rounded-xl px-4 py-2 text-xs font-black text-white focus:outline-none focus:border-cyan-500"
            />

            <button
              onClick={() => handleDateShift(1)}
              className="p-2 rounded-xl bg-cmip-800 hover:bg-cmip-700 border border-cmip-700 text-cmip-200 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <button
              onClick={() => setCurrentDate(new Date().toISOString().split('T')[0])}
              className="px-3 py-2 bg-cmip-800 hover:bg-cmip-700 text-cyan-300 border border-cmip-700 rounded-xl text-xs font-bold transition-colors"
            >
              Hoje
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-cmip-100/50" />
              <select
                value={selectedDoctorId}
                onChange={e => setSelectedDoctorId(e.target.value)}
                className="bg-cmip-950 border border-cmip-700 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="all">Todos os Profissionais</option>
                {doctors.map(d => (
                  <option key={d.id} value={d.id}>{d.name} ({d.specialty})</option>
                ))}
              </select>
            </div>

            <button
              onClick={loadData}
              className="p-2 rounded-xl bg-cmip-800 hover:bg-cmip-700 border border-cmip-700 text-cmip-200 transition-colors"
              title="Recarregar"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-cmip-900/50 border border-cmip-800 rounded-3xl p-4 flex items-center justify-between">
            <div>
              <div className="text-[10px] font-black text-cmip-100/60 uppercase">Agendados Hoje</div>
              <div className="text-2xl font-black text-white mt-1">{totalCount}</div>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-300">
              <CalendarIcon className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-cmip-900/50 border border-cmip-800 rounded-3xl p-4 flex items-center justify-between">
            <div>
              <div className="text-[10px] font-black text-amber-400/80 uppercase">Na Recepcao (Check-in)</div>
              <div className="text-2xl font-black text-amber-400 mt-1">{checkinCount}</div>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-300">
              <CheckCircle className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-cmip-900/50 border border-cmip-800 rounded-3xl p-4 flex items-center justify-between">
            <div>
              <div className="text-[10px] font-black text-emerald-400/80 uppercase">Em Atendimento / TV</div>
              <div className="text-2xl font-black text-emerald-400 mt-1">{calledCount}</div>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-300">
              <Tv className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-cmip-900/50 border border-cmip-800 rounded-3xl p-4 flex items-center justify-between">
            <div>
              <div className="text-[10px] font-black text-slate-400 uppercase">Finalizados</div>
              <div className="text-2xl font-black text-slate-300 mt-1">{finishedCount}</div>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400">
              <CheckCircle className="w-5 h-5" />
            </div>
          </div>
        </div>

        <div className="bg-cmip-900/40 border border-cmip-800 rounded-3xl overflow-hidden shadow-2xl">
          <div className="p-4 border-b border-cmip-800 bg-cmip-900/60 flex items-center justify-between">
            <h2 className="text-xs font-black text-white uppercase tracking-wider">
              Consultas para {currentDate.split('-').reverse().join('/')}
            </h2>
            <span className="text-xs text-cmip-100/50">{appointments.length} horarios cadastrados</span>
          </div>

          {appointments.length === 0 ? (
            <div className="p-12 text-center text-xs text-cmip-100/40 space-y-3">
              <CalendarIcon className="w-12 h-12 mx-auto opacity-20" />
              <p>Nenhum agendamento para esta data.</p>
              <button
                onClick={() => setShowNewModal(true)}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-bold"
              >
                Agendar Primeiro Paciente
              </button>
            </div>
          ) : (
            <div className="divide-y divide-cmip-800/60">
              {appointments.map(appt => {
                const isCheckin = appt.status === 'CHECKIN';
                const isCalled = appt.status === 'CHAMADO';
                const isFinished = appt.status === 'FINALIZADO';

                return (
                  <div
                    key={appt.id}
                    className="p-4 hover:bg-cmip-800/40 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-16 text-center">
                        <div className="text-base font-black text-cyan-300 font-mono">{appt.appointment_time}</div>
                        <div className="text-[10px] text-cmip-100/50">{appt.duration_minutes || 30} min</div>
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-black text-white">{appt.name || appt.patient?.full_name}</h3>
                          <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase bg-cmip-800 text-cmip-200 border border-cmip-700">
                            {appt.insurance_type || 'PARTICULAR'}
                          </span>
                        </div>

                        <div className="text-xs text-cmip-100/70 flex flex-wrap items-center gap-3">
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3 text-cyan-400" />
                            <strong>{appt.doctor_name || 'Profissional'}</strong>
                          </span>
                          <span>•</span>
                          <span>{appt.service}</span>
                          <span>•</span>
                          <span className="text-emerald-400 font-bold">Sala {appt.room_number}</span>
                          {appt.phone && (
                            <>
                              <span>•</span>
                              <span className="flex items-center gap-1 text-cmip-100/50">
                                <Phone className="w-3 h-3" /> {appt.phone}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider border ${
                        isFinished ? 'bg-slate-800 text-slate-400 border-slate-700' :
                        isCalled ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30 animate-pulse' :
                        isCheckin ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' :
                        'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                      }`}>
                        {appt.status}
                      </span>

                      {appt.status === 'AGENDADO' && (
                        <button
                          onClick={() => handleUpdateStatus(appt, 'CHECKIN')}
                          className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl shadow transition-transform active:scale-95 flex items-center gap-1"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>Fazer Check-in</span>
                        </button>
                      )}

                      {(appt.status === 'CHECKIN' || appt.status === 'AGENDADO') && (
                        <button
                          onClick={() => handleUpdateStatus(appt, 'CHAMADO')}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-xl shadow transition-transform active:scale-95 flex items-center gap-1"
                        >
                          <Tv className="w-3.5 h-3.5" />
                          <span>Chamar na TV</span>
                        </button>
                      )}

                      {appt.status === 'CHAMADO' && (
                        <button
                          onClick={() => handleUpdateStatus(appt, 'FINALIZADO')}
                          className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold rounded-xl transition-transform active:scale-95"
                        >
                          Finalizar
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showNewModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-cmip-900 border border-cmip-700 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-fade-in">
            <div className="flex items-center justify-between border-b border-cmip-800 pb-3">
              <h3 className="text-sm font-black text-white uppercase flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-cyan-400" />
                <span>Novo Agendamento na Grade</span>
              </h3>
              <button onClick={() => setShowNewModal(false)} className="text-cmip-100/60 hover:text-white text-xs">✕</button>
            </div>

            <form onSubmit={handleCreateAppointment} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-cmip-200 mb-1">Nome do Paciente</label>
                <input
                  type="text"
                  required
                  placeholder="Nome completo..."
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-cmip-950 border border-cmip-700 rounded-xl p-2.5 text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-cmip-200 mb-1">WhatsApp / Telefone</label>
                <input
                  type="text"
                  required
                  placeholder="5511999999999"
                  value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                  className="w-full bg-cmip-950 border border-cmip-700 rounded-xl p-2.5 text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-cmip-200 mb-1">Profissional / Medico</label>
                <select
                  value={form.doctorId}
                  onChange={e => setForm({ ...form, doctorId: e.target.value })}
                  className="w-full bg-cmip-950 border border-cmip-700 rounded-xl p-2.5 text-white"
                >
                  {doctors.map(d => (
                    <option key={d.id} value={d.id}>{d.name} ({d.specialty})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-cmip-200 mb-1">Horario</label>
                  <input
                    type="time"
                    value={form.time}
                    onChange={e => setForm({ ...form, time: e.target.value })}
                    className="w-full bg-cmip-950 border border-cmip-700 rounded-xl p-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-cmip-200 mb-1">Consultorio</label>
                  <select
                    value={form.roomNumber}
                    onChange={e => setForm({ ...form, roomNumber: e.target.value })}
                    className="w-full bg-cmip-950 border border-cmip-700 rounded-xl p-2 text-white"
                  >
                    <option value="1">Consultorio 01 (Terreo)</option>
                    <option value="2">Consultorio 02 (1º Andar)</option>
                    <option value="3">Consultorio 03 (Terreo)</option>
                    <option value="4">Consultorio 04 (1º Andar)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-cmip-200 mb-1">Servico / Procedimento</label>
                <input
                  type="text"
                  value={form.service}
                  onChange={e => setForm({ ...form, service: e.target.value })}
                  className="w-full bg-cmip-950 border border-cmip-700 rounded-xl p-2 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-cmip-200 mb-1">Valor (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.price}
                    onChange={e => setForm({ ...form, price: e.target.value })}
                    className="w-full bg-cmip-950 border border-cmip-700 rounded-xl p-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-cmip-200 mb-1">Convenio</label>
                  <select
                    value={form.insuranceType}
                    onChange={e => setForm({ ...form, insuranceType: e.target.value })}
                    className="w-full bg-cmip-950 border border-cmip-700 rounded-xl p-2 text-white"
                  >
                    <option value="PARTICULAR">PARTICULAR</option>
                    <option value="UNIMED">UNIMED</option>
                    <option value="BRADESCO">BRADESCO SAUDE</option>
                    <option value="AMIL">AMIL</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="flex-1 py-2.5 bg-cmip-950 hover:bg-cmip-800 text-cmip-200 rounded-xl font-bold border border-cmip-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-black rounded-xl shadow-lg"
                >
                  Confirmar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}