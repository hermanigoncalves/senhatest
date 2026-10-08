// Nome exibido ao público (TV): primeiro nome + inicial do último sobrenome.
export const publicPatientName = (value = '') => {
  const parts = String(value).trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] || 'Paciente';
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
};
