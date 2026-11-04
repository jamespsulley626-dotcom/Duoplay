import { io } from 'socket.io-client';

/**
 * One socket per tab. Socket.IO handles reconnect with backoff; on every
 * (re)connect the room hook re-sends room:join with the stored token, and the
 * server reattaches the same seat and returns a fresh snapshot.
 */
export const socket = io({
  transports: ['websocket', 'polling'],
  reconnectionDelay: 500,
  reconnectionDelayMax: 4000,
});

/** Emit with an ack, normalised to { ok, ... } — never rejects. */
export function request(event, payload = {}) {
  return new Promise((resolve) => {
    socket.timeout(8000).emit(event, payload, (err, res) => {
      if (err) resolve({ ok: false, error: { code: 'TIMEOUT', message: 'Server did not respond' } });
      else resolve(res);
    });
  });
}
