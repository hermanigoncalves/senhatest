/**
 * Motor Financeiro de Split de Repasse Clínico sem Perda de Centavos
 * Desenvolvido segundo os padrões rigorosos de engenharia Addy Osmani / Google Mantis
 */

export function calculateFinancialSplit({
  grossAmount,
  gatewayFee = 0,
  suppliesCost = 0,
  rule = { split_type: 'PERCENTAGE', split_value: 50, deduct_card_fee: true, deduct_supplies: true }
}) {
  const grossCents = Math.round(Number(grossAmount || 0) * 100);
  const feeCents = rule.deduct_card_fee ? Math.round(Number(gatewayFee || 0) * 100) : 0;
  const suppliesCents = rule.deduct_supplies ? Math.round(Number(suppliesCost || 0) * 100) : 0;

  const baseCents = Math.max(0, grossCents - feeCents - suppliesCents);

  let professionalNetCents = 0;

  if (rule.split_type === 'PERCENTAGE') {
    const pct = Math.max(0, Math.min(100, Number(rule.split_value || 0)));
    professionalNetCents = Math.round(baseCents * (pct / 100));
  } else if (rule.split_type === 'FIXED') {
    const fixedCents = Math.round(Number(rule.split_value || 0) * 100);
    professionalNetCents = Math.min(baseCents, fixedCents);
  }

  const realFeeCents = Math.round(Number(gatewayFee || 0) * 100);
  const realSuppliesCents = Math.round(Number(suppliesCost || 0) * 100);
  const clinicNetCents = Math.max(0, grossCents - professionalNetCents - realFeeCents - realSuppliesCents);

  return {
    grossAmount: (grossCents / 100).toFixed(2),
    gatewayFee: (realFeeCents / 100).toFixed(2),
    suppliesCost: (realSuppliesCents / 100).toFixed(2),
    professionalNet: (professionalNetCents / 100).toFixed(2),
    clinicNet: (clinicNetCents / 100).toFixed(2),
    splitSnapshot: {
      split_type: rule.split_type,
      split_value: Number(rule.split_value),
      deduct_card_fee: Boolean(rule.deduct_card_fee),
      deduct_supplies: Boolean(rule.deduct_supplies),
      calculated_at: new Date().toISOString()
    }
  };
}

export function summarizeTransactions(transactions = []) {
  let totalGrossCents = 0;
  let totalFeeCents = 0;
  let totalSuppliesCents = 0;
  let totalProfessionalNetCents = 0;
  let totalClinicNetCents = 0;

  transactions.forEach((tx) => {
    totalGrossCents += Math.round(Number(tx.gross_amount || 0) * 100);
    totalFeeCents += Math.round(Number(tx.gateway_fee || 0) * 100);
    totalSuppliesCents += Math.round(Number(tx.supplies_cost || 0) * 100);
    totalProfessionalNetCents += Math.round(Number(tx.professional_net || 0) * 100);
    totalClinicNetCents += Math.round(Number(tx.clinic_net || 0) * 100);
  });

  return {
    count: transactions.length,
    totalGross: (totalGrossCents / 100).toFixed(2),
    totalFees: (totalFeeCents / 100).toFixed(2),
    totalSupplies: (totalSuppliesCents / 100).toFixed(2),
    totalProfessionalNet: (totalProfessionalNetCents / 100).toFixed(2),
    totalClinicNet: (totalClinicNetCents / 100).toFixed(2)
  };
}

export default {
  calculateFinancialSplit,
  summarizeTransactions
};
