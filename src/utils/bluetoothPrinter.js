/**
 * Utilitário de Impressão Bluetooth ESC/POS baseado na API do Sistema PedeAí
 * Especialmente otimizado para a impressora Knup KA-1445 e térmicas 58mm/80mm
 */

// Cache de conexões ativas e dispositivos conhecidos para reconexão automática silenciosa
export const activeBluetoothConnections = {};
export const knownBluetoothDevices = {};

let printQueueChain = Promise.resolve();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const RAWBT_URL = 'http://localhost:40213/print';

// Serviços e características da KA-1445 e compatíveis
const KNOWN_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb', // KA-1445 padrão
  '0000ffe0-0000-1000-8000-00805f9b34fb', // POS-58 padrão
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '0000ff00-0000-1000-8000-00805f9b34fb'
];

const KNOWN_CHARACTERISTICS = [
  '00002af1-0000-1000-8000-00805f9b34fb', // KA-1445 característica de escrita
  '0000ffe1-0000-1000-8000-00805f9b34fb', // POS-58 característica de escrita
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  '0000ff01-0000-1000-8000-00805f9b34fb'
];

class BluetoothPrinterService {
  constructor() {
    this.listeners = [];
    this.currentDeviceName = 'Impressora KA-1445';
    this.initAutoReconnect();
  }

  onStatusChange(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  notifyStatus() {
    const isConn = this.isConnected();
    const name = this.getDeviceName();
    this.listeners.forEach((cb) => {
      try {
        cb({
          isConnected: isConn,
          deviceName: name,
          hasBluetoothApi: typeof navigator !== 'undefined' && 'bluetooth' in navigator,
          isSecureContext: typeof window !== 'undefined' ? window.isSecureContext : true
        });
      } catch (e) {}
    });
  }

  isConnected(printerId = 'default') {
    return !!activeBluetoothConnections[printerId]?.characteristic;
  }

  getDeviceName(printerId = 'default') {
    const conn = activeBluetoothConnections[printerId];
    return conn?.device?.name || this.currentDeviceName;
  }

  // Tenta reconectar silenciosamente na inicialização se o navegador tiver permissão salva
  async initAutoReconnect(printerId = 'default') {
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    if (nav?.bluetooth?.getDevices) {
      try {
        const devices = await nav.bluetooth.getDevices();
        const matched = devices.find((d) =>
          d.name?.toLowerCase().includes('ka1445') ||
          d.name?.toLowerCase().includes('ka-1445') ||
          d.name?.toLowerCase().includes('1445') ||
          d.name?.toLowerCase().includes('mpt') ||
          d.name?.toLowerCase().includes('pos')
        );

        if (matched) {
          console.log('[PrinterService] Dispositivo KA-1445 encontrado no navegador. Tentando conexão silenciosa...');
          knownBluetoothDevices[printerId] = matched;
          this.reconnectDevice(matched, printerId).catch(() => {});
        }
      } catch (e) {}
    }
  }

  /**
   * Conecta na impressora Bluetooth usando os mesmos filtros inteligentes do PedeAí
   */
  async connect(printerId = 'default') {
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    if (!nav?.bluetooth) {
      throw new Error('Seu navegador não suporta Web Bluetooth. Utilize o Google Chrome ou Edge.');
    }

    try {
      console.log(`[PrinterService] Solicitando dispositivo Bluetooth com filtro inteligente para #${printerId}...`);

      let device = null;

      // 1. Tenta com filtros direcionados para a KA-1445 e térmicas (exibe a impressora imediatamente sem ruídos)
      try {
        device = await nav.bluetooth.requestDevice({
          filters: [
            { name: 'ka1445' },
            { name: 'KA1445' },
            { name: 'KA-1445' },
            { name: 'ka-1445' },
            { namePrefix: 'ka' },
            { namePrefix: 'KA' },
            { namePrefix: '1445' },
            { namePrefix: 'MPT' },
            { namePrefix: 'POS' },
            { namePrefix: 'RT' },
            { namePrefix: 'RP' },
            { namePrefix: 'Thermal' },
            { namePrefix: 'Printer' },
            { namePrefix: 'Blue' },
            { namePrefix: 'Inner' },
            { namePrefix: 'MTP' }
          ],
          optionalServices: KNOWN_SERVICES
        });
      } catch (filterErr) {
        console.warn('[PrinterService] Tentativa com filtros não retornou, tentando aceitar todos os dispositivos...');
        // Fallback: Se o usuário cancelar ou se a impressora tiver outro nome, tenta aceitando todos os dispositivos
        device = await nav.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: KNOWN_SERVICES
        });
      }

      if (!device || !device.gatt) {
        throw new Error('Nenhum dispositivo selecionado.');
      }

      const conn = await this.reconnectDevice(device, printerId);
      this.currentDeviceName = device.name || 'Impressora KA-1445';
      this.notifyStatus();

      return { success: true, deviceName: this.currentDeviceName };
    } catch (error) {
      console.error('Erro ao conectar Bluetooth:', error);
      this.notifyStatus();
      throw error;
    }
  }

  // Realiza a conexão GATT e obtém a característica de escrita
  async reconnectDevice(device, printerId = 'default') {
    if (!device.gatt.connected) {
      console.log('Conectando ao servidor GATT...');
      await device.gatt.connect();
    }

    let writeChar = null;

    // Tenta primeiro os serviços e características padrão da KA-1445
    for (const sUuid of KNOWN_SERVICES) {
      try {
        const service = await device.gatt.getPrimaryService(sUuid);
        for (const cUuid of KNOWN_CHARACTERISTICS) {
          try {
            const char = await service.getCharacteristic(cUuid);
            if (char) {
              writeChar = char;
              break;
            }
          } catch (e) {}
        }

        if (!writeChar) {
          const chars = await service.getCharacteristics();
          for (const char of chars) {
            if (char.properties.write || char.properties.writeWithoutResponse) {
              writeChar = char;
              break;
            }
          }
        }

        if (writeChar) break;
      } catch (e) {}
    }

    if (!writeChar) {
      throw new Error('Não foi possível obter a característica de escrita na impressora KA-1445.');
    }

    const conn = { device, characteristic: writeChar };
    activeBluetoothConnections[printerId] = conn;
    knownBluetoothDevices[printerId] = device;

    device.addEventListener('gattserverdisconnected', () => {
      console.log(`[PrinterService] Impressora ${device.name || ''} desconectada!`);
      delete activeBluetoothConnections[printerId];
      this.notifyStatus();
    });

    return conn;
  }

  async disconnect(printerId = 'default') {
    const conn = activeBluetoothConnections[printerId];
    if (conn?.device?.gatt?.connected) {
      conn.device.gatt.disconnect();
    }
    delete activeBluetoothConnections[printerId];
    this.notifyStatus();
  }

  /**
   * Converte texto para binário ESC/POS removendo acentos
   */
  encode(text) {
    const cleanText = text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x00-\x7F]/g, '');

    const encoder = new TextEncoder();
    return encoder.encode(cleanText);
  }

  /**
   * Constrói os comandos ESC/POS da senha para a bobina de 58mm (KA-1445)
   */
  buildEscPosTicket(ticket) {
    const ESC = '\x1B';
    const GS = '\x1D';
    const parts = [];

    const add = (str) => parts.push(this.encode(str));
    const addCmd = (cmd) => parts.push(this.encode(cmd));

    const lineStr = '--------------------------------\n';

    // 1. Reset / Inicializar
    addCmd(ESC + '@');

    // 2. Cabeçalho Centralizado
    addCmd(ESC + 'a' + '\x01'); // Center
    addCmd(ESC + '!' + '\x08'); // Bold
    addCmd(GS + '!' + '\x11');  // Double size
    add("CMIP\n");
    addCmd(GS + '!' + '\x00');  // Normal size
    addCmd(ESC + '!' + '\x00'); // Bold off
    add(lineStr);

    // 3. Tipo de Atendimento
    const isPref = ticket.type === 'Preferencial';
    addCmd(ESC + '!' + '\x08'); // Bold
    if (isPref) {
      add(">>> ATENDIMENTO PREFERENCIAL <<<\n");
      addCmd(ESC + '!' + '\x00');
      add("(Idoso / PCD / Gestante / Colo)\n");
    } else {
      add("ATENDIMENTO NORMAL\n");
    }
    addCmd(ESC + '!' + '\x00');
    add("\n");

    // 4. NÚMERO DA SENHA GIGANTE (3x de tamanho)
    addCmd(ESC + '!' + '\x08'); // Bold
    addCmd(GS + '!' + '\x22');  // Extra Grande
    add(`${ticket.number || '0000'}\n`);
    addCmd(GS + '!' + '\x00');  // Normal size
    addCmd(ESC + '!' + '\x00'); // Bold off
    add("\n");

    // 5. Data e Hora
    add(lineStr);
    const now = new Date();
    const dateStr = ticket.date || now.toLocaleDateString('pt-BR');
    const timeStr = ticket.timestamp || now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    add(`Emissao: ${dateStr} - ${timeStr}\n`);
    add(lineStr);

    // 6. Mensagem de Rodapé
    add("Por favor, aguarde ser chamado\n");
    add("no painel de TV da recepcao.\n");
    add("================================\n\n\n\n");

    // 7. Corte de papel
    addCmd(GS + 'V' + '\x41' + '\x00');

    // Junta todas as partes
    const totalLength = parts.reduce((acc, p) => acc + p.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    parts.forEach((p) => {
      result.set(p, offset);
      offset += p.length;
    });

    return result;
  }

  /**
   * Imprime o cupom na KA-1445 com controle sequencial atômico (Mutex) e buffer seguro de 128 bytes
   */
  async printTicket(ticket, printerId = 'default') {
    let conn = activeBluetoothConnections[printerId];

    // Fallback: pega a primeira conexão ativa se houver
    if (!conn) {
      const ids = Object.keys(activeBluetoothConnections);
      if (ids.length > 0) conn = activeBluetoothConnections[ids[0]];
    }

    // Reconexão silenciosa via cache se estiver inativa
    if ((!conn || !conn.characteristic) && knownBluetoothDevices[printerId]) {
      const cached = knownBluetoothDevices[printerId];
      console.log(`[PrinterService] Reconectando silenciosamente à ${cached.name || 'KA-1445'}...`);
      try {
        conn = await this.reconnectDevice(cached, printerId);
      } catch (err) {
        console.warn('[PrinterService] Falha na reconexão rápida:', err);
      }
    }

    if (!conn || !conn.characteristic) {
      throw new Error('Impressora Bluetooth não está conectada. Clique em "Conectar Impressora Bluetooth" no topo da tela.');
    }

    // Execução sequencial atômica da fila de impressão
    return new Promise((resolve, reject) => {
      printQueueChain = printQueueChain.then(async () => {
        try {
          const data = this.buildEscPosTicket(ticket);
          const CHUNK_SIZE = 128; // 128 bytes para evitar estouro de buffer Bluetooth

          for (let i = 0; i < data.length; i += CHUNK_SIZE) {
            const chunk = data.slice(i, i + CHUNK_SIZE);
            if (conn.characteristic.properties.writeWithoutResponse) {
              await conn.characteristic.writeValueWithoutResponse(chunk);
            } else {
              await conn.characteristic.writeValue(chunk);
            }
            await sleep(60);
          }

          await sleep(300); // Delay térmico pós-impressão
          resolve({ success: true });
        } catch (error) {
          console.error(`Erro ao escrever na KA-1445:`, error);
          delete activeBluetoothConnections[printerId];
          this.notifyStatus();
          reject(error);
        }
      });
    });
  }

  /**
   * Imprime via Deep Link do App RawBT no Android
   */
  printViaRawBT(ticket) {
    const data = this.buildEscPosTicket(ticket);
    let binary = '';
    for (let i = 0; i < data.byteLength; i++) {
      binary += String.fromCharCode(data[i]);
    }
    const base64 = btoa(binary);
    window.location.href = `rawbt:base64,${base64}`;
    return true;
  }

  /**
   * Fallback de impressão pelo diálogo do navegador
   */
  printViaBrowser(ticket) {
    const printWindow = window.open('', '_blank', 'width=350,height=500');
    if (!printWindow) return;

    const isPref = ticket.type === 'Preferencial';
    const now = new Date();
    const dateStr = ticket.date || now.toLocaleDateString('pt-BR');
    const timeStr = ticket.timestamp || now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Senha ${ticket.number}</title>
          <style>
            @page { size: 58mm auto; margin: 0; }
            body { font-family: 'Courier New', monospace; width: 58mm; margin: 0; padding: 6px; text-align: center; color: #000; font-size: 11px; }
            .title { font-weight: bold; font-size: 13px; text-transform: uppercase; }
            .sub { font-size: 9px; margin-bottom: 5px; }
            .divider { border-top: 1px dashed #000; margin: 5px 0; }
            .type { font-size: 11px; font-weight: bold; text-transform: uppercase; margin: 4px 0; }
            .number { font-size: 32px; font-weight: 900; margin: 8px 0; letter-spacing: 1px; }
            .footer { font-size: 9px; margin-top: 5px; }
          </style>
        </head>
        <body>
          <div class="title">CMIP</div>
          <div class="divider"></div>
          <div class="type">${isPref ? '★ ATENDIMENTO PREFERENCIAL ★' : 'ATENDIMENTO NORMAL'}</div>
          ${isPref ? '<div style="font-size: 8px;">(Idoso / PCD / Gestante / Colo)</div>' : ''}
          <div class="number">${ticket.number}</div>
          <div class="divider"></div>
          <div>Data: ${dateStr} - ${timeStr}</div>
          <div class="divider"></div>
          <div class="footer">Aguarde ser chamado no<br>painel de TV da recepção.</div>
          <script>
            window.onload = function() { window.print(); setTimeout(function() { window.close(); }, 500); };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  async printTest() {
    const testTicket = {
      number: 'TEST-01',
      type: 'Normal',
      timestamp: new Date().toLocaleTimeString('pt-BR'),
      date: new Date().toLocaleDateString('pt-BR')
    };
    return await this.printTicket(testTicket);
  }
}

export const bluetoothPrinter = new BluetoothPrinterService();
export default bluetoothPrinter;
