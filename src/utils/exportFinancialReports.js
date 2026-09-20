/**
 * Utilitário de Exportação de Relatórios Financeiros e Repasses Médicos — CMIP
 * Compatível com Microsoft Excel (UTF-8 com BOM) e Impressão / PDF Oficial.
 */

/**
 * Formata valor numérico para Moeda Brasileira (R$ 1.250,00)
 */
export function formatCurrencyBRL(val) {
  const num = Number(val) || 0;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Formata número para formato numérico do Excel PT-BR (1250,50)
 */
export function formatExcelNumber(val) {
  const num = Number(val) || 0;
  return num.toFixed(2).replace('.', ',');
}

/**
 * Exporta dados de transações para planilha Excel (.csv estruturado com BOM UTF-8)
 */
export function exportToExcelCSV(data, filename = 'extrato_repasses_cmip.csv') {
  const transactions = data?.transactions || [];
  const summary = data?.summary || {};
  const doctorName = data?.doctorName || 'Todos os Profissionais';
  const periodStr = data?.periodStr || new Date().toLocaleDateString('pt-BR');

  const rows = [];

  // 1. Cabeçalho de Identificação do Relatório
  rows.push(['CENTRO MÉDICO INTEGRADO PIRATININGA - CMIP']);
  rows.push(['RELATÓRIO DE FECHAMENTO FINANCEIRO E REPASSES MÉDICOS']);
  rows.push(['Profissional:', doctorName]);
  rows.push(['Período de Competência:', periodStr]);
  rows.push(['Data de Emissão:', new Date().toLocaleString('pt-BR')]);
  rows.push([]);

  // 2. Cabeçalho da Tabela Contábil
  rows.push([
    'ID',
    'Data',
    'Hora',
    'Médico / Prestador',
    'Paciente',
    'Serviço / Consulta',
    'Forma de Pgto',
    'Faturamento Bruto (R$)',
    'Taxa Cartão (R$)',
    'Insumos / Custos (R$)',
    'Líquido Clínica (R$)',
    'Líquido Médico (R$)',
    'Status do Repasse'
  ]);

  // 3. Linhas de Atendimento
  transactions.forEach((tx) => {
    const createdAt = tx.created_at ? new Date(tx.created_at) : new Date();
    const dateStr = createdAt.toLocaleDateString('pt-BR');
    const timeStr = createdAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    rows.push([
      tx.id || '-',
      dateStr,
      timeStr,
      tx.doctor?.name || tx.doctor_name || doctorName,
      tx.patient_name || tx.appointment?.patient_name || 'Paciente',
      tx.service_name || tx.appointment?.service || 'Consulta Especializada',
      tx.payment_method || 'Cartão',
      formatExcelNumber(tx.gross_amount),
      formatExcelNumber(tx.gateway_fee),
      formatExcelNumber(tx.supplies_cost),
      formatExcelNumber(tx.clinic_net),
      formatExcelNumber(tx.professional_net),
      tx.payment_status || 'PAGO'
    ]);
  });

  // 4. Linha de Totais
  rows.push([]);
  rows.push([
    'TOTAL GERAL',
    '',
    '',
    '',
    '',
    `Total Atendimentos: ${summary.totalCount || transactions.length}`,
    '',
    formatExcelNumber(summary.totalGross),
    formatExcelNumber(summary.totalGatewayFee),
    formatExcelNumber(summary.totalSuppliesCost),
    formatExcelNumber(summary.totalClinicNet),
    formatExcelNumber(summary.totalProfessionalNet),
    ''
  ]);

  // 5. Converte para string CSV delimitada por ponto-e-vírgula (padrão Excel Brasil)
  const csvContent = '\uFEFF' + rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\r\n');

  // 6. Dispara download
  if (typeof window !== 'undefined') {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return csvContent;
}

/**
 * Gera documento de Extrato de Repasse Médico formatado para Impressão / PDF
 */
export function generatePrintableRepassPDF(data) {
  if (typeof window === 'undefined') return;

  const doctor = data?.doctor || {};
  const doctorName = doctor.name || data?.doctorName || 'Dr. Médico Especialista';
  const crm = doctor.crm ? `${doctor.crm}/${doctor.crm_uf || 'SP'}` : 'CRM Ativo';
  const specialty = doctor.specialty || 'Medicina Geral';
  const pixKey = doctor.pix_key || data?.pixKey || 'Chave Pix cadastrada na recepção';
  const periodStr = data?.periodStr || new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const summary = data?.summary || {};
  const transactions = data?.transactions || [];

  const printWindow = window.open('', '_blank', 'width=950,height=800');
  if (!printWindow) {
    alert('Por favor, autorize pop-ups para visualizar e imprimir o Extrato em PDF.');
    return;
  }

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Extrato de Repasse Médico - ${doctorName} (${periodStr})</title>
      <style>
        @page { size: A4; margin: 15mm; }
        body {
          font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif;
          color: #0f172a;
          background: #fff;
          margin: 0;
          padding: 24px;
          font-size: 12px;
          line-height: 1.4;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 2px solid #0284c7;
          padding-bottom: 16px;
          margin-bottom: 20px;
        }
        .logo-box { max-width: 180px; }
        .logo-box img { max-height: 50px; }
        .clinic-info { text-align: right; }
        .clinic-info h1 { margin: 0; font-size: 16px; color: #0369a1; text-transform: uppercase; font-weight: 800; }
        .clinic-info p { margin: 2px 0 0; color: #64748b; font-size: 11px; }
        
        .doc-card {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 20px;
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: 16px;
        }
        .doc-title { font-size: 15px; font-weight: 800; color: #0f172a; margin-bottom: 4px; }
        .doc-subtitle { font-size: 12px; color: #475569; font-weight: 600; }
        .pix-box {
          background: #ecfdf5;
          border: 1px solid #a7f3d0;
          padding: 10px 14px;
          border-radius: 10px;
          font-size: 11px;
          color: #065f46;
        }
        .pix-label { font-weight: 800; text-transform: uppercase; font-size: 10px; color: #047857; margin-bottom: 2px; }
        .pix-value { font-family: monospace; font-size: 12px; font-weight: 700; }

        .summary-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin-bottom: 24px;
        }
        .summary-card {
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
          padding: 12px;
          border-radius: 10px;
          text-align: center;
        }
        .summary-card.highlight {
          background: #f0fdf4;
          border-color: #86efac;
        }
        .summary-card .label { font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; }
        .summary-card .value { font-size: 16px; font-weight: 800; color: #0f172a; margin-top: 4px; }
        .summary-card.highlight .value { color: #15803d; font-size: 18px; }

        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 24px;
          font-size: 11px;
        }
        th {
          background: #0f172a;
          color: #fff;
          text-align: left;
          padding: 8px 10px;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        td {
          padding: 7px 10px;
          border-bottom: 1px solid #e2e8f0;
        }
        tr:nth-child(even) { background: #f8fafc; }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
        .badge {
          display: inline-block;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
        }
        .badge-paid { background: #dcfce7; color: #166534; }
        .badge-transferred { background: #e0e7ff; color: #3730a3; }

        .signature-section {
          margin-top: 40px;
          padding-top: 20px;
          border-top: 1px dashed #cbd5e1;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 40px;
          page-break-inside: avoid;
        }
        .signature-line {
          border-top: 1px solid #475569;
          padding-top: 6px;
          text-align: center;
          font-size: 11px;
          color: #334155;
        }
        .signature-title { font-weight: 700; color: #0f172a; }
        .footer {
          margin-top: 30px;
          text-align: center;
          font-size: 10px;
          color: #94a3b8;
        }
        @media print {
          body { padding: 0; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="no-print" style="background: #0284c7; color: #fff; padding: 12px; border-radius: 8px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
        <span style="font-weight: bold;">📄 Visualização do Extrato Oficial CMIP</span>
        <div>
          <button onclick="window.print()" style="background: #fff; color: #0369a1; border: none; padding: 6px 14px; border-radius: 6px; font-weight: bold; cursor: pointer; margin-right: 8px;">🖨️ Imprimir / Salvar PDF</button>
          <button onclick="window.close()" style="background: rgba(255,255,255,0.2); color: #fff; border: 1px solid #fff; padding: 6px 14px; border-radius: 6px; cursor: pointer;">Fechar</button>
        </div>
      </div>

      <div class="header">
        <div class="logo-box">
          <img src="/logo.png" alt="Logo CMIP" onerror="this.style.display='none'">
        </div>
        <div class="clinic-info">
          <h1>Centro Médico Integrado Piratininga</h1>
          <p>Extrato Oficial de Fechamento de Honorários & Repasses</p>
          <p><strong>Competência:</strong> ${periodStr} | <strong>Emissão:</strong> ${new Date().toLocaleDateString('pt-BR')}</p>
        </div>
      </div>

      <div class="doc-card">
        <div>
          <div class="doc-title">${doctorName}</div>
          <div class="doc-subtitle">${specialty} • CRM: ${crm}</div>
          <div style="font-size: 11px; color: #64748b; margin-top: 4px;">Total de Atendimentos no Período: <strong>${summary.totalCount || transactions.length}</strong></div>
        </div>
        <div class="pix-box">
          <div class="pix-label">Chave Pix para Transferência:</div>
          <div class="pix-value">${pixKey}</div>
        </div>
      </div>

      <div class="summary-grid">
        <div class="summary-card">
          <div class="label">Faturamento Bruto</div>
          <div class="value">${formatCurrencyBRL(summary.totalGross)}</div>
        </div>
        <div class="summary-card">
          <div class="label">Taxas de Cartão (-)</div>
          <div class="value" style="color: #b91c1c;">-${formatCurrencyBRL(summary.totalGatewayFee)}</div>
        </div>
        <div class="summary-card">
          <div class="label">Insumos / Custos (-)</div>
          <div class="value" style="color: #b91c1c;">-${formatCurrencyBRL(summary.totalSuppliesCost)}</div>
        </div>
        <div class="summary-card highlight">
          <div class="label">Líquido do Médico</div>
          <div class="value">${formatCurrencyBRL(summary.totalProfessionalNet)}</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Data/Hora</th>
            <th>Paciente</th>
            <th>Procedimento</th>
            <th>Pgto</th>
            <th class="text-right">Bruto</th>
            <th class="text-right">Taxa</th>
            <th class="text-right">Insumo</th>
            <th class="text-right">Líq. Médico</th>
            <th class="text-center">Status</th>
          </tr>
        </thead>
        <tbody>
          ${transactions.length === 0 ? '<tr><td colspan="9" class="text-center" style="padding: 20px; color: #94a3b8;">Nenhum atendimento registrado neste período.</td></tr>' : transactions.map(tx => `
            <tr>
              <td>${new Date(tx.created_at).toLocaleDateString('pt-BR')} ${new Date(tx.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</td>
              <td><strong>${tx.patient_name || tx.appointment?.patient_name || 'Paciente'}</strong></td>
              <td>${tx.service_name || tx.appointment?.service || 'Consulta'}</td>
              <td>${tx.payment_method || 'Cartão'}</td>
              <td class="text-right">${formatCurrencyBRL(tx.gross_amount)}</td>
              <td class="text-right" style="color: #b91c1c;">-${formatCurrencyBRL(tx.gateway_fee)}</td>
              <td class="text-right" style="color: #b91c1c;">-${formatCurrencyBRL(tx.supplies_cost)}</td>
              <td class="text-right" style="font-weight: 800; color: #15803d;">${formatCurrencyBRL(tx.professional_net)}</td>
              <td class="text-center"><span class="badge ${tx.payment_status === 'TRANSFERIDO' ? 'badge-transferred' : 'badge-paid'}">${tx.payment_status || 'PAGO'}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="signature-section">
        <div class="signature-line">
          <div class="signature-title">${doctorName}</div>
          <div>Médico / Prestador de Serviço</div>
          <div style="font-size: 9px; color: #94a3b8; margin-top: 4px;">Declaro ter conferido e aprovado o fechamento acima</div>
        </div>
        <div class="signature-line">
          <div class="signature-title">Diretoria Financeira CMIP</div>
          <div>Centro Médico Integrado Piratininga</div>
          <div style="font-size: 9px; color: #94a3b8; margin-top: 4px;">Quitação e liberação de transferência Pix</div>
        </div>
      </div>

      <div class="footer">
        Documento gerado automaticamente pelo Sistema Integrado CMIP em ${new Date().toLocaleString('pt-BR')}.
      </div>
    </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
}