import NavigationHeader from './NavigationHeader';
import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Search,
  Send,
  Bot,
  User,
  Phone,
  Calendar,
  Tv,
  CheckCircle,
  Clock,
  Paperclip,
  Mic,
  Play,
  Pause,
  Zap,
  Ticket,
  UserPlus,
  RefreshCw,
  LogOut,
  ChevronRight,
  ShieldCheck,
  Sparkles,
  ArrowLeft
} from 'lucide-react';
import { fetchWithAuth } from '../utils/socket';

export default function ReceptionChatPanel({ user, onLogout, onNavigateAgenda, onNavigateTv }) {
  const [conversations, setConversations] = useState([]);
  const [selectedConv, setSelectedConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [quickReplies, setQuickReplies] = useState([]);
  const [showQuickMenu, setShowQuickMenu] = useState(false);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  const [showApptModal, setShowApptModal] = useState(false);
  const [doctors, setDoctors] = useState([]);
  const [offices, setOffices] = useState([]);
  const [apptForm, setApptForm] = useState({
    date: new Date().toISOString().split('T')[0],
    time: '09:00',
    doctorId: '',
    service: 'Consulta de Rotina',
    roomNumber: '1',
    insuranceType: 'PARTICULAR',
    price: 150.00
  });

  const messagesEndRef = useRef(null);

  const showToast = (msg, type = 'success') => {
    setToastMessage({ text: msg, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadConversations = async () => {
    try {
      const res = await fetchWithAuth('/api/medical?view=conversations');
      const data = await res.json();
      if (data.success) {
        setConversations(data.conversations || []);
        if (!selectedConv && data.conversations?.length > 0) {
          setSelectedConv(data.conversations[0]);
        }
      }
    } catch (e) {
      console.error('Erro ao carregar conversas:', e);
    } finally {
      setLoadingConvs(false);
    }
  };

  const loadQuickReplies = async () => {
    try {
      const res = await fetchWithAuth('/api/medical?view=quick-replies');
      const data = await res.json();
      if (data.success) setQuickReplies(data.quickReplies || []);
    } catch (e) {}
  };

  const loadSetup = async () => {
    try {
      const res = await fetchWithAuth('/api/medical?view=setup');
      const data = await res.json();
      if (data.success) {
        setDoctors(data.doctors || []);
        setOffices(data.offices || []);
        if (data.doctors?.[0]) setApptForm(p => ({ ...p, doctorId: data.doctors[0].id }));
      }
    } catch (e) {}
  };

  useEffect(() => {
    loadConversations();
    loadQuickReplies();
    loadSetup();

    const interval = setInterval(loadConversations, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadMessages = async (convId) => {
    if (!convId) return;
    try {
      const res = await fetchWithAuth(`/api/medical?view=messages&conversationId=${convId}`);
      const data = await res.json();
      if (data.success) {
        setMessages(data.messages || []);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    } catch (e) {
      console.error('Erro ao carregar mensagens:', e);
    }
  };

  useEffect(() => {
    if (selectedConv?.id) {
      loadMessages(selectedConv.id);
    }
  }, [selectedConv?.id]);

  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || !selectedConv || sendingMessage) return;

    const textToSend = inputText.trim();
    setInputText('');
    setSendingMessage(true);

    try {
      const res = await fetchWithAuth('/api/medical?action=send-whatsapp-message', {
        method: 'POST',
        body: JSON.stringify({
          conversationId: selectedConv.id,
          remoteJid: selectedConv.remote_jid,
          text: textToSend,
          senderName: user?.name || 'Recepção CMIP'
        })
      });

      const data = await res.json();
      if (data.success) {
        setMessages(prev => [...prev, data.message]);
        setSelectedConv(prev => ({ ...prev, bot_active: false, last_message_text: textToSend }));
        showToast('Mensagem enviada com sucesso!');
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      } else {
        showToast(data.error || 'Erro ao enviar mensagem', 'error');
      }
    } catch (err) {
      showToast('Falha na comunicação com o gateway', 'error');
    } finally {
      setSendingMessage(false);
    }
  };

  const handleToggleBot = async () => {
    if (!selectedConv) return;
    const newState = !selectedConv.bot_active;
    try {
      const res = await fetchWithAuth('/api/medical?action=toggle-bot', {
        method: 'POST',
        body: JSON.stringify({
          conversationId: selectedConv.id,
          botActive: newState
        })
      });
      const data = await res.json();
      if (data.success) {
        setSelectedConv(prev => ({ ...prev, bot_active: newState }));
        setConversations(prev => prev.map(c => c.id === selectedConv.id ? { ...c, bot_active: newState } : c));
        showToast(newState ? '🤖 Robô de IA Ativado para este paciente!' : '👤 Atendimento Humano Assumido (IA Pausada)!');
      }
    } catch (e) {
      showToast('Erro ao alternar modo de atendimento', 'error');
    }
  };

  const handleQuickCallTv = async () => {
    if (!selectedConv) return;
    const patName = selectedConv.patient_name || selectedConv.patient?.full_name || 'Paciente';
    try {
      const res = await fetchWithAuth('/api/medical?action=call-patient', {
        method: 'POST',
        body: JSON.stringify({
          patientName: patName,
          doctorName: 'Recepção Central',
          roomName: 'Guichê de Atendimento',
          targetTv: 'recepcao'
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`📢 ${patName} chamado no Painel de TV da Recepção!`);
      }
    } catch (e) {
      showToast('Erro ao disparar chamada na TV', 'error');
    }
  };

  const handleCreateAppointment = async (e) => {
    e.preventDefault();
    if (!selectedConv) return;

    try {
      const selectedDoc = doctors.find(d => String(d.id) === String(apptForm.doctorId));
      const res = await fetchWithAuth('/api/medical?action=create-appointment', {
        method: 'POST',
        body: JSON.stringify({
          patientId: selectedConv.patient_id,
          name: selectedConv.patient_name || selectedConv.patient?.full_name || 'Paciente WhatsApp',
          phone: selectedConv.phone,
          professionalId: apptForm.doctorId,
          doctorName: selectedDoc?.name || '',
          service: apptForm.service,
          appointmentDate: apptForm.date,
          appointmentTime: apptForm.time,
          roomNumber: apptForm.roomNumber,
          insuranceType: apptForm.insuranceType,
          price: apptForm.price
        })
      });

      const data = await res.json();
      if (data.success) {
        showToast('📅 Consulta agendada com sucesso!');
        setShowApptModal(false);
        setInputText(`Sua consulta foi confirmada para o dia ${apptForm.date.split('-').reverse().join('/')} às ${apptForm.time} com ${selectedDoc?.name || 'nosso especialista'}. 😊`);
      } else {
        showToast(data.error || 'Erro ao agendar', 'error');
      }
    } catch (e) {
      showToast('Falha ao registrar agendamento', 'error');
    }
  };

  const filteredConvs = conversations.filter(c => {
    const matchSearch = (c.patient_name || c.phone || '').toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchSearch) return false;
    if (filterType === 'unread') return (c.unread_count || 0) > 0;
    if (filterType === 'human') return c.bot_active === false;
    if (filterType === 'bot') return c.bot_active === true;
    return true;
  });

  return (
    <div className="h-screen bg-cmip-950 text-slate-100 flex flex-col font-['Montserrat',sans-serif] overflow-hidden">
      {toastMessage && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-fade-in border ${toastMessage.type === 'error' ? 'bg-rose-950/90 border-rose-600 text-rose-200' : 'bg-emerald-950/90 border-emerald-500 text-emerald-200'}`}>
          <Sparkles className="w-4 h-4" />
          <span className="text-xs font-bold">{toastMessage.text}</span>
        </div>
      )}

      <NavigationHeader user={user} activeModule="chat" onLogout={onLogout} />

      <div className="flex-1 flex overflow-hidden">
        <div className="w-80 md:w-96 border-r border-cmip-800/80 bg-cmip-900/40 flex flex-col flex-shrink-0">
          <div className="p-3.5 border-b border-cmip-800/60 space-y-2.5">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-cmip-100/40" />
              <input
                type="text"
                placeholder="Buscar por nome ou telefone..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-cmip-950/80 border border-cmip-700/60 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-cmip-100/40 focus:outline-none focus:border-cmip-400"
              />
            </div>

            <div className="flex gap-1.5 text-[11px] font-bold">
              <button
                onClick={() => setFilterType('all')}
                className={`flex-1 py-1 rounded-lg border ${filterType === 'all' ? 'bg-cmip-600 text-white border-cmip-500' : 'bg-cmip-950/50 text-cmip-100/60 border-cmip-800'}`}
              >
                Todas ({conversations.length})
              </button>
              <button
                onClick={() => setFilterType('bot')}
                className={`flex-1 py-1 rounded-lg border ${filterType === 'bot' ? 'bg-cyan-600 text-white border-cyan-500' : 'bg-cmip-950/50 text-cmip-100/60 border-cmip-800'}`}
              >
                🤖 IA
              </button>
              <button
                onClick={() => setFilterType('human')}
                className={`flex-1 py-1 rounded-lg border ${filterType === 'human' ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-cmip-950/50 text-cmip-100/60 border-cmip-800'}`}
              >
                👤 Humano
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-cmip-800/40">
            {loadingConvs ? (
              <div className="p-8 text-center text-xs text-cmip-100/50 space-y-2">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto text-cmip-400" />
                <p>Carregando conversas do WhatsApp...</p>
              </div>
            ) : filteredConvs.length === 0 ? (
              <div className="p-8 text-center text-xs text-cmip-100/40 space-y-2">
                <MessageSquare className="w-8 h-8 mx-auto opacity-30" />
                <p>Nenhuma conversa encontrada</p>
              </div>
            ) : (
              filteredConvs.map(conv => {
                const isSelected = selectedConv?.id === conv.id;
                return (
                  <div
                    key={conv.id}
                    onClick={() => setSelectedConv(conv)}
                    className={`p-3.5 cursor-pointer transition-colors flex items-start gap-3 ${isSelected ? 'bg-cmip-800/80 border-l-4 border-cmip-400' : 'hover:bg-cmip-800/40'}`}
                  >
                    <div className="w-10 h-10 rounded-2xl bg-cmip-800 border border-cmip-700/60 flex items-center justify-center font-black text-xs text-cmip-200 flex-shrink-0">
                      {conv.patient_name ? conv.patient_name.charAt(0).toUpperCase() : 'P'}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-black text-white truncate">
                          {conv.patient_name || conv.patient?.full_name || conv.phone}
                        </h3>
                        <span className="text-[10px] text-cmip-100/40">
                          {conv.last_message_at ? new Date(conv.last_message_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                      </div>

                      <p className="text-[11px] text-cmip-100/60 truncate mt-0.5">
                        {conv.last_message_text || 'Sem mensagens'}
                      </p>

                      <div className="flex items-center gap-1.5 mt-2">
                        {conv.bot_active ? (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center gap-1">
                            <Bot className="w-2.5 h-2.5" /> <span>Robô IA</span>
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                            <User className="w-2.5 h-2.5" /> <span>Atendente</span>
                          </span>
                        )}

                        {(conv.unread_count || 0) > 0 && (
                          <span className="ml-auto w-4 h-4 rounded-full bg-emerald-500 text-cmip-950 font-black text-[9px] flex items-center justify-center shadow-lg">
                            {conv.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="flex-1 flex flex-col bg-cmip-950/60 relative">
          {selectedConv ? (
            <>
              <div className="p-3.5 border-b border-cmip-800 bg-cmip-900/60 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center font-black text-sm text-emerald-300">
                    {selectedConv.patient_name ? selectedConv.patient_name.charAt(0).toUpperCase() : 'P'}
                  </div>
                  <div>
                    <h2 className="text-sm font-black text-white">
                      {selectedConv.patient_name || selectedConv.patient?.full_name || selectedConv.phone}
                    </h2>
                    <p className="text-[11px] text-cmip-100/60 flex items-center gap-2">
                      <span>{selectedConv.phone}</span>
                      <span>•</span>
                      <span className="text-emerald-400 font-bold">Online via Evolution Go</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleToggleBot}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-md ${selectedConv.bot_active ? 'bg-cyan-600 hover:bg-cyan-500 text-white' : 'bg-emerald-600 hover:bg-emerald-500 text-white'}`}
                  >
                    {selectedConv.bot_active ? (
                      <>
                        <Bot className="w-3.5 h-3.5" />
                        <span>Pausar IA & Assumir</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Reativar Robô de IA</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="flex-1 p-4 overflow-y-auto space-y-3.5 bg-gradient-to-b from-cmip-950 to-cmip-900/40">
                {messages.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-center text-xs text-cmip-100/40">
                    <div>
                      <MessageSquare className="w-10 h-10 mx-auto opacity-30 mb-2" />
                      <p>Inicie uma conversa digitando abaixo...</p>
                    </div>
                  </div>
                ) : (
                  messages.map(msg => {
                    const isMe = msg.from_me;
                    return (
                      <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-md rounded-2xl p-3.5 shadow-lg relative space-y-1.5 ${isMe ? 'bg-emerald-600 text-white rounded-tr-none' : 'bg-cmip-900 border border-cmip-700/60 text-slate-100 rounded-tl-none'}`}>
                          <div className="text-[10px] font-bold opacity-75 flex items-center justify-between gap-4">
                            <span>{msg.sender_name || (isMe ? 'Recepção' : 'Paciente')}</span>
                            <span>{msg.created_at ? new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                          </div>

                          <p className="text-xs leading-relaxed whitespace-pre-wrap font-medium">
                            {msg.content}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {showQuickMenu && (
                <div className="absolute bottom-20 left-4 right-4 bg-cmip-900 border border-cmip-700 rounded-2xl p-3 shadow-2xl max-h-48 overflow-y-auto z-20 animate-fade-in">
                  <div className="text-[11px] font-black text-cmip-200 uppercase tracking-wider mb-2">Respostas Rápidas da Recepção</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {quickReplies.map(qr => (
                      <button
                        key={qr.id}
                        onClick={() => {
                          setInputText(qr.content);
                          setShowQuickMenu(false);
                        }}
                        className="p-2 bg-cmip-950 hover:bg-cmip-800 rounded-xl text-left border border-cmip-800 transition-colors"
                      >
                        <div className="text-xs font-black text-cyan-300">{qr.shortcut} — {qr.title}</div>
                        <div className="text-[10px] text-cmip-100/60 truncate">{qr.content}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <form onSubmit={handleSendMessage} className="p-3 border-t border-cmip-800 bg-cmip-900/80 flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setShowQuickMenu(!showQuickMenu)}
                  className="p-2.5 rounded-xl bg-cmip-800 hover:bg-cmip-700 text-cyan-300 border border-cmip-700/60 transition-colors"
                  title="Respostas Rápidas (/)"
                >
                  <Zap className="w-4 h-4" />
                </button>

                <input
                  type="text"
                  placeholder={selectedConv.bot_active ? "Digite sua mensagem (a IA será pausada automaticamente)..." : "Digite uma mensagem..."}
                  value={inputText}
                  onChange={e => {
                    setInputText(e.target.value);
                    if (e.target.value.startsWith('/')) setShowQuickMenu(true);
                  }}
                  className="flex-1 bg-cmip-950 border border-cmip-700/70 rounded-xl px-4 py-2.5 text-xs text-white placeholder-cmip-100/40 focus:outline-none focus:border-emerald-500 shadow-inner"
                />

                <button
                  type="submit"
                  disabled={!inputText.trim() || sendingMessage}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black rounded-xl text-xs flex items-center gap-1.5 shadow-lg transition-transform active:scale-95"
                >
                  <Send className="w-4 h-4" />
                  <span>Enviar</span>
                </button>
              </form>
            </>
          ) : (
            <div className="h-full flex items-center justify-center text-center text-xs text-cmip-100/40">
              <p>Selecione uma conversa ao lado para iniciar</p>
            </div>
          )}
        </div>

        {selectedConv && (
          <div className="w-80 border-l border-cmip-800/80 bg-cmip-900/50 p-4 flex flex-col justify-between overflow-y-auto flex-shrink-0 space-y-4">
            <div className="space-y-4">
              <div className="text-center pb-3 border-b border-cmip-800/60">
                <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center font-black text-2xl text-cmip-950 mx-auto shadow-xl">
                  {selectedConv.patient_name ? selectedConv.patient_name.charAt(0).toUpperCase() : 'P'}
                </div>
                <h3 className="text-sm font-black text-white mt-3">
                  {selectedConv.patient_name || selectedConv.patient?.full_name || 'Paciente WhatsApp'}
                </h3>
                <p className="text-xs text-cmip-100/60">{selectedConv.phone}</p>
              </div>

              <div className="bg-cmip-950/70 border border-cmip-800 rounded-2xl p-3.5 space-y-2 text-xs">
                <div className="text-[10px] font-black text-cmip-200 uppercase tracking-wider">Ficha do Paciente</div>
                <div className="flex justify-between text-cmip-100/70">
                  <span>CPF:</span>
                  <strong className="text-white">{selectedConv.patient?.cpf || 'Não cadastrado'}</strong>
                </div>
                <div className="flex justify-between text-cmip-100/70">
                  <span>Convênio:</span>
                  <strong className="text-emerald-400">PARTICULAR</strong>
                </div>
                <div className="flex justify-between text-cmip-100/70">
                  <span>Status:</span>
                  <span className="text-cyan-300 font-bold">Ativo</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-[10px] font-black text-cmip-200 uppercase tracking-wider">Ações Clínicas em 1 Clique</div>

                <button
                  onClick={() => setShowApptModal(true)}
                  className="w-full py-2.5 bg-gradient-to-r from-cyan-600 to-cmip-600 hover:from-cyan-500 hover:to-cmip-500 text-white font-black rounded-xl text-xs shadow-lg flex items-center justify-center gap-2 transition-transform active:scale-95"
                >
                  <Calendar className="w-4 h-4" />
                  <span>Agendar Consulta</span>
                </button>

                <button
                  onClick={handleQuickCallTv}
                  className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-cmip-950 font-black rounded-xl text-xs shadow-lg flex items-center justify-center gap-2 transition-transform active:scale-95"
                >
                  <Tv className="w-4 h-4" />
                  <span>Chamar no Painel de TV</span>
                </button>
              </div>
            </div>

            <div className="pt-3 border-t border-cmip-800/60 text-[10px] text-cmip-100/40 text-center">
              Sistema CMIP & Evolution Go v2.0
            </div>
          </div>
        )}
      </div>

      {showApptModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-cmip-900 border border-cmip-700 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-fade-in">
            <div className="flex items-center justify-between border-b border-cmip-800 pb-3">
              <h3 className="text-sm font-black text-white uppercase flex items-center gap-2">
                <Calendar className="w-4 h-4 text-cyan-400" />
                <span>Novo Agendamento</span>
              </h3>
              <button onClick={() => setShowApptModal(false)} className="text-cmip-100/60 hover:text-white text-xs">✕</button>
            </div>

            <form onSubmit={handleCreateAppointment} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-cmip-200 mb-1">Profissional / Médico</label>
                <select
                  value={apptForm.doctorId}
                  onChange={e => setApptForm({ ...apptForm, doctorId: e.target.value })}
                  className="w-full bg-cmip-950 border border-cmip-700 rounded-xl p-2.5 text-white"
                >
                  {doctors.map(d => (
                    <option key={d.id} value={d.id}>{d.name} ({d.specialty})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-cmip-200 mb-1">Data</label>
                  <input
                    type="date"
                    value={apptForm.date}
                    onChange={e => setApptForm({ ...apptForm, date: e.target.value })}
                    className="w-full bg-cmip-950 border border-cmip-700 rounded-xl p-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-cmip-200 mb-1">Horário</label>
                  <input
                    type="time"
                    value={apptForm.time}
                    onChange={e => setApptForm({ ...apptForm, time: e.target.value })}
                    className="w-full bg-cmip-950 border border-cmip-700 rounded-xl p-2 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-cmip-200 mb-1">Serviço / Procedimento</label>
                <input
                  type="text"
                  value={apptForm.service}
                  onChange={e => setApptForm({ ...apptForm, service: e.target.value })}
                  className="w-full bg-cmip-950 border border-cmip-700 rounded-xl p-2 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-cmip-200 mb-1">Valor (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={apptForm.price}
                    onChange={e => setApptForm({ ...apptForm, price: e.target.value })}
                    className="w-full bg-cmip-950 border border-cmip-700 rounded-xl p-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-cmip-200 mb-1">Consultório</label>
                  <select
                    value={apptForm.roomNumber}
                    onChange={e => setApptForm({ ...apptForm, roomNumber: e.target.value })}
                    className="w-full bg-cmip-950 border border-cmip-700 rounded-xl p-2 text-white"
                  >
                    <option value="1">Consultório 01 (Térreo)</option>
                    <option value="2">Consultório 02 (1º Andar)</option>
                    <option value="3">Consultório 03 (Térreo)</option>
                    <option value="4">Consultório 04 (1º Andar)</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowApptModal(false)}
                  className="flex-1 py-2.5 bg-cmip-950 hover:bg-cmip-800 text-cmip-200 rounded-xl font-bold border border-cmip-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-black rounded-xl shadow-lg"
                >
                  Confirmar Agendamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
