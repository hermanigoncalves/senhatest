export const CAPABILITIES = Object.freeze({
  RECEPTION: 'reception',
  RECEPTION_SUPERUSER: 'reception:superuser',
  DOCTOR_SELF: 'doctor:self',
  DOCTOR_DELEGATED: 'doctor:delegated',
  ADMINISTRATION: 'administration',
  MASTER_ADMINISTRATION: 'administration:master',
});

const ROLE_CAPABILITIES = Object.freeze({
  receptionist: [CAPABILITIES.RECEPTION],
  doctor: [CAPABILITIES.DOCTOR_SELF],
  admin: [
    CAPABILITIES.RECEPTION,
    CAPABILITIES.RECEPTION_SUPERUSER,
    CAPABILITIES.DOCTOR_DELEGATED,
    CAPABILITIES.ADMINISTRATION,
    CAPABILITIES.MASTER_ADMINISTRATION,
  ],
  master: [
    CAPABILITIES.RECEPTION,
    CAPABILITIES.RECEPTION_SUPERUSER,
    CAPABILITIES.DOCTOR_DELEGATED,
    CAPABILITIES.ADMINISTRATION,
    CAPABILITIES.MASTER_ADMINISTRATION,
  ],
});

export function hasCapability(role, capability) {
  return ROLE_CAPABILITIES[role]?.includes(capability) ?? false;
}

export function operationalModules(role) {
  const modules = [];
  if (hasCapability(role, CAPABILITIES.ADMINISTRATION)) {
    modules.push({
      id: 'administration',
      label: role === 'master' ? 'Administração Master' : 'Administração',
    });
  }
  if (hasCapability(role, CAPABILITIES.RECEPTION)) {
    modules.push({ id: 'reception', label: 'Recepção' });
  }
  if (hasCapability(role, CAPABILITIES.DOCTOR_DELEGATED)) {
    modules.push({ id: 'doctor', label: 'Atuar como médico' });
  }
  return modules;
}
