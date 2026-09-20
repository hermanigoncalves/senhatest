export const PROFILE_COLUMNS = 'id,full_name,role,active,must_change_password';

export function classifyProfile(profile) {
  if (!profile) return 'missing';
  if (!profile.active) return 'inactive';
  if (profile.must_change_password) return 'password_change';
  return 'ready';
}
