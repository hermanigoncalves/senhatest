import React, { useState, useEffect } from 'react';
import { 
  fetchDoctorsList, createDoctor, updateDoctor, deleteDoctor,
  fetchOfficesList, createOffice, updateOffice, deleteOffice,
  fetchUsersList, createUser, updateUser, resetAllQueues 
} from '../utils/socket';
import { 
  ShieldCheck, Users, Stethoscope, DoorOpen, Trash2, ShieldAlert, 
  Tv, LogOut, Plus, CheckCircle, RefreshCw, Edit3, UserCheck, 
  Search, Power, AlertCircle, X, Key, UserPlus, Layers, Activity, Monitor, ExternalLink
} from 'lucide-react';

export default function AdminPanel({ user, onLogout, onNavigateTv }) {
  const [activeTab, setActiveTab] = useState('medicos'); // 'medicos', 'consultorios', 'usuarios', 'filas'

  // Estados de Dados
  const [doctors, setDoctors] = useState([]);
  const [offices, setOffices] = useState([]);
  const [users, setUsers] = useState([]);

  // Estados de Carregamento e Mensagens
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Modais
  const [showDoctorModal, setShowDoctorModal] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState(null);
  const [doctorForm, setDoctorForm] = useState({
    name: '',
    crm: '',
    crm_uf: 'SP',
    specialty: 'Clínica Geral',
    phone: '',
    email: '',
    office_id: '',
    createUser: false,
    username: '',
    password: ''
  });

  const [showOfficeModal, setShowOfficeModal] = useState(false);
  const [editingOffice, setEditingOffice] = useState(null);
  const [officeForm, setOfficeForm] = useState({
    name: '',
    code: '',
    location: '',
    target_tv: '1'
  });

  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [userForm, setUserForm] = useState({
    name: '',
    username: '',
    password: '',
    role: 'doctor',
    doctor_id: ''
  });

  const [showResetModal, setShowResetModal] = useState(false);

  // Carrega todos os dados do Admin
  const loadAllData = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const [docsRes, offRes, usersRes] = await Promise.all([
        fetchDoctorsList(),
        fetchOfficesList(),
        fetchUsersList()
      ]);

      if (docsRes?.doctors) setDoctors(docsRes.doctors);
      if (offRes?.offices) setOffices(offRes.offices);
      if (usersRes?.users) setUsers(usersRes.users);
    } catch (err) {
      setErrorMsg('Falha ao carregar dados do sistema.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  const notifySuccess = (text) => {
    setMsg(text);
    setTimeout(() => setMsg(''), 4000);
  };

  const openTvTab = (tvPath) => {
    if (typeof window !== 'undefined') {
      window.open(tvPath, '_blank');
    }
  };

  // ========================================================
  // AÇÕES: MÉDICOS
  // ========================================================
  const handleOpenNewDoctor = () => {
    setEditingDoctor(null);
    setDoctorForm({
      name: '',
      crm: '',
      crm_uf: 'SP',
      specialty: 'Clínica Geral',
      phone: '',
      email: '',
      office_id: offices.length > 0 ? String(offices[0].id) : '',
      createUser: true,
      username: '',
      password: ''
    });
    setShowDoctorModal(true);
  };

  const handleOpenEditDoctor = (doc) => {
    setEditingDoctor(doc);
    setDoctorForm({
      name: doc.name || '',
      crm: doc.crm || '',
      crm_uf: doc.crm_uf || 'SP',
      specialty: doc.specialty || 'Clínica Geral',
      phone: doc.phone || '',
      email: doc.email || '',
      office_id: doc.office_id ? String(doc.office_id) : '',
      createUser: false,
      username: '',
      password: ''
    });
    setShowDoctorModal(true);
  };

  const handleSaveDoctor = async (e) => {
    e?.preventDefault();
    if (!doctorForm.name.trim() || !doctorForm.crm.trim()) {
      alert('Nome e CRM do médico são obrigatórios!');
      return;
    }

    setLoading(true);
    let res;
    if (editingDoctor) {
      res = await updateDoctor({
        id: editingDoctor.id,
        ...doctorForm
      });
    } else {
      res = await createDoctor(doctorForm);
    }
    setLoading(false);

    if (res?.success) {
      setShowDoctorModal(false);
      notifySuccess(editingDoctor ? 'Médico atualizado com sucesso!' : 'Novo médico cadastrado com sucesso!');
      loadAllData();
    } else {
      alert(res?.message || 'Erro ao salvar médico.');
    }
  };

  const handleToggleDoctorActive = async (doc) => {
    setLoading(true);
    const res = await updateDoctor({ id: doc.id, active: !doc.active });
    setLoading(false);
    if (res?.success) {
      notifySuccess(`Médico ${doc.name} ${!doc.active ? 'ativado' : 'desativado'}.`);
      loadAllData();
    }
  };

  const handleDeleteDoctor = async (doc) => {
    if (!window.confirm(`Tem certeza que deseja excluir o cadastro do ${doc.name}?`)) return;
    setLoading(true);
    const res = await deleteDoctor(doc.id, true);
    setLoading(false);
    if (res?.success) {
      notifySuccess(`Médico ${doc.name} removido.`);
      loadAllData();
    }
  };

  // ========================================================
  // AÇÕES: CONSULTÓRIOS & MULTI-TV
  // ========================================================
  const handleOpenNewOffice = () => {
    setEditingOffice(null);
    setOfficeForm({
      name: '',
      code: `C0${offices.length + 1}`,
      location: 'Térreo - Ala A',
      target_tv: '1'
    });
    setShowOfficeModal(true);
  };

  const handleOpenEditOffice = (off) => {
    setEditingOffice(off);
    setOfficeForm({
      name: off.name || '',
      code: off.code || '',
      location: off.location || '',
      target_tv: off.target_tv || '1'
    });
    setShowOfficeModal(true);
  };

  const handleSaveOffice = async (e) => {
    e?.preventDefault();
    if (!officeForm.name.trim()) {
      alert('Nome do consultório é obrigatório!');
      return;
    }

    setLoading(true);
    let res;
    if (editingOffice) {
      res = await updateOffice({ id: editingOffice.id, ...officeForm });
    } else {
      res = await createOffice(officeForm);
    }
    setLoading(false);

    if (res?.success) {
      setShowOfficeModal(false);
      notifySuccess(editingOffice ? 'Consultório atualizado!' : 'Novo consultório cadastrado!');
      loadAllData();
    } else {
      alert(res?.message || 'Erro ao salvar consultório.');
    }
  };

  const handleToggleOfficeActive = async (off) => {
    setLoading(true);
    const res = await updateOffice({ id: off.id, active: !off.active });
    setLoading(false);
    if (res?.success) {
      notifySuccess(`Consultório ${off.name} ${!off.active ? 'ativado' : 'desativado'}.`);
      loadAllData();
    }
  };

  // ========================================================
  // AÇÕES: USUÁRIOS
  // ========================================================
  const handleOpenNewUser = () => {
    setEditingUser(null);
    setUserForm({
      name: '',
      username: '',
      password: '',
      role: 'doctor',
      doctor_id: doctors.length > 0 ? String(doctors[0].id) : ''
    });
    setShowUserModal(true);
  };

  const handleSaveUser = async (e) => {
    e?.preventDefault();
    if (!userForm.username.trim() || (!editingUser && !userForm.password.trim())) {
      alert('Usuário e senha são obrigatórios!');
      return;
    }

    setLoading(true);
    let res;
    if (editingUser) {
      res = await updateUser({ id: editingUser.id, ...userForm });
    } else {
      res = await createUser(userForm);
    }
    setLoading(false);

    if (res?.success) {
      setShowUserModal(false);
      notifySuccess('Usuário salvo com sucesso!');
      loadAllData();
    } else {
      alert(res?.message || 'Erro ao salvar usuário.');
    }
  };

  // ========================================================
  // AÇÕES: RESET DE FILA
  // ========================================================
  const handleResetAll = async () => {
    setLoading(true);
    const res = await resetAllQueues();
    setLoading(false);
    setShowResetModal(false);
    if (res?.success) {
      notifySuccess('Todas as filas de pacientes e senhas do dia foram zeradas.');
    }
  };

  // Filtros
  const filteredDoctors = doctors.filter(d => 
    d.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.crm?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.specialty?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredOffices = offices.filter(o =>
    o.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.code?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-cmip-950 text-slate-100 font-['Montserrat',sans-serif] p-4 md:p-8 cmip-plus-pattern relative">
      <div className="max-w-7xl mx-auto space-y-6 relative z-10">
        
        {/* CABEÇALHO PRINCIPAL COM ATALHOS DE TV */}
        <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 p-6 bg-cmip-900/90 border border-cmip-600/30 rounded-3xl shadow-2xl backdrop-blur-md">
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
                Controle Geral CMIP & Gestão de TVs
              </h1>
              <p className="text-xs text-cmip-100/70">Gestão de corpo clínico, consultórios, 3 canais de TV e acessos</p>
            </div>
          </div>

          {/* BOTÕES DE ACESSO DIRETO ÀS 3 TVs */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => openTvTab('/tv-recepcao')}
              className="px-3.5 py-2 bg-emerald-950 hover:bg-emerald-900 text-emerald-300 font-bold text-xs rounded-xl border border-emerald-600/40 flex items-center gap-1.5 transition-colors shadow"
              title="Abrir TV da Recepção (Senhas/Guichês)"
            >
              <Users className="w-3.5 h-3.5 text-emerald-400" />
              <span>TV Recepção</span>
              <ExternalLink className="w-3 h-3 opacity-60" />
            </button>

            <button
              onClick={() => openTvTab('/tv1')}
              className="px-3.5 py-2 bg-cyan-950 hover:bg-cyan-900 text-cyan-300 font-bold text-xs rounded-xl border border-cyan-600/40 flex items-center gap-1.5 transition-colors shadow"
              title="Abrir TV Consultórios 01 (Térreo / Ala A)"
            >
              <DoorOpen className="w-3.5 h-3.5 text-cyan-400" />
              <span>TV 01 (Térreo)</span>
              <ExternalLink className="w-3 h-3 opacity-60" />
            </button>

            <button
              onClick={() => openTvTab('/tv2')}
              className="px-3.5 py-2 bg-purple-950 hover:bg-purple-900 text-purple-300 font-bold text-xs rounded-xl border border-purple-600/40 flex items-center gap-1.5 transition-colors shadow"
              title="Abrir TV Consultórios 02 (1º Andar / Ala B)"
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

        {/* FEEDBACK DE SUCESSO / ERRO */}
        {msg && (
          <div className="p-4 rounded-2xl bg-emerald-950/90 border border-emerald-500/50 text-emerald-200 text-sm font-bold flex items-center gap-3 shadow-xl animate-fade-in">
            <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{msg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="p-4 rounded-2xl bg-rose-950/90 border border-rose-500/50 text-rose-200 text-sm font-bold flex items-center gap-3 shadow-xl">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* CARDS DE VISÃO GERAL */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-3xl bg-cmip-900/80 border border-cmip-600/30 glass-panel flex items-center gap-4">
            <div className="p-3.5 bg-purple-500/20 text-purple-400 rounded-2xl">
              <Stethoscope className="w-7 h-7" />
            </div>
            <div>
              <span className="text-[11px] text-cmip-100/60 font-bold uppercase tracking-wider">Médicos</span>
              <div className="text-2xl font-black text-white">{doctors.length}</div>
            </div>
          </div>

          <div className="p-5 rounded-3xl bg-cmip-900/80 border border-cmip-600/30 glass-panel flex items-center gap-4">
            <div className="p-3.5 bg-cyan-500/20 text-cyan-400 rounded-2xl">
              <DoorOpen className="w-7 h-7" />
            </div>
            <div>
              <span className="text-[11px] text-cmip-100/60 font-bold uppercase tracking-wider">Consultórios</span>
              <div className="text-2xl font-black text-white">{offices.length}</div>
            </div>
          </div>

          <div className="p-5 rounded-3xl bg-cmip-900/80 border border-cmip-600/30 glass-panel flex items-center gap-4">
            <div className="p-3.5 bg-emerald-500/20 text-emerald-400 rounded-2xl">
              <Monitor className="w-7 h-7" />
            </div>
            <div>
              <span className="text-[11px] text-cmip-100/60 font-bold uppercase tracking-wider">Canais de TV</span>
              <div className="text-xs font-black text-emerald-300 mt-1">3 TVs Dedicadas</div>
            </div>
          </div>

          <div className="p-5 rounded-3xl bg-cmip-900/80 border border-cmip-600/30 glass-panel flex items-center gap-4">
            <div className="p-3.5 bg-blue-500/20 text-blue-400 rounded-2xl">
              <Users className="w-7 h-7" />
            </div>
            <div>
              <span className="text-[11px] text-cmip-100/60 font-bold uppercase tracking-wider">Usuários / Acessos</span>
              <div className="text-2xl font-black text-white">{users.length}</div>
            </div>
          </div>
        </div>

        {/* NAVEGAÇÃO ENTRE ABAS */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-cmip-600/30 pb-4">
          <div className="flex items-center gap-2 bg-cmip-900/90 p-1.5 rounded-2xl border border-cmip-600/40">
            <button
              onClick={() => { setActiveTab('medicos'); setSearchTerm(''); }}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all ${
                activeTab === 'medicos'
                  ? 'bg-cmip-500 text-cmip-950 shadow-lg scale-[1.02]'
                  : 'text-cmip-100 hover:bg-cmip-800'
              }`}
            >
              <Stethoscope className="w-4 h-4" />
              <span>Médicos ({doctors.length})</span>
            </button>

            <button
              onClick={() => { setActiveTab('consultorios'); setSearchTerm(''); }}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all ${
                activeTab === 'consultorios'
                  ? 'bg-cyan-500 text-slate-950 shadow-lg scale-[1.02]'
                  : 'text-cmip-100 hover:bg-cmip-800'
              }`}
            >
              <DoorOpen className="w-4 h-4" />
              <span>Consultórios & TVs ({offices.length})</span>
            </button>

            <button
              onClick={() => { setActiveTab('usuarios'); setSearchTerm(''); }}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all ${
                activeTab === 'usuarios'
                  ? 'bg-purple-500 text-white shadow-lg scale-[1.02]'
                  : 'text-cmip-100 hover:bg-cmip-800'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Usuários ({users.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('filas')}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all ${
                activeTab === 'filas'
                  ? 'bg-rose-600 text-white shadow-lg scale-[1.02]'
                  : 'text-cmip-100 hover:bg-cmip-800'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>Filas & Reset</span>
            </button>
          </div>

          {/* BARRA DE BUSCA E BOTÃO NOVO */}
          <div className="flex items-center gap-3">
            {activeTab !== 'filas' && (
              <div className="relative">
                <input
                  type="text"
                  placeholder="Buscar..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-cmip-950 border border-cmip-500/40 text-white rounded-xl pl-9 pr-4 py-2 text-xs font-semibold focus:outline-none focus:border-cmip-400 placeholder:text-cmip-100/40 w-48 md:w-64"
                />
                <Search className="w-3.5 h-3.5 text-cmip-400 absolute left-3 top-2.5" />
              </div>
            )}

            {activeTab === 'medicos' && (
              <button
                onClick={handleOpenNewDoctor}
                className="px-4 py-2 bg-gradient-to-r from-cmip-500 to-cmip-600 hover:from-cmip-400 hover:to-cmip-500 text-cmip-950 font-black text-xs rounded-xl shadow-lg flex items-center gap-1.5 transition-transform active:scale-95 shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Novo Médico</span>
              </button>
            )}

            {activeTab === 'consultorios' && (
              <button
                onClick={handleOpenNewOffice}
                className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-slate-950 font-black text-xs rounded-xl shadow-lg flex items-center gap-1.5 transition-transform active:scale-95 shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Novo Consultório</span>
              </button>
            )}

            {activeTab === 'usuarios' && (
              <button
                onClick={handleOpenNewUser}
                className="px-4 py-2 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-400 hover:to-purple-500 text-white font-black text-xs rounded-xl shadow-lg flex items-center gap-1.5 transition-transform active:scale-95 shrink-0"
              >
                <UserPlus className="w-4 h-4" />
                <span>Novo Usuário</span>
              </button>
            )}
          </div>
        </div>

        {/* ======================================================== */}
        {/* ABA 1: MÉDICOS (Corpo Clínico)                           */}
        {/* ======================================================== */}
        {activeTab === 'medicos' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDoctors.map(doc => (
                <div 
                  key={doc.id}
                  className={`p-5 rounded-3xl border transition-all glass-panel flex flex-col justify-between space-y-4 ${
                    doc.active 
                      ? 'bg-cmip-900/80 border-cmip-600/40 hover:border-cmip-400/60' 
                      : 'bg-cmip-950/60 border-slate-700/40 opacity-70'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="text-base font-black text-white leading-snug">{doc.name}</h4>
                        <span className="text-xs text-cmip-400 font-bold">{doc.specialty || 'Clínica Geral'}</span>
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                        doc.active ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {doc.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>

                    <div className="pt-2 border-t border-cmip-600/20 space-y-1 text-xs text-cmip-100/70">
                      <div>CRM: <strong className="font-mono text-cyan-300">{doc.crm} - {doc.crm_uf || 'SP'}</strong></div>
                      <div>Consultório: <strong className="text-amber-300">{doc.office_name || doc.office?.name || 'Não vinculado'}</strong></div>
                      {doc.phone && <div>Telefone: <span className="font-mono">{doc.phone}</span></div>}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-cmip-600/30">
                    <button
                      onClick={() => handleOpenEditDoctor(doc)}
                      className="px-3 py-1.5 bg-cmip-950 hover:bg-cmip-800 text-cmip-300 rounded-xl text-xs font-bold border border-cmip-500/30 flex items-center gap-1.5 transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Editar</span>
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleDoctorActive(doc)}
                        className={`p-1.5 rounded-xl border transition-colors ${
                          doc.active ? 'bg-amber-950/80 text-amber-300 border-amber-600/40' : 'bg-emerald-950/80 text-emerald-300 border-emerald-600/40'
                        }`}
                        title={doc.active ? 'Desativar Médico' : 'Ativar Médico'}
                      >
                        <Power className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => handleDeleteDoctor(doc)}
                        className="p-1.5 bg-rose-950/80 hover:bg-rose-900 text-rose-300 rounded-xl border border-rose-700/40 transition-colors"
                        title="Excluir Médico"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {filteredDoctors.length === 0 && (
              <div className="py-16 text-center text-cmip-100/50 space-y-3 bg-cmip-900/40 rounded-3xl border border-cmip-600/20">
                <Stethoscope className="w-12 h-12 mx-auto text-cmip-100/20" />
                <p className="text-sm font-semibold text-slate-300">Nenhum médico encontrado.</p>
                <button
                  onClick={handleOpenNewDoctor}
                  className="px-4 py-2 bg-cmip-500 text-cmip-950 text-xs font-bold rounded-xl"
                >
                  Cadastrar Primeiro Médico
                </button>
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* ABA 2: CONSULTÓRIOS & MULTI-TV                           */}
        {/* ======================================================== */}
        {activeTab === 'consultorios' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredOffices.map(off => (
                <div 
                  key={off.id}
                  className={`p-5 rounded-3xl border transition-all glass-panel flex flex-col justify-between space-y-4 ${
                    off.active 
                      ? 'bg-cmip-900/80 border-cmip-600/40 hover:border-cyan-400/60' 
                      : 'bg-cmip-950/60 border-slate-700/40 opacity-70'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="text-base font-black text-white">{off.name}</h4>
                        <span className="text-xs font-mono text-cyan-300 font-bold">Código: {off.code || 'SALA'}</span>
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                        off.active ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {off.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>

                    <div className="pt-2 border-t border-cmip-600/20 space-y-1.5 text-xs text-cmip-100/70">
                      <div>Localização: <strong>{off.location || 'Não especificada'}</strong></div>
                      
                      {/* DESTINO DA TV APONTADA */}
                      <div className="flex items-center gap-2 pt-1">
                        <span className="text-[11px] text-cmip-100/60 font-semibold">Destino TV:</span>
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-1 shadow ${
                          off.target_tv === '1'
                            ? 'bg-cyan-500 text-slate-950'
                            : off.target_tv === '2'
                            ? 'bg-purple-500 text-white'
                            : 'bg-amber-400 text-slate-950'
                        }`}>
                          <Tv className="w-3.5 h-3.5" />
                          {off.target_tv === '1' ? 'TV 01 (Térreo / Ala A)' : off.target_tv === '2' ? 'TV 02 (1º Andar / Ala B)' : 'Ambas as TVs'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-cmip-600/30">
                    <button
                      onClick={() => handleOpenEditOffice(off)}
                      className="px-3 py-1.5 bg-cmip-950 hover:bg-cmip-800 text-cyan-300 rounded-xl text-xs font-bold border border-cyan-500/30 flex items-center gap-1.5 transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Editar</span>
                    </button>

                    <button
                      onClick={() => handleToggleOfficeActive(off)}
                      className={`p-1.5 rounded-xl border transition-colors ${
                        off.active ? 'bg-amber-950/80 text-amber-300 border-amber-600/40' : 'bg-emerald-950/80 text-emerald-300 border-emerald-600/40'
                      }`}
                      title={off.active ? 'Desativar Sala' : 'Ativar Sala'}
                    >
                      <Power className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {filteredOffices.length === 0 && (
              <div className="py-16 text-center text-cmip-100/50 space-y-3 bg-cmip-900/40 rounded-3xl border border-cmip-600/20">
                <DoorOpen className="w-12 h-12 mx-auto text-cmip-100/20" />
                <p className="text-sm font-semibold text-slate-300">Nenhum consultório cadastrado.</p>
                <button
                  onClick={handleOpenNewOffice}
                  className="px-4 py-2 bg-cyan-500 text-slate-950 text-xs font-bold rounded-xl"
                >
                  Cadastrar Primeiro Consultório
                </button>
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* ABA 3: USUÁRIOS & ACESSOS                                */}
        {/* ======================================================== */}
        {activeTab === 'usuarios' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {users.map(u => (
                <div key={u.id} className="p-5 rounded-3xl bg-cmip-900/80 border border-cmip-600/40 glass-panel flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="text-base font-black text-white">{u.name}</h4>
                        <span className="text-xs font-mono text-cmip-400">@{u.username}</span>
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                        u.role === 'admin' 
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' 
                          : u.role === 'doctor'
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      }`}>
                        {u.role === 'admin' ? 'Administrador' : u.role === 'doctor' ? 'Médico' : 'Recepção'}
                      </span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-cmip-600/30 flex items-center justify-between text-xs text-cmip-100/60">
                    <span>Status: <strong className="text-emerald-400">Ativo</strong></span>
                    <button
                      onClick={() => {
                        setEditingUser(u);
                        setUserForm({
                          name: u.name,
                          username: u.username,
                          password: '',
                          role: u.role,
                          doctor_id: u.doctor_id ? String(u.doctor_id) : ''
                        });
                        setShowUserModal(true);
                      }}
                      className="text-purple-300 hover:text-purple-200 font-bold flex items-center gap-1"
                    >
                      <Key className="w-3.5 h-3.5" />
                      <span>Alterar Senha</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* ABA 4: FILAS & RESET DO DIA                              */}
        {/* ======================================================== */}
        {activeTab === 'filas' && (
          <div className="p-8 bg-cmip-900/80 border border-cmip-600/40 rounded-3xl glass-panel space-y-6 max-w-2xl mx-auto text-center">
            <div className="w-16 h-16 bg-rose-950 text-rose-400 rounded-3xl flex items-center justify-center mx-auto border border-rose-800 shadow-xl">
              <Trash2 className="w-8 h-8" />
            </div>

            <div>
              <h3 className="text-2xl font-black text-white">Controle de Filas do Plantão</h3>
              <p className="text-sm text-cmip-100/70 mt-2">
                Zere todas as chamadas ativas e o histórico do dia na TV Recepção, TV 01 e TV 02. O corpo clínico e os consultórios cadastrados permanecerão intactos.
              </p>
            </div>

            <button
              onClick={() => setShowResetModal(true)}
              className="px-8 py-4 bg-rose-600 hover:bg-rose-500 text-white font-black text-base rounded-2xl shadow-xl shadow-rose-600/30 transition-transform active:scale-95 flex items-center justify-center gap-2 mx-auto"
            >
              <ShieldAlert className="w-5 h-5" />
              <span>ZERAR TODAS AS FILAS DO DIA</span>
            </button>
          </div>
        )}

      </div>

      {/* ======================================================== */}
      {/* MODAL CADASTRO / EDIÇÃO DE MÉDICO                        */}
      {/* ======================================================== */}
      {showDoctorModal && (
        <div className="fixed inset-0 bg-cmip-950/85 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-cmip-900 border border-cmip-600/50 p-6 md:p-8 rounded-3xl max-w-xl w-full space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-cmip-600/30 pb-4">
              <h3 className="text-lg font-black text-white uppercase flex items-center gap-2">
                <Stethoscope className="w-5 h-5 text-cmip-400" />
                {editingDoctor ? 'Editar Cadastro do Médico' : 'Cadastrar Novo Médico'}
              </h3>
              <button onClick={() => setShowDoctorModal(false)} className="text-cmip-100/60 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDoctor} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-cmip-100 uppercase tracking-wider mb-1">Nome Completo *</label>
                <input
                  type="text"
                  placeholder="Ex: Dr. Carlos Eduardo de Souza"
                  value={doctorForm.name}
                  onChange={(e) => setDoctorForm({ ...doctorForm, name: e.target.value })}
                  className="w-full bg-cmip-950 border border-cmip-500/40 text-white rounded-xl px-3.5 py-2.5 text-sm font-semibold focus:outline-none focus:border-cmip-400"
                  required
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-cmip-100 uppercase tracking-wider mb-1">CRM *</label>
                  <input
                    type="text"
                    placeholder="Ex: 12345"
                    value={doctorForm.crm}
                    onChange={(e) => setDoctorForm({ ...doctorForm, crm: e.target.value })}
                    className="w-full bg-cmip-950 border border-cmip-500/40 text-white rounded-xl px-3.5 py-2.5 text-sm font-semibold focus:outline-none focus:border-cmip-400"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-cmip-100 uppercase tracking-wider mb-1">UF CRM</label>
                  <select
                    value={doctorForm.crm_uf}
                    onChange={(e) => setDoctorForm({ ...doctorForm, crm_uf: e.target.value })}
                    className="w-full bg-cmip-950 border border-cmip-500/40 text-white rounded-xl px-3 py-2.5 text-sm font-semibold focus:outline-none focus:border-cmip-400"
                  >
                    {['SP', 'RJ', 'MG', 'RS', 'PR', 'SC', 'BA', 'PE', 'CE', 'GO', 'DF', 'ES'].map(uf => (
                      <option key={uf} value={uf}>{uf}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-cmip-100 uppercase tracking-wider mb-1">Especialidade</label>
                  <input
                    type="text"
                    placeholder="Ex: Cardiologia, Pediatria"
                    value={doctorForm.specialty}
                    onChange={(e) => setDoctorForm({ ...doctorForm, specialty: e.target.value })}
                    className="w-full bg-cmip-950 border border-cmip-500/40 text-white rounded-xl px-3.5 py-2.5 text-sm font-semibold focus:outline-none focus:border-cmip-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-cmip-100 uppercase tracking-wider mb-1">Consultório Vinculado</label>
                  <select
                    value={doctorForm.office_id}
                    onChange={(e) => setDoctorForm({ ...doctorForm, office_id: e.target.value })}
                    className="w-full bg-cmip-950 border border-cmip-500/40 text-white rounded-xl px-3 py-2.5 text-sm font-semibold focus:outline-none focus:border-cmip-400"
                  >
                    <option value="">Selecione um consultório</option>
                    {offices.map(off => (
                      <option key={off.id} value={off.id}>
                        {off.name} ({off.target_tv === '1' ? 'TV 01' : off.target_tv === '2' ? 'TV 02' : 'Ambas TVs'})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-cmip-100 uppercase tracking-wider mb-1">Telefone / Celular</label>
                  <input
                    type="text"
                    placeholder="(00) 00000-0000"
                    value={doctorForm.phone}
                    onChange={(e) => setDoctorForm({ ...doctorForm, phone: e.target.value })}
                    className="w-full bg-cmip-950 border border-cmip-600/30 text-white rounded-xl px-3.5 py-2 text-xs font-semibold focus:outline-none focus:border-cmip-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-cmip-100 uppercase tracking-wider mb-1">E-mail</label>
                  <input
                    type="email"
                    placeholder="medico@cmip.com.br"
                    value={doctorForm.email}
                    onChange={(e) => setDoctorForm({ ...doctorForm, email: e.target.value })}
                    className="w-full bg-cmip-950 border border-cmip-600/30 text-white rounded-xl px-3.5 py-2 text-xs font-semibold focus:outline-none focus:border-cmip-400"
                  />
                </div>
              </div>

              {!editingDoctor && (
                <div className="p-4 bg-cmip-950/80 border border-cmip-500/30 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Key className="w-3.5 h-3.5 text-cmip-400" />
                      Criar Usuário de Acesso para o Médico?
                    </span>
                    <input
                      type="checkbox"
                      checked={doctorForm.createUser}
                      onChange={(e) => setDoctorForm({ ...doctorForm, createUser: e.target.checked })}
                      className="w-4 h-4 text-cmip-500 rounded"
                    />
                  </div>

                  {doctorForm.createUser && (
                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-cmip-600/30">
                      <div>
                        <label className="block text-[11px] font-bold text-cmip-100 mb-1">Login / Usuário</label>
                        <input
                          type="text"
                          placeholder="Ex: dr_carlos"
                          value={doctorForm.username}
                          onChange={(e) => setDoctorForm({ ...doctorForm, username: e.target.value })}
                          className="w-full bg-cmip-900 border border-cmip-500/40 text-white rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-cmip-100 mb-1">Senha</label>
                        <input
                          type="password"
                          placeholder="••••••••"
                          value={doctorForm.password}
                          onChange={(e) => setDoctorForm({ ...doctorForm, password: e.target.value })}
                          className="w-full bg-cmip-900 border border-cmip-500/40 text-white rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowDoctorModal(false)}
                  className="flex-1 py-3 bg-cmip-950 hover:bg-cmip-800 text-cmip-100 font-bold rounded-xl text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-3 bg-gradient-to-r from-cmip-500 to-cmip-600 hover:from-cmip-400 hover:to-cmip-500 text-cmip-950 font-black rounded-xl text-xs shadow-lg"
                >
                  {loading ? 'Salvando...' : 'Salvar Médico'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL CADASTRO / EDIÇÃO DE CONSULTÓRIO (COM DESTINO DE TV) */}
      {/* ======================================================== */}
      {showOfficeModal && (
        <div className="fixed inset-0 bg-cmip-950/85 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-cmip-900 border border-cyan-500/50 p-6 md:p-8 rounded-3xl max-w-md w-full space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-cmip-600/30 pb-4">
              <h3 className="text-lg font-black text-white uppercase flex items-center gap-2">
                <DoorOpen className="w-5 h-5 text-cyan-400" />
                {editingOffice ? 'Editar Consultório' : 'Novo Consultório'}
              </h3>
              <button onClick={() => setShowOfficeModal(false)} className="text-cmip-100/60 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveOffice} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-cmip-100 uppercase tracking-wider mb-1">Nome da Sala *</label>
                <input
                  type="text"
                  placeholder="Ex: Consultório 01 - Cardiologia"
                  value={officeForm.name}
                  onChange={(e) => setOfficeForm({ ...officeForm, name: e.target.value })}
                  className="w-full bg-cmip-950 border border-cyan-500/40 text-white rounded-xl px-3.5 py-2.5 text-sm font-semibold focus:outline-none focus:border-cyan-400"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-cmip-100 uppercase tracking-wider mb-1">Código / Sigla</label>
                  <input
                    type="text"
                    placeholder="Ex: C01"
                    value={officeForm.code}
                    onChange={(e) => setOfficeForm({ ...officeForm, code: e.target.value })}
                    className="w-full bg-cmip-950 border border-cyan-500/40 text-white rounded-xl px-3.5 py-2.5 text-sm font-semibold focus:outline-none focus:border-cyan-400 uppercase"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-cmip-100 uppercase tracking-wider mb-1">Localização</label>
                  <input
                    type="text"
                    placeholder="Ex: Térreo - Ala A"
                    value={officeForm.location}
                    onChange={(e) => setOfficeForm({ ...officeForm, location: e.target.value })}
                    className="w-full bg-cmip-950 border border-cyan-500/40 text-white rounded-xl px-3.5 py-2.5 text-sm font-semibold focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              {/* SELEÇÃO DA TV DE DESTINO */}
              <div>
                <label className="block text-xs font-bold text-amber-300 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <Tv className="w-4 h-4 text-amber-400" />
                  TV de Destino da Chamada *
                </label>
                <select
                  value={officeForm.target_tv}
                  onChange={(e) => setOfficeForm({ ...officeForm, target_tv: e.target.value })}
                  className="w-full bg-cmip-950 border border-amber-500/50 text-white rounded-xl px-3.5 py-3 text-sm font-black focus:outline-none focus:border-amber-400 shadow-inner"
                >
                  <option value="1">📺 TV 01 (Consultórios - Ala A / Térreo)</option>
                  <option value="2">📺 TV 02 (Consultórios - Ala B / 1º Andar)</option>
                  <option value="all">📺 Ambas as TVs (Chamada Geral em Ambos os Andares)</option>
                </select>
                <p className="text-[11px] text-cmip-100/60 mt-1">
                  As chamadas deste consultório aparecerão e soarão apenas na TV selecionada.
                </p>
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowOfficeModal(false)}
                  className="flex-1 py-3 bg-cmip-950 hover:bg-cmip-800 text-cmip-100 font-bold rounded-xl text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-3 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-slate-950 font-black rounded-xl text-xs shadow-lg"
                >
                  {loading ? 'Salvando...' : 'Salvar Consultório'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL CADASTRO / EDIÇÃO DE USUÁRIO                       */}
      {/* ======================================================== */}
      {showUserModal && (
        <div className="fixed inset-0 bg-cmip-950/85 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-cmip-900 border border-purple-500/50 p-6 md:p-8 rounded-3xl max-w-md w-full space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-cmip-600/30 pb-4">
              <h3 className="text-lg font-black text-white uppercase flex items-center gap-2">
                <Users className="w-5 h-5 text-purple-400" />
                {editingUser ? 'Alterar Dados / Senha' : 'Novo Usuário do Sistema'}
              </h3>
              <button onClick={() => setShowUserModal(false)} className="text-cmip-100/60 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-cmip-100 uppercase tracking-wider mb-1">Nome</label>
                <input
                  type="text"
                  placeholder="Ex: Recepção 01"
                  value={userForm.name}
                  onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                  className="w-full bg-cmip-950 border border-purple-500/40 text-white rounded-xl px-3.5 py-2.5 text-sm font-semibold focus:outline-none focus:border-purple-400"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-cmip-100 uppercase tracking-wider mb-1">Login / Username *</label>
                <input
                  type="text"
                  placeholder="Ex: recepcao01"
                  value={userForm.username}
                  onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                  className="w-full bg-cmip-950 border border-purple-500/40 text-white rounded-xl px-3.5 py-2.5 text-sm font-semibold focus:outline-none focus:border-purple-400"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-cmip-100 uppercase tracking-wider mb-1">
                  {editingUser ? 'Nova Senha (deixe em branco para manter)' : 'Senha *'}
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={userForm.password}
                  onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                  className="w-full bg-cmip-950 border border-purple-500/40 text-white rounded-xl px-3.5 py-2.5 text-sm font-semibold focus:outline-none focus:border-purple-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-cmip-100 uppercase tracking-wider mb-1">Perfil / Role</label>
                <select
                  value={userForm.role}
                  onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                  className="w-full bg-cmip-950 border border-purple-500/40 text-white rounded-xl px-3.5 py-2.5 text-sm font-bold focus:outline-none focus:border-purple-400"
                >
                  <option value="doctor">👨‍⚕️ Médico</option>
                  <option value="receptionist">📋 Recepcionista</option>
                  <option value="admin">⚙️ Administrador</option>
                </select>
              </div>

              {userForm.role === 'doctor' && (
                <div>
                  <label className="block text-xs font-bold text-cmip-100 uppercase tracking-wider mb-1">Vincular ao Médico</label>
                  <select
                    value={userForm.doctor_id}
                    onChange={(e) => setUserForm({ ...userForm, doctor_id: e.target.value })}
                    className="w-full bg-cmip-950 border border-purple-500/40 text-white rounded-xl px-3.5 py-2.5 text-sm font-semibold focus:outline-none focus:border-purple-400"
                  >
                    <option value="">Selecione o médico</option>
                    {doctors.map(doc => (
                      <option key={doc.id} value={doc.id}>{doc.name} (CRM: {doc.crm})</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowUserModal(false)}
                  className="flex-1 py-3 bg-cmip-950 hover:bg-cmip-800 text-cmip-100 font-bold rounded-xl text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-3 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-400 hover:to-purple-500 text-white font-black rounded-xl text-xs shadow-lg"
                >
                  {loading ? 'Salvando...' : 'Salvar Usuário'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL PARA ZERAR FILA DO DIA                             */}
      {/* ======================================================== */}
      {showResetModal && (
        <div className="fixed inset-0 bg-cmip-950/85 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-cmip-900 border border-rose-600/50 p-6 rounded-3xl max-w-md w-full text-center space-y-5 shadow-2xl">
            <div className="w-12 h-12 bg-rose-950 text-rose-400 rounded-2xl flex items-center justify-center mx-auto border border-rose-800">
              <ShieldAlert className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-xl font-bold text-white">Zerar Todas as Filas do Plantão?</h3>
              <p className="text-sm text-cmip-100/70 mt-2">
                Isso limpará as chamadas ativas na TV Recepção, TV 01, TV 02 e nos consultórios médicos. O cadastro do corpo clínico e salas permanecerá intacto.
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowResetModal(false)}
                className="flex-1 py-3 bg-cmip-950 hover:bg-cmip-800 text-cmip-100 font-bold rounded-xl text-xs"
              >
                Cancelar
              </button>
              <button
                onClick={handleResetAll}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl shadow-lg text-xs"
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
