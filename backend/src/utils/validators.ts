export function isEmail(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const s = v.trim();
  if (s.length === 0 || s.length > 254) return false;

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export function isPasswordValid(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const s = v.trim();
  if (s.length < 8) return false;

  return /[A-Z]/.test(s) &&
    /[a-z]/.test(s) &&
    /[0-9]/.test(s) &&
    /[!@#$%^&*(),.?":{}|<>~`_\-+=\[\];']/.test(s);
}

export function isUsernameValid(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const s = v.trim();

  return /^[A-Za-z0-9_]{3,30}$/.test(s);
}

export function isValidUrl(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const s = v.trim();
  if (s.length === 0 || s.length > 2048) return false;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function stripTags(input?: string | null): string {
  if (!input) return '';
  return input.replace(/<\/?[^>]+(>|$)/g, '').trim();
}

export function isDisplayNameValid(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const s = v.trim();
  return s.length > 0 && s.length <= 100;
}