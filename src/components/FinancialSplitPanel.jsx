import NavigationHeader from './NavigationHeader';
import React, { useState, useEffect } from 'react';
import {
  DollarSign,
  PieChart,
  TrendingUp,
  CreditCard,
  ShieldCheck,
  Plus,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle,
  User,
  Percent,
  Sparkles,
  FileSpreadsheet,
  FileText,
  Download,
  Calendar,
  Filter,
  CheckSquare,
  Square,
  Send,
  Copy,
  Check
} from 'lucide-react';
import { fetchWithAuth, fetchDoctorsList } from '../utils/socket';
import { exportToExcelCSV, generatePrintableRepassPDF, formatCurrencyBRL } from '../utils/exportFinancialReports';

export default function FinancialSplitPanel({ user, onLogout, onBack }) {
  const [rules, setRules] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedTxIds, setSelectedTxIds] = useState([]);

  const [summary, setSummary] = useState({
    totalCount: 0,
    totalGross: '0.00',
    totalGatewayFee: '0.00',
    totalSuppliesCost: '0.00',
    totalProfessionalNet: '0.00',
    totalClinicNet: '0.00'
  });

  const [loading, setLoading] = useState(true)
  const [toastMessage, setToastMessage] = useState(null);
  const [copiedPix, setCopiedPix] = useState(false);
  const [isQuitting, setIsQuitting] = useState(false);

  const showToast = (text, type = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadDoctors = async () => {
    try {
      const res = await fetchDoctorsList();
      if (res?.doctors) setDoctors(res.doctors);
    } catch (e) {}
  };

  const loadData = async () => {
    try {
      setLoading(true);
      let url = `/api/medical?view=financial-report`;
      if (selectedDoctorId !== 'all') url += `&doctorId=${selectedDoctorId}`;
      if (statusFilter !== 'all') url += `&paymentStatus=${statusFilter}`;

      if (selectedMonth) {
        const [year, month] = selectedMonth.split('-');
        const startDate = `${year}-${month}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const endDate = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
        url += `&startDate=${startDate}&endDate=${endDate}`;
      }

      const res = await fetchWithAuth(url);
      const data = await res.json();
      if (data.success) {
        setRules(data.rules || []);
        setTransactions(data.transactions || []);
        if (data.summary) setSummary(data.summary);
        setSelectedTxIds([]);
      }
    } catch (e) {
      showToast('Erro ao carregar relatorio financeiro', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDoctors();
  }, []);

  useEffect(() => {
    loadData();
  }, [selectedDoctorId, selectedMonth, statusFilter]);

  const handleSelectAll = () => {
    if (selectedTxIds.length === transactions.length) {
      setSelectedTxIds([]);
    } else {
      setSelectedTxIds(transactions.map(t => t.id));
    }
  };

  const handleToggleTx = (id) => {
    setSelectedTxIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const currentDoctor = doctors.find(d => String(d.id) === String(selectedDoctorId));
  const doctorPixKey = currentDoctor?.phone || currentDoctor?.email || '11999887766 (Chave Pix)';

  const handleCopyPix = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(doctorPixKey);
      setCopiedPix(true);
      setTimeout(() => setCopiedPix(false), 3000);
      showToast('Chave Pix copiada com sucesso!');
    }
  };

  const handleExportExcel = () => {
    const docName = currentDoctor?.name || 'Todos_os_Medicos';
    const filename = `repasses_cmip_${docName.toLowerCase().replace(/\s+/g, '_')}_${selectedMonth}.csv`;
    exportToExcelCSV({
      doctorName: currentDoctor?.name || 'Todos os Médicos da CMIP',
      periodStr: selectedMonth,
      transactions,
      summary
    }, filename);
    showToast('Planilha Excel baixada com sucesso!');
  };

  const handleExportPDF = () => {
    generatePrintableRepassPDF({
      doctor: currentDoctor || { name: 'Todos os Médicos da CMIP' },
      periodStr: selectedMonth,
      pixKey: doctorPixKey,
      transactions,
      summary
    });
  };

  const handleQuitSelected = async () => {
    const idsToQuit = selectedTxIds.length > 0 ? selectedTxIds : transactions.map(t => t.id);
    if (idsToQuit.length === 0) return;

    if (!confirm(`Deseja marcar ${idsToQuit.length} atendimento(s) como TRANSFERIDO / QUITADO?`)) return;

    try {
      setIsQuitting(true);
      const res = await fetchWithAuth('/api/medical', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'close-repass-batch',
          transactionIds: idsToQuit,
          paymentStatus: 'TRANSFERIDO'
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || 'Repasses marcados como transferidos!');
        loadData();
      } else {
        showToast(data.message || 'Erro ao quitar repasses', 'error');
      }
    } catch (e) {
      showToast('Erro ao processar quitação', 'error');
    } finally {
      setIsQuitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-cmip-950 text-slate-100 flex flex-col font-['Montserrat',sans-serif]">
      {toastMessage && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border ${
          toastMessage.type === 'error' ? 'bg-rose-950 border-rose-600 text-rose-200' : 'bg-emerald-950 border-emerald-500 text-emerald-200'
        }`}>
          <Sparkles className="w-4 h-4" />
          <span className="text-xs font-bold">{toastMessage.text}</span>
        </div>
      )}

      <NavigationHeader user={user} activeModule="financeiro" onLogout={onLogout} />

      <div className="p-4 md:p-6 max-w-7xl mx-auto w-full space-y-6">
        {/* Barra de Filtros & Ações de Exportação */}
        <div className="bg-cmip-900/90 border border-cmip-800 rounded-3xl p-5 shadow-2xl backdrop-blur-md flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Seletor de Competência (Mês/Ano) */}
            <div className="flex items-center gap-2 bg-cmip-950 px-3 py-2 rounded-2xl border border-cmip-800">
              <Calendar className="w-4 h-4 text-cyan-400" />
              <input
                type="month"
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                className="bg-transparent text-xs font-bold text-white outline-none cursor-pointer"
              />
            </div>

            {/* Seletor de Médico */}
            <div className="flex items-center gap-2 bg-cmip-950 px-3 py-2 rounded-2xl border border-cmip-800">
              <User className="w-4 h-4 text-purple-400" />
              <select
                value={selectedDoctorId}
                onChange={e => setSelectedDoctorId(e.target.value)}
                className="bg-transparent text-xs font-bold text-white outline-none cursor-pointer"
              >
                <option value="all" className="bg-cmip-900">Todos os Médicos da CMIP</option>
                {doctors.map(d => (
                  <option key={d.id} value={d.id} className="bg-cmip-900">{d.name} ({d.specialty})</option>
                ))}
              </select>
            </div>

            {/* Seletor de Status */}
            <div className="flex items-center gap-2 bg-cmip-950 px-3 py-2 rounded-2xl border border-cmip-800">
              <Filter className="w-4 h-4 text-amber-400" />
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="bg-transparent text-xs font-bold text-white outline-none cursor-pointer"
              >
                <option value="all" className="bg-cmip-900">Todos os Status</option>
                <option value="PAGO" className="bg-cmip-900">Aguardando Transferência (PAGO)</option>
                <option value="TRANSFERIDO" className="bg-cmip-900">Quitados (TRANSFERIDO)</option>
              </select>
            </div>
          </div>

          {/* Botões de Exportação */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleExportExcel}
              className="px-3.5 py-2.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-2xl text-xs font-bold flex items-center gap-2 transition-all shadow-lg hover:scale-105 active:scale-95"
              title="Baixar Extrato Contábil em Planilha Excel"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Exportar Excel (.csv)</span>
            </button>

            <button
              onClick={handleExportPDF}
              className="px-3.5 py-2.5 bg-cyan-700 hover:bg-cyan-600 text-white rounded-2xl text-xs font-bold flex items-center gap-2 transition-all shadow-lg hover:scale-105 active:scale-95"
              title="Visualizar e Imprimir Relatório Oficial em PDF"
            >
              <FileText className="w-4 h-4" />
              <span>Gerar PDF Oficial</span>
            </button>

            <button
              onClick={loadData}
              className="p-2.5 bg-cmip-800 hover:bg-cmip-700 text-cmip-100 rounded-2xl border border-cmip-700 transition-colors"
              title="Atualizar Dados"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Card Informativo de Pix do Médico Selecionado */}
        {currentDoctor && (
          <div className="bg-gradient-to-r from-emerald-950/60 via-cmip-900/60 to-cyan-950/60 border border-emerald-500/40 rounded-3xl p-5 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-emerald-400 uppercase tracking-wider">Prestador de Serviço:</span>
                <span className="text-sm font-black text-white">{currentDoctor.name}</span>
                <span className="text-xs text-cmip-100/60">({currentDoctor.specialty} • CRM {currentDoctor.crm}/{currentDoctor.crm_uf || 'SP'})</span>
              </div>
              <div className="text-xs text-cmip-100/70">
                Total de Atendimentos neste mês: <strong className="text-white">{summary.totalCount || transactions.length}</strong>
              </div>
            </div>

            <div className="flex items-center gap-3 bg-cmip-950/90 px-4 py-2.5 rounded-2xl border border-emerald-600/30">
              <div>
                <div className="text-[10px] font-black text-emerald-400 uppercase">Chave Pix para Transferência:</div>
                <div className="font-mono text-xs font-bold text-white">{doctorPixKey}</div>
              </div>
              <button
                onClick={handleCopyPix}
                className="p-2 bg-emerald-600/30 hover:bg-emerald-500/40 text-emerald-300 rounded-xl transition-colors"
                title="Copiar Chave Pix"
              >
                {copiedPix ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}

        {/* DRE Consolidado do Período */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-cmip-900/60 border border-cmip-800 rounded-3xl p-5 shadow-xl">
            <div className="text-[10px] font-black text-cmip-100/60 uppercase tracking-wider">Faturamento Bruto</div>
            <div className="text-2xl font-black text-white mt-1">R$ {summary.totalGross}</div>
          </div>

          <div className="bg-cmip-900/60 border border-cmip-800 rounded-3xl p-5 shadow-xl">
            <div className="text-[10px] font-black text-rose-400 uppercase tracking-wider">Taxas de Cartão (-)</div>
            <div className="text-2xl font-black text-rose-400 mt-1">- R$ {summary.totalGatewayFee}</div>
          </div>

          <div className="bg-cmip-900/60 border border-cmip-800 rounded-3xl p-5 shadow-xl">
            <div className="text-[10px] font-black text-amber-400 uppercase tracking-wider">Insumos / Custos (-)</div>
            <div className="text-2xl font-black text-amber-400 mt-1">- R$ {summary.totalSuppliesCost}</div>
          </div>

          <div className="bg-cmip-900/60 border border-cyan-500/40 bg-cyan-950/20 rounded-3xl p-5 shadow-xl">
            <div className="text-[10px] font-black text-cyan-400 uppercase tracking-wider">Líquido do Médico</div>
            <div className="text-2xl font-black text-cyan-300 mt-1">R$ {summary.totalProfessionalNet}</div>
          </div>

          <div className="bg-cmip-900/60 border border-emerald-500/40 bg-emerald-950/20 rounded-3xl p-5 shadow-xl">
            <div className="text-[10px] font-black text-emerald-400 uppercase tracking-wider">Margem Clínica CMIP</div>
            <div className="text-2xl font-black text-emerald-300 mt-1">R$ {summary.totalClinicNet}</div>
          </div>
        </div>

        {/* Tabela Detalhada de Atendimentos & Ação de Quitação */}
        <div className="bg-cmip-900/60 border border-cmip-800 rounded-3xl overflow-hidden shadow-2xl">
          <div className="p-5 border-b border-cmip-800 bg-cmip-900/90 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button onClick={handleSelectAll} className="text-cmip-300 hover:text-white">
                {selectedTxIds.length > 0 && selectedTxIds.length === transactions.length ? (
                  <CheckSquare className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
              </button>
              <h2 className="text-xs font-black text-white uppercase tracking-wider">
                Extrato Detalhado de Consultas ({transactions.length})
              </h2>
            </div>

            {transactions.length > 0 && (
              <button
                onClick={handleQuitSelected}
                disabled={isQuitting}
                className="px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-lg transition-transform active:scale-95 disabled:opacity-50"
              >
                <CheckCircle className="w-4 h-4" />
                <span>{selectedTxIds.length > 0 ? `Quitar ${selectedTxIds.length} Selecionados` : 'Quitar Todos do Período'}</span>
              </button>
            )}
          </div>

          {transactions.length === 0 ? (
            <div className="p-16 text-center text-xs text-cmip-100/40 space-y-3">
              <DollarSign className="w-12 h-12 mx-auto opacity-20" />
              <p className="text-slate-300 font-semibold">Nenhum atendimento financeiro encontrado com os filtros selecionados.</p>
              <p className="text-[11px] text-cmip-100/50">Finalize consultas no painel do médico para registrar as transações automaticamente.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-cmip-800 bg-cmip-950/40 text-[10px] text-cmip-100/60 uppercase">
                    <th className="p-3 text-center w-10">#</th>
                    <th className="p-3">Data/Hora</th>
                    <th className="p-3">Médico</th>
                    <th className="p-3">Paciente / Serviço</th>
                    <th className="p-3 text-right">Bruto</th>
                    <th className="p-3 text-right">Taxa (-)</th>
                    <th className="p-3 text-right">Insumo (-)</th>
                    <th className="p-3 text-right text-cyan-400">Líq. Médico</th>
                    <th className="p-3 text-right text-emerald-400">Líq. Clínica</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cmip-800/40">
                  {transactions.map(tx => (
                    <tr key={tx.id} className="hover:bg-cmip-800/30 transition-colors font-sans">
                      <td className="p-3 text-center">
                        <button onClick={() => handleToggleTx(tx.id)} className="text-cmip-400 hover:text-white">
                          {selectedTxIds.includes(tx.id) ? (
                            <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Square className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </td>
                      <td className="p-3 text-xs text-cmip-100/80 font-mono">
                        {new Date(tx.created_at).toLocaleDateString('pt-BR')} {new Date(tx.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="p-3 text-xs font-bold text-white">
                        {tx.doctor?.name || 'Dr. Médico'}
                      </td>
                      <td className="p-3 text-xs">
                        <div className="font-bold text-slate-200">{tx.patient_name || tx.appointment?.patient_name || 'Paciente'}</div>
                        <div className="text-[10px] text-cmip-100/60">{tx.service_name || tx.appointment?.service || 'Consulta'}</div>
                      </td>
                      <td className="p-3 text-xs text-right font-mono font-bold text-white">
                        R$ {Number(tx.gross_amount).toFixed(2)}
                      </td>
                      <td className="p-3 text-xs text-right font-mono text-rose-400">
                        -R$ {Number(tx.gateway_fee).toFixed(2)}
                      </td>
                      <td className="p-3 text-xs text-right font-mono text-amber-400">
                        -R$ {Number(tx.supplies_cost).toFixed(2)}
                      </td>
                      <td className="p-3 text-xs text-right font-mono font-black text-cyan-300">
                        R$ {Number(tx.professional_net).toFixed(2)}
                      </td>
                      <td className="p-3 text-xs text-right font-mono font-black text-emerald-300">
                        R$ {Number(tx.clinic_net).toFixed(2)}
                      </td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase ${
                          tx.payment_status === 'TRANSFERIDO' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        }`}>
                          {tx.payment_status || 'PAGO'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}