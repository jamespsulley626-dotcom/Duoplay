import { ERR } from '@duoplay/shared';

/** An expected, user-facing failure. Anything else is treated as a 500. */
export class GameError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function assert(condition, code = ERR.BAD_REQUEST, message = 'Bad request') {
  if (!condition) throw new GameError(code, message);
}
