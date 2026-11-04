// Per-device identity. The token is the only thing that proves seat ownership,
// so it lives in localStorage (survives refresh, app switch, network drop).
const NAME_KEY = 'duoplay:name';
const tokenKey = (code) => `duoplay:token:${code}`;

function safe(fn, fallback = null) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export const getName = () => safe(() => localStorage.getItem(NAME_KEY), '') ?? '';
export const setName = (name) => safe(() => localStorage.setItem(NAME_KEY, name));
export const getToken = (code) => safe(() => localStorage.getItem(tokenKey(code)));
export const setToken = (code, token) => safe(() => localStorage.setItem(tokenKey(code), token));
export const clearToken = (code) => safe(() => localStorage.removeItem(tokenKey(code)));

export const roomLink = (code) => `${location.origin}/r/${code}`;

/** Accept a bare code or a pasted share link. */
export function extractCode(input) {
  const match = String(input).match(/\/r\/([A-Za-z0-9]+)/);
  return (match ? match[1] : input).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
}
