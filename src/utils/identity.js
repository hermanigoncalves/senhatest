const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 40;
const USERNAME_PATTERN = /^[a-z0-9]+(?:\.[a-z0-9]+)*$/;
const NAME_PARTICLES = new Set(['da', 'das', 'de', 'do', 'dos', 'e']);
const NAME_SUFFIXES = new Set(['filho', 'junior', 'neto', 'sobrinho']);

export function normalizeUsername(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .replace(/\.{2,}/g, '.')
    .slice(0, USERNAME_MAX_LENGTH)
    .replace(/\.+$/g, '');
}

export function isValidUsername(value = '') {
  const username = String(value);
  return (
    username.length >= USERNAME_MIN_LENGTH &&
    username.length <= USERNAME_MAX_LENGTH &&
    USERNAME_PATTERN.test(username) &&
    normalizeUsername(username) === username
  );
}

export function buildUsernameCandidates(fullName = '') {
  const tokens = String(fullName)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const meaningful = tokens.filter((token) => !NAME_PARTICLES.has(token));
  if (!meaningful.length) return [];

  const first = meaningful[0];
  const hasSuffix = NAME_SUFFIXES.has(meaningful.at(-1));
  const familyTokens = meaningful.slice(1).filter((token) => !NAME_SUFFIXES.has(token));
  const candidates = [];
  const add = (candidate) => {
    const normalized = normalizeUsername(candidate);
    if (isValidUsername(normalized) && !candidates.includes(normalized)) candidates.push(normalized);
  };

  if (hasSuffix && tokens.length >= 5) add(first);
  if (familyTokens[0]) add(`${first}.${familyTokens[0]}`);
  if (familyTokens.at(-1)) add(`${first}.${familyTokens.at(-1)}`);
  familyTokens.slice(1, -1).forEach((token) => add(`${first}.${token}`));
  add(first);
  return candidates;
}

export function suggestUsername(fullName, existingUsernames = []) {
  const occupied = new Set(existingUsernames.map(normalizeUsername).filter(Boolean));
  const candidates = buildUsernameCandidates(fullName);
  const selectedIndex = candidates.findIndex((candidate) => !occupied.has(candidate));
  const username = selectedIndex >= 0 ? candidates[selectedIndex] : null;
  return {
    username,
    candidates,
    collisionDetected: selectedIndex > 0 || (selectedIndex < 0 && candidates.length > 0),
    requiresManualReview: selectedIndex !== 0,
  };
}

export function parseLoginIdentifier(identifier = '') {
  const value = String(identifier).trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return { kind: 'email', email: value.toLowerCase() };
  }
  const username = normalizeUsername(value);
  if (username === value.toLowerCase() && isValidUsername(username)) {
    return { kind: 'username', username };
  }
  return { kind: 'invalid' };
}
