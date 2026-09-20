import NavigationHeader from './NavigationHeader';
import React, { useState, useEffect } from 'react';
import {
  FileText,
  User,
  Shield,
  Lock,
  Activity,
  Save,
  Clock,
  Sparkles,
  CheckCircle,
  AlertCircle,
  Heart,
  Brain,
  Apple,
  Plus,
  ChevronRight,
  Printer,
  LogOut
} from 'lucide-react';
import { fetchWithAuth } from '../utils/socket';

export default function MedicalRecordForm({ user, patient, appointmentId, onLogout, onBack }) {
  const [specialty, setSpecialty] = useState(user?.specialty || 'MEDICINA');
  const [isConfidential, setIsConfidential] = useState(specialty === 'PSICOLOGIA');
  const [cid10, setCid10] = useState('');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [specialtyData, setSpecialtyData] = useState({});
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (text, type = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadHistory = async () => {
    if (!patient?.id) return;
    try {
      const res = await fetchWithAuth('/api/medical?view=medical-records&patientId=' + patient.id);
      const data = await res.json();
      if (data.success) setHistory(data.records || []);
    } catch (e) {
      console.error('Erro ao carregar historico:', e);
    }
  };

  useEffect(() => {
    loadHistory();
  }, [patient?.id]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!clinicalNotes.trim()) {
      showToast('Preencha a evolucao clinica antes de salvar', 'error');
      return;
    }

    try {
      setLoading(true);
      const res = await fetchWithAuth('/api/medical?action=save-medical-record', {
        method: 'POST',
        body: JSON.stringify({
          appointmentId: appointmentId || null,
          patientId: patient?.id,
          professionalId: user?.doctor_id || 1,
          specialty: specialty,
          isConfidential: isConfidential,
          cid10Code: cid10,
          clinicalNotes: clinicalNotes,
          specialtyData: specialtyData
        })
      });

      const data = await res.json();
      if (data.success) {
        showToast('Prontuario registrado com sucesso no banco seguro!');
        setClinicalNotes('');
        setCid10('');
        setSpecialtyData({});
        loadHistory();
      } else {
        showToast(data.error || 'Erro ao salvar prontuario', 'error');
      }
    } catch (err) {
      showToast('Falha na conexao com o servidor', 'error');
    } finally {
      setLoading(false)
    }
  };

  return (
    <div className="min-h-screen bg-cmip-950 text-slate-100 flex flex-col font-['Montserrat',sans-serif]">
      {toastMessage && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border ${toastMessage.type === 'error' ? 'bg-rose-950 border-rose-600 text-rose-200' : 'bg-emerald-950 border-emerald-500 text-emerald-200'}`}>
          <Sparkles className="w-4 h-4" />
          <span className="text-xs font-bold">{toastMessage.text}</span>
        </div>
      )}

      <NavigationHeader user={user} activeModule="prontuario" onLogout={onLogout} />

      <div className="p-6 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-cmip-900/60 border border-cmip-800 rounded-3xl p-6 space-y-6 backdrop-blur-sm shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-cmip-800 pb-4">
              <div className="flex gap-2">
                {['MEDICINA', 'PSICOLOGIA', 'NUTRICAO', 'FISIOTERAPIA'].map(spec => (
                  <button
                    key={spec}
                    type="button"
                    onClick={() => {
                      setSpecialty(spec);
                      setIsConfidential(spec === 'PSICOLOGIA');
                    }}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all border ${
                      specialty === spec ? 'bg-cyan-600 text-white border-cyan-500 shadow-lg' : 'bg-cmip-950 text-cmip-100/60 border-cmip-800 hover:bg-cmip-800'
                    }`}
                  >
                    {spec}
                  </button>
                ))}
              </div>

              {specialty === 'PSICOLOGIA' && (
                <div className="flex items-center gap-2 px-3 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl text-[11px] font-bold">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Sigilo Etico CFP (RLS Ativo)</span>
                </div>
              )}
            </div>

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              {specialty === 'MEDICINA' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-cmip-200 mb-1">CID-10 Principal</label>
                    <input
                      type="text"
                      placeholder="Ex: J00, I10, E11..."
                      value={cid10}
                      onChange={e => setCid10(e.target.value)}
                      className="w-full bg-cmip-950 border border-cmip-700 rounded-xl p-2.5 text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-cmip-200 mb-1">Pressao Arterial / Sinais Vitais</label>
                    <input
                      type="text"
                      placeholder="Ex: PA 120/80 mmHg, FC 75 bpm"
                      value={specialtyData.vitals || ''}
                      onChange={e => setSpecialtyData({ ...specialtyData, vitals: e.target.value })}
                      className="w-full bg-cmip-950 border border-cmip-700 rounded-xl p-2.5 text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>
              )}

              {specialty === 'NUTRICAO' && (
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-cmip-200 mb-1">Peso (kg)</label>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="70.5"
                      value={specialtyData.weight || ''}
                      onChange={e => setSpecialtyData({ ...specialtyData, weight: e.target.value })}
                      className="w-full bg-cmip-950 border border-cmip-700 rounded-xl p-2 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-cmip-200 mb-1">Altura (m)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="1.75"
                      value={specialtyData.height || ''}
                      onChange={e => setSpecialtyData({ ...specialtyData, height: e.target.value })}
                      className="w-full bg-cmip-950 border border-cmip-700 rounded-xl p-2 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-cmip-200 mb-1">% Gordura</label>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="18.5"
                      value={specialtyData.bodyFat || ''}
                      onChange={e => setSpecialtyData({ ...specialtyData, bodyFat: e.target.value })}
                      className="w-full bg-cmip-950 border border-cmip-700 rounded-xl p-2 text-white"
                    />
                  </div>
                </div>
              )}

              {specialty === 'FISIOTERAPIA' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-cmip-200 mb-1">Escala Visual de Dor (EVA 0-10)</label>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      placeholder="0 a 10"
                      value={specialtyData.painScale || ''}
                      onChange={e => setSpecialtyData({ ...specialtyData, painScale: e.target.value })}
                      className="w-full bg-cmip-950 border border-cmip-700 rounded-xl p-2 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-cmip-200 mb-1">Segmento / Articulacao</label>
                    <input
                      type="text"
                      placeholder="Ex: Joelho D, Lombar..."
                      value={specialtyData.joint || ''}
                      onChange={e => setSpecialtyData({ ...specialtyData, joint: e.target.value })}
                      className="w-full bg-cmip-950 border border-cmip-700 rounded-xl p-2 text-white"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-cmip-200 mb-1">Evolucao Clinica & Conduta Terapeutica</label>
                <textarea
                  rows={6}
                  required
                  placeholder="Descreva a queixa, exame, prescricao ou reflexoes da sessao..."
                  value={clinicalNotes}
                  onChange={e => setClinicalNotes(e.target.value)}
                  className="w-full bg-cmip-950 border border-cmip-700 rounded-2xl p-4 text-white focus:outline-none focus:border-cyan-500 leading-relaxed font-sans"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-black rounded-2xl text-xs flex items-center gap-2 shadow-xl transition-transform active:scale-95"
                >
                  <Save className="w-4 h-4" />
                  <span>{loading ? 'Gravando...' : 'Salvar no Prontuario'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-cmip-900/60 border border-cmip-800 rounded-3xl p-4 backdrop-blur-sm shadow-xl">
            <h3 className="text-xs font-black text-white uppercase tracking-wider mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-cyan-400" />
              <span>Historico de Evolucoes</span>
            </h3>

            {history.length === 0 ? (
              <p className="text-xs text-cmip-100/40 py-6 text-center">Nenhum registro anterior localizado para este paciente.</p>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto divide-y divide-cmip-800/60 pr-1">
                {history.map(rec => (
                  <div key={rec.id} className="pt-3 first:pt-0 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between text-[10px] text-cmip-100/60 font-bold">
                      <span className="px-2 py-0.5 rounded-md bg-cmip-800 text-cyan-300">{rec.specialty}</span>
                      <span>{new Date(rec.created_at).toLocaleDateString('pt-BR')}</span>
                    </div>
                    <div className="text-white font-semibold">{rec.doctor?.name || 'Profissional'}</div>
                    {rec.cid10_code && <div className="text-[11px] text-emerald-400 font-mono">CID-10: {rec.cid10_code}</div>}
                    <p className="text-cmip-100/80 leading-relaxed text-[11px] whitespace-pre-wrap bg-cmip-950/60 p-2.5 rounded-xl border border-cmip-800">
                      {rec.clinical_notes}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}