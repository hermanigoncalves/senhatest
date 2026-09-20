export function digits(value = '') { return String(value).replace(/\D/g, ''); }
export function isValidCpf(value) {
  const cpf = digits(value);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const check = (length) => {
    let sum = 0;
    for (let i = 0; i < length; i += 1) sum += Number(cpf[i]) * (length + 1 - i);
    const n = (sum * 10) % 11;
    return (n === 10 ? 0 : n) === Number(cpf[length]);
  };
  return check(9) && check(10);
}
export function formatCpf(value = '') { return digits(value).slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2'); }
export function formatTicket(value) { return String(Number(value) || 0).padStart(4, '0'); }
