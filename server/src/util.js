import { randomBytes, randomInt } from 'node:crypto';
import { CODE_ALPHABET, LIMITS } from '@duoplay/shared';

export function makeRoomCode() {
  let code = '';
  for (let i = 0; i < LIMITS.CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

/** 128-bit secret that proves seat ownership across reconnects. Never broadcast. */
export function makeToken() {
  return randomBytes(16).toString('base64url');
}

export function makeId() {
  return randomBytes(6).toString('base64url');
}

/** Strip control characters, collapse whitespace, cap length. */
export function cleanText(raw, max) {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Token bucket: `capacity` burst, refilled at `refillPerSec`. Returns a () => boolean. */
export function createRateLimiter({ capacity = 20, refillPerSec = 8 } = {}) {
  let tokens = capacity;
  let last = Date.now();
  return () => {
    const now = Date.now();
    tokens = Math.min(capacity, tokens + ((now - last) / 1000) * refillPerSec);
    last = now;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
}
