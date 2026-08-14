import React, { useState, useEffect, useRef } from 'react';
import { issueTotemTicket } from '../utils/socket';
import { bluetoothPrinter } from '../utils/bluetoothPrinter';
import { 
  Users, Star, Printer, Bluetooth, CheckCircle2, Clock, 
  Settings, Sparkles, AlertCircle, RefreshCw, Volume2, ShieldCheck, HeartHandshake,
  HelpCircle, Cable, Smartphone, ExternalLink
} from 'lucide-react';

export default function TotemTablet() {
  const [isIssuing, setIsIssuing] = useState(false);
  const [issuedTicket, setIssuedTicket] = useState(null);
  const [countdown, setCountdown] = useState(4);
  const [timeStr, setTimeStr] = useState('');
  const [dateStr, setDateStr] = useState('');

  // Status da Impressora
  const [printerConnected, setPrinterConnected] = useState(false);
  const [printerDeviceName, setPrinterDeviceName] = useState('');
  const [printerMode, setPrinterMode] = useState('bluetooth'); // 'bluetooth' | 'serial' | 'rawbt' | 'browser'
  const [printStatusMsg, setPrintStatusMsg] = useState('');
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [isSecureCtx, setIsSecureCtx] = useState(true);

  const countdownTimerRef = useRef(null);

  useEffect(() => {
    setIsSecureCtx(typeof window !== 'undefined' ? window.isSecureContext : true);

    const updateClock = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
      setDateStr(now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }));
    };
    updateClock();
    const clockInterval = setInterval(updateClock, 1000);

    const unsubscribe = bluetoothPrinter.onStatusChange(({ isConnected, deviceName, connectionType }) => {
      setPrinterConnected(isConnected);
      setPrinterDeviceName(deviceName);
      if (connectionType !== 'none') setPrinterMode(connectionType);
    });

    return () => {
      clearInterval(clockInterval);
      unsubscribe();
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, []);

  // Conexão Web Bluetooth com a API da KA-1445
  const handleConnectBluetooth = async () => {
    try {
      setPrintStatusMsg('Procurando impressora KA-1445 via Bluetooth...');
      const res = await bluetoothPrinter.connect();
      setPrinterConnected(true);
      setPrinterDeviceName(res.deviceName);
      setPrinterMode('bluetooth');
      setPrintStatusMsg(`Conectado à ${res.deviceName} com sucesso!`);
      setTimeout(() => setPrintStatusMsg(''), 3000);
    } catch (err) {
      console.error('Falha Bluetooth:', err);
      const isUserCancelled = err.name === 'NotFoundError' || err.message?.includes('cancelled');
      if (!isUserCancelled) {
        setPrintStatusMsg(`Aviso: ${err.message || err}`);
        setShowHelpModal(true);
      } else {
        setPrintStatusMsg('Busca cancelada.');
        setTimeout(() => setPrintStatusMsg(''), 2000);
      }
    }
  };

  // Conexão Web Serial (Porta COM Bluetooth no Windows)
  const handleConnectSerial = async () => {
    try {
      setPrintStatusMsg('Selecionando porta Serial / Bluetooth SPP...');
      const res = await bluetoothPrinter.connectSerial();
      setPrinterConnected(true);
      setPrinterDeviceName(res.deviceName);
      setPrinterMode('serial');
      setPrintStatusMsg('Porta Serial conectada com sucesso!');
      setTimeout(() => setPrintStatusMsg(''), 3000);
    } catch (err) {
      setPrintStatusMsg(`Erro Serial: ${err.message}`);
    }
  };

  // Teste de Impressão
  const handleTestPrint = async () => {
    try {
      if (printerMode === 'rawbt') {
        bluetoothPrinter.printViaRawBT({
          number: 'TEST-01',
          type: 'Normal',
          timestamp: new Date().toLocaleTimeString('pt-BR'),
          date: new Date().toLocaleDateString('pt-BR')
        });
      } else if (printerMode === 'browser') {
        bluetoothPrinter.printViaBrowser({
          number: 'TEST-01',
          type: 'Normal',
          timestamp: new Date().toLocaleTimeString('pt-BR'),
          date: new Date().toLocaleDateString('pt-BR')
        });
      } else {
        if (!printerConnected) {
          await handleConnectBluetooth();
        }
        await bluetoothPrinter.printTest();
      }
      setPrintStatusMsg('Teste de impressão enviado!');
      setTimeout(() => setPrintStatusMsg(''), 3000);
    } catch (err) {
      setPrintStatusMsg(`Erro no teste: ${err.message}`);
    }
  };

  // Emissão de Senha ao Tocar no Botão
  const handleIssueTicket = async (ticketType) => {
    if (isIssuing) return;
    setIsIssuing(true);

    try {
      // 1. Registra no sistema (status 'Aguardando', não vai para a TV)
      const response = await issueTotemTicket(ticketType);
      
      const ticketData = response?.ticket || {
        number: `${ticketType === 'Preferencial' ? 'P' : 'N'}${String(Math.floor(Math.random() * 900) + 100)}`,
        type: ticketType,
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        date: new Date().toLocaleDateString('pt-BR')
      };

      setIssuedTicket(ticketData);

      // 2. Dispara a impressão de acordo com o modo ativo
      if (printerMode === 'rawbt') {
        bluetoothPrinter.printViaRawBT(ticketData);
      } else if (printerMode === 'browser') {
        bluetoothPrinter.printViaBrowser(ticketData);
      } else if (printerConnected) {
        try {
          await bluetoothPrinter.printTicket(ticketData);
        } catch (printErr) {
          console.warn('Erro ao imprimir direto:', printErr);
        }
      }

      // 3. Contagem regressiva de 4 segundos
      setCountdown(4);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countdownTimerRef.current);
            setIssuedTicket(null);
            setIsIssuing(false);
            return 4;
          }
          return prev - 1;
        });
      }, 1000);

    } catch (err) {
      console.error('Erro ao emitir senha:', err);
      setIsIssuing(false);
    }
  };

  const handleCloseModal = () => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    setIssuedTicket(null);
    setIsIssuing(false);
  };

  return (
    <div className="min-h-screen max-h-screen h-screen bg-cmip-950 text-slate-100 font-['Montserrat',sans-serif] flex flex-col justify-between select-none overflow-hidden cmip-plus-pattern relative">
      
      {/* CABEÇALHO DO TABLET */}
      <header className="px-6 py-4 bg-cmip-900/90 border-b border-cmip-600/30 flex items-center justify-between shadow-2xl backdrop-blur-md relative z-10 shrink-0">
        
        {/* LOGO CMIP */}
        <div className="flex items-center gap-4">
          <div className="bg-white p-2.5 rounded-2xl shadow-xl border border-cmip-100 max-w-[200px]">
            <img src="/logo.png" alt="CMIP Logo" className="h-10 md:h-12 object-contain" />
          </div>
          <div>
            <h1 className="text-base md:text-xl font-black tracking-tight text-white uppercase flex items-center gap-2">
              <span className="text-cmip-400">CMIP</span> AUTOATENDIMENTO
            </h1>
            <p className="text-[10px] md:text-xs text-cmip-100/70 font-bold tracking-wider uppercase">
              CENTRO MÉDICO INTEGRADO PIRATININGA
            </p>
          </div>
        </div>

        {/* STATUS DA IMPRESSORA KA-1445 & RELÓGIO */}
        <div className="flex items-center gap-3 md:gap-4">
          
          {/* Botão de Conexão Bluetooth da KA-1445 */}
          <button
            onClick={printerConnected ? () => setShowConfigModal(true) : handleConnectBluetooth}
            className={`px-3.5 py-2 rounded-xl border flex items-center gap-2 text-xs font-bold transition-all shadow-md active:scale-95 ${
              printerConnected
                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50 hover:bg-emerald-900/80'
                : 'bg-amber-950/80 text-amber-300 border-amber-500/50 hover:bg-amber-900/80'
            }`}
          >
            <Bluetooth className={`w-4 h-4 ${printerConnected ? 'text-emerald-400' : 'text-amber-400 animate-pulse'}`} />
            <Printer className="w-4 h-4" />
            <span className="hidden sm:inline">
              {printerConnected ? `KA-1445 OK (${printerDeviceName})` : 'Conectar Impressora Bluetooth'}
            </span>
          </button>

          {/* Botão de Ajuda se não estiver achando */}
          <button
            onClick={() => setShowHelpModal(true)}
            className="p-2.5 bg-cmip-950 hover:bg-cmip-800 text-amber-300 rounded-xl border border-cmip-600/40 transition-colors shadow-md"
            title="Ajuda com a Impressora KA-1445"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          {/* Relógio */}
          <div className="flex flex-col items-end pl-2">
            <div className="flex items-center gap-1.5 text-lg md:text-2xl font-black text-white tracking-wider">
              <Clock className="w-4 h-4 text-cmip-400" />
              <span>{timeStr}</span>
            </div>
            <span className="text-[10px] text-cmip-100/60 hidden md:inline capitalize">{dateStr}</span>
          </div>

          {/* Configurações */}
          <button
            onClick={() => setShowConfigModal(true)}
            className="p-2.5 bg-cmip-950 hover:bg-cmip-800 rounded-xl text-cmip-100 border border-cmip-600/40 transition-colors shadow-md"
            title="Configurações do Totem"
          >
            <Settings className="w-4 h-4" />
          </button>

        </div>

      </header>

      {/* MENSAGEM DE STATUS OU AVISO */}
      {printStatusMsg && (
        <div className="bg-cmip-800 text-cmip-100 px-6 py-2.5 text-xs font-bold text-center border-b border-cmip-500/40 animate-fade-in flex items-center justify-center gap-2 z-20">
          <Sparkles className="w-4 h-4 text-amber-300" />
          <span>{printStatusMsg}</span>
        </div>
      )}

      {/* CORPO PRINCIPAL - ESCOLHA DA SENHA */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 max-w-6xl mx-auto w-full relative z-10 min-h-0">
        
        <div className="text-center mb-6 md:mb-10 space-y-2">
          <span className="inline-block px-4 py-1.5 bg-cmip-500/20 border border-cmip-400/40 text-cmip-300 text-xs md:text-sm font-black uppercase tracking-widest rounded-full shadow-lg">
            Retirada de Senha
          </span>
          <h2 className="text-2xl sm:text-4xl md:text-5xl font-black text-white tracking-tight uppercase">
            Toque na opção desejada
          </h2>
          <p className="text-xs sm:text-sm md:text-base text-cmip-100/80 font-medium max-w-xl mx-auto">
            Sua senha será impressa na hora. Aguarde a chamada da recepção no painel da TV.
          </p>
        </div>

        {/* GRADE DOS DOIS BOTÕES GIGANTES */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 w-full max-w-4xl">
          
          {/* BOTÃO 1: SENHA NORMAL */}
          <button
            onClick={() => handleIssueTicket('Normal')}
            disabled={isIssuing}
            className="group relative flex flex-col justify-between p-6 sm:p-8 md:p-10 rounded-3xl bg-gradient-to-br from-cmip-800/90 via-cmip-900 to-cmip-950 border-2 border-cmip-500/50 hover:border-cmip-400 text-left transition-all duration-300 shadow-2xl hover:shadow-cmip-500/30 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-36 h-36 bg-cmip-400/10 rounded-full blur-3xl group-hover:bg-cmip-400/20 transition-all pointer-events-none" />

            <div className="flex items-center justify-between mb-4 sm:mb-6">
              <div className="p-4 bg-gradient-to-br from-cmip-500 to-cmip-600 text-cmip-950 rounded-2xl shadow-xl group-hover:scale-110 transition-transform">
                <Users className="w-8 h-8 sm:w-10 sm:h-10" />
              </div>
              <span className="px-3 py-1 bg-cmip-950 text-cmip-400 text-xs font-black uppercase tracking-wider rounded-xl border border-cmip-500/30">
                Geral
              </span>
            </div>

            <div className="space-y-2 mt-auto">
              <h3 className="text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tight uppercase group-hover:text-cmip-300 transition-colors">
                SENHA NORMAL
              </h3>
              <p className="text-xs sm:text-sm text-cmip-100/70 font-semibold leading-relaxed">
                Consultas médicas, exames, entrega e retirada de laudos, cadastros e informações gerais.
              </p>
            </div>

            <div className="mt-6 pt-4 border-t border-cmip-600/40 flex items-center justify-between text-xs font-black text-cmip-400 uppercase tracking-widest">
              <span>Toque para Imprimir</span>
              <span className="text-xl">➔</span>
            </div>
          </button>

          {/* BOTÃO 2: SENHA PREFERENCIAL */}
          <button
            onClick={() => handleIssueTicket('Preferencial')}
            disabled={isIssuing}
            className="group relative flex flex-col justify-between p-6 sm:p-8 md:p-10 rounded-3xl bg-gradient-to-br from-amber-950/80 via-slate-900 to-cmip-950 border-2 border-amber-500/60 hover:border-amber-400 text-left transition-all duration-300 shadow-2xl hover:shadow-amber-500/30 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-36 h-36 bg-amber-400/10 rounded-full blur-3xl group-hover:bg-amber-400/25 transition-all pointer-events-none" />

            <div className="flex items-center justify-between mb-4 sm:mb-6">
              <div className="p-4 bg-gradient-to-br from-amber-400 to-amber-500 text-slate-950 rounded-2xl shadow-xl group-hover:scale-110 transition-transform">
                <Star className="w-8 h-8 sm:w-10 sm:h-10 fill-current" />
              </div>
              <span className="px-3 py-1 bg-amber-950 text-amber-300 text-xs font-black uppercase tracking-wider rounded-xl border border-amber-500/40 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                Lei 10.048
              </span>
            </div>

            <div className="space-y-2 mt-auto">
              <h3 className="text-2xl sm:text-3xl md:text-4xl font-black text-amber-300 tracking-tight uppercase group-hover:text-amber-200 transition-colors">
                PREFERENCIAL
              </h3>
              <p className="text-xs sm:text-sm text-amber-100/80 font-semibold leading-relaxed">
                Idosos 60+, Pessoas com Deficiência (PCD), Gestantes, Lactantes e Crianças de Colo.
              </p>
            </div>

            <div className="mt-6 pt-4 border-t border-amber-600/40 flex items-center justify-between text-xs font-black text-amber-400 uppercase tracking-widest">
              <span>Toque para Imprimir</span>
              <span className="text-xl">➔</span>
            </div>
          </button>

        </div>

      </main>

      {/* RODAPÉ INFORMATIVO */}
      <footer className="px-6 py-4 bg-cmip-900/80 border-t border-cmip-600/30 text-center relative z-10 shrink-0">
        <div className="flex items-center justify-center gap-2 text-xs text-cmip-100/70 font-semibold">
          <HeartHandshake className="w-4 h-4 text-cmip-400" />
          <span>Centro Médico Integrado Piratininga • Atendimento humanizado e ágil para sua saúde.</span>
        </div>
      </footer>

      {/* MODAL DE CONFIRMAÇÃO DA SENHA EMITIDA */}
      {issuedTicket && (
        <div className="fixed inset-0 bg-cmip-950/90 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-gradient-to-b from-cmip-900 to-cmip-950 border-2 border-cmip-400/60 p-8 md:p-10 rounded-3xl max-w-lg w-full text-center space-y-6 shadow-2xl relative overflow-hidden">
            
            <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-500/40 shadow-xl animate-bounce">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div className="space-y-2">
              <span className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest inline-block ${
                issuedTicket.type === 'Preferencial'
                  ? 'bg-amber-400 text-slate-950'
                  : 'bg-cmip-500 text-cmip-950'
              }`}>
                {issuedTicket.type === 'Preferencial' ? '★ ATENDIMENTO PREFERENCIAL' : 'ATENDIMENTO NORMAL'}
              </span>
              
              <p className="text-xs text-cmip-100/70 uppercase tracking-widest font-bold pt-2">
                SUA SENHA GERADA:
              </p>

              <div className="text-6xl sm:text-7xl font-black text-white tracking-tight drop-shadow-[0_10px_30px_rgba(74,222,128,0.5)]">
                {issuedTicket.number}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-cmip-950/90 border border-cmip-600/40 text-xs text-slate-200 font-semibold space-y-1.5">
              <div className="flex items-center justify-center gap-2 text-emerald-400 font-bold">
                <Printer className="w-4 h-4 animate-pulse" />
                <span>Retire seu comprovante impresso na impressora KA-1445!</span>
              </div>
              <p className="text-cmip-100/70 text-[11px]">
                Por favor, acomode-se na sala de espera e aguarde a chamada no painel de TV da recepção.
              </p>
            </div>

            <div className="space-y-2">
              <button
                onClick={handleCloseModal}
                className="w-full py-4 bg-gradient-to-r from-cmip-500 to-cmip-600 hover:from-cmip-400 hover:to-cmip-500 text-cmip-950 font-black text-base rounded-2xl shadow-xl shadow-cmip-500/25 transition-transform active:scale-[0.98]"
              >
                CONCLUIR ({countdown}s)
              </button>
              
              <div className="w-full bg-cmip-950 h-1.5 rounded-full overflow-hidden">
                <div 
                  className="bg-cmip-400 h-full transition-all duration-1000 ease-linear"
                  style={{ width: `${(countdown / 4) * 100}%` }}
                />
              </div>
            </div>

          </div>
        </div>
      )}

      {/* MODAL DE CONFIGURAÇÃO DE IMPRESSÃO */}
      {showConfigModal && (
        <div className="fixed inset-0 bg-cmip-950/85 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-cmip-900 border border-cmip-600/50 p-6 md:p-8 rounded-3xl max-w-lg w-full space-y-6 shadow-2xl">
            
            <div className="flex items-center justify-between border-b border-cmip-600/30 pb-4">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-cmip-400" />
                <h3 className="text-lg font-bold text-white uppercase">Conexão da Impressora KA-1445</h3>
              </div>
              <button
                onClick={() => setShowConfigModal(false)}
                className="text-cmip-100/60 hover:text-white font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              
              {/* Status Atual */}
              <div className="p-4 rounded-2xl bg-cmip-950/80 border border-cmip-600/30 space-y-2">
                <div className="text-xs font-bold text-cmip-100 uppercase tracking-wider flex items-center justify-between">
                  <span>Status da Conexão</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                    printerConnected ? 'bg-emerald-500 text-slate-950' : 'bg-rose-500/20 text-rose-300'
                  }`}>
                    {printerConnected ? `Conectada (${printerDeviceName})` : 'Desconectada'}
                  </span>
                </div>

                {/* Métodos de Conexão */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                  <button
                    onClick={handleConnectBluetooth}
                    className="py-3 px-3 bg-cmip-500 hover:bg-cmip-400 text-cmip-950 text-xs font-black rounded-xl shadow flex items-center justify-center gap-2 transition-transform active:scale-95"
                  >
                    <Bluetooth className="w-4 h-4" />
                    <span>Conectar Bluetooth</span>
                  </button>

                  <button
                    onClick={handleConnectSerial}
                    className="py-3 px-3 bg-cmip-800 hover:bg-cmip-700 text-white text-xs font-bold rounded-xl border border-cmip-600/40 flex items-center justify-center gap-2 transition-transform active:scale-95"
                  >
                    <Cable className="w-4 h-4 text-cyan-400" />
                    <span>Porta Serial / USB</span>
                  </button>
                </div>
              </div>

              {/* Modos Alternativos de Impressão */}
              <div>
                <label className="block text-xs font-bold text-cmip-100 uppercase tracking-wider mb-2">
                  Modo de Envio para a Impressora
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setPrinterMode('bluetooth')}
                    className={`py-2 px-2 rounded-xl border text-[11px] font-bold flex flex-col items-center gap-1 transition-all ${
                      printerMode === 'bluetooth'
                        ? 'bg-cmip-800 text-white border-cmip-400 shadow'
                        : 'bg-cmip-950 text-cmip-100/60 border-cmip-600/30'
                    }`}
                  >
                    <Bluetooth className="w-4 h-4 text-cyan-400" />
                    <span>Bluetooth</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPrinterMode('serial')}
                    className={`py-2 px-2 rounded-xl border text-[11px] font-bold flex flex-col items-center gap-1 transition-all ${
                      printerMode === 'serial'
                        ? 'bg-cmip-800 text-white border-cmip-400 shadow'
                        : 'bg-cmip-950 text-cmip-100/60 border-cmip-600/30'
                    }`}
                  >
                    <Cable className="w-4 h-4 text-purple-400" />
                    <span>Serial/USB</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPrinterMode('rawbt')}
                    className={`py-2 px-2 rounded-xl border text-[11px] font-bold flex flex-col items-center gap-1 transition-all ${
                      printerMode === 'rawbt'
                        ? 'bg-cmip-800 text-white border-cmip-400 shadow'
                        : 'bg-cmip-950 text-cmip-100/60 border-cmip-600/30'
                    }`}
                  >
                    <Smartphone className="w-4 h-4 text-amber-400" />
                    <span>App RawBT</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPrinterMode('browser')}
                    className={`py-2 px-2 rounded-xl border text-[11px] font-bold flex flex-col items-center gap-1 transition-all ${
                      printerMode === 'browser'
                        ? 'bg-cmip-800 text-white border-cmip-400 shadow'
                        : 'bg-cmip-950 text-cmip-100/60 border-cmip-600/30'
                    }`}
                  >
                    <Printer className="w-4 h-4 text-emerald-400" />
                    <span>Navegador</span>
                  </button>
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleTestPrint}
                  className="flex-1 py-2.5 bg-cmip-950 hover:bg-cmip-800 border border-cmip-500/40 text-cmip-100 text-xs font-bold rounded-xl flex items-center justify-center gap-2"
                >
                  <Printer className="w-4 h-4 text-cmip-400" />
                  <span>Imprimir Teste Agora</span>
                </button>

                <button
                  onClick={() => setShowHelpModal(true)}
                  className="px-4 py-2.5 bg-cmip-950 hover:bg-cmip-800 border border-amber-500/40 text-amber-300 text-xs font-bold rounded-xl flex items-center gap-1.5"
                >
                  <HelpCircle className="w-4 h-4" />
                  <span>Ajuda</span>
                </button>
              </div>

            </div>

            <button
              onClick={() => setShowConfigModal(false)}
              className="w-full py-3 bg-cmip-950 hover:bg-cmip-800 text-white font-bold text-xs rounded-xl border border-cmip-600/40"
            >
              Fechar
            </button>

          </div>
        </div>
      )}

      {/* MODAL DE AJUDA: POR QUE A IMPRESSORA NÃO APARECE? */}
      {showHelpModal && (
        <div className="fixed inset-0 bg-cmip-950/90 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-cmip-900 border border-amber-500/50 p-6 md:p-8 rounded-3xl max-w-lg w-full space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            
            <div className="flex items-center justify-between border-b border-cmip-600/30 pb-3">
              <div className="flex items-center gap-2 text-amber-300 font-bold">
                <AlertCircle className="w-5 h-5" />
                <h3 className="text-base font-black uppercase">Como Conectar a Impressora KA-1445</h3>
              </div>
              <button
                onClick={() => setShowHelpModal(false)}
                className="text-cmip-100/60 hover:text-white font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs text-slate-200">
              
              {/* Dica 1: Pareamento prévio */}
              <div className="p-3.5 rounded-2xl bg-cmip-950/80 border border-cmip-600/30 space-y-1.5">
                <h4 className="font-bold text-white flex items-center gap-1.5">
                  <span>1. Pareamento no Tablet / Windows:</span>
                </h4>
                <p className="text-cmip-100/80">
                  Ligue a <strong>KA-1445</strong>, vá nas Configurações de Bluetooth do seu Tablet/PC e clique em <strong>Parear novo dispositivo</strong> (código PIN padrão costuma ser <strong>0000</strong> ou <strong>1234</strong>).
                </p>
              </div>

              {/* Dica 2: Endereço Seguro (HTTPS vs HTTP) */}
              <div className="p-3.5 rounded-2xl bg-cmip-950/80 border border-cmip-600/30 space-y-1.5">
                <h4 className="font-bold text-amber-300 flex items-center gap-1.5">
                  <span>2. Segurança do Navegador (Chrome/Edge):</span>
                </h4>
                <p className="text-cmip-100/80">
                  O Google Chrome exige <strong>HTTPS</strong> ou <strong>localhost</strong> para liberar a busca Bluetooth.
                </p>
                <p className="text-emerald-300 text-[11px] font-mono bg-cmip-900 p-2 rounded-lg mt-1">
                  💡 Se estiver usando IP local (ex: http://192.168.x.x:5173), abra no Chrome do tablet a aba <strong>chrome://flags/#unsafely-treat-insecure-origin-as-secure</strong>, ative e adicione o endereço do sistema.
                </p>
              </div>

              {/* Dica 3: Modo App RawBT no Android */}
              <div className="p-3.5 rounded-2xl bg-cmip-950/80 border border-emerald-500/30 space-y-1.5">
                <h4 className="font-bold text-emerald-400 flex items-center gap-1.5">
                  <span>3. No Android: Use o aplicativo RawBT (Mais Fácil e Rápido!):</span>
                </h4>
                <p className="text-cmip-100/80">
                  Instale gratuitamente o app <strong>RawBT</strong> da Play Store no seu Tablet. Pareie a KA-1445 nele e, no menu do totem, escolha o modo <strong>App RawBT</strong>. As senhas serão impressas direto via Bluetooth com 100% de estabilidade!
                </p>
              </div>

              {/* Dica 4: Modo Impressão do Sistema */}
              <div className="p-3.5 rounded-2xl bg-cmip-950/80 border border-cmip-600/30 space-y-1.5">
                <h4 className="font-bold text-white flex items-center gap-1.5">
                  <span>4. Modo Impressão do Navegador:</span>
                </h4>
                <p className="text-cmip-100/80">
                  Você também pode selecionar o modo <strong>Navegador</strong> nas configurações. Ele utiliza o serviço de impressão padrão do tablet configurado para bobinas de 58mm.
                </p>
              </div>

            </div>

            <button
              onClick={() => setShowHelpModal(false)}
              className="w-full py-3 bg-cmip-500 hover:bg-cmip-400 text-cmip-950 font-black text-xs rounded-xl shadow"
            >
              Entendido! Voltar
            </button>

          </div>
        </div>
      )}

    </div>
  );
}
