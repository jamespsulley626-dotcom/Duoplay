import { useCallback, useEffect, useState } from 'react';
import { C2S, ERR, LIMITS, S2C } from '@duoplay/shared';
import { getToken, setToken } from '../lib/session.js';
import { request, socket } from '../net/socket.js';

const stamp = (room) => room && { ...room, receivedAt: Date.now() };

/**
 * Joins (or rejoins) a room and keeps a live snapshot.
 * The server is the only source of truth: the client never mutates game
 * state locally, it just renders whatever `room:state` says.
 */
export function useRoom(code, name, { asSpectator = false } = {}) {
  const [room, setRoom] = useState(null);
  const [chat, setChat] = useState([]);
  const [error, setError] = useState(null);
  const [fatal, setFatal] = useState(null); // room missing / replaced: stop retrying
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    if (!name) return undefined;
    let cancelled = false;

    async function join() {
      const res = await request(C2S.ROOM_JOIN, { code, name, token: getToken(code), asSpectator });
      if (cancelled) return;
      if (!res.ok) {
        if (res.error.code === ERR.ROOM_NOT_FOUND) setFatal(res.error);
        else setError(res.error);
        return;
      }
      setToken(res.code, res.token);
      setChat(res.chat ?? []);
      setRoom(stamp(res.room));
      setFatal(null);
    }

    const onConnect = () => {
      setConnected(true);
      join();
    };
    const onDisconnect = () => setConnected(false);
    const onState = (snap) => snap.code === code && setRoom(stamp(snap));
    const onChat = (msg) => setChat((c) => [...c.slice(-(LIMITS.CHAT_HISTORY - 1)), msg]);
    const onError = (err) => (err.code === ERR.SESSION_REPLACED ? setFatal(err) : setError(err));

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on(S2C.ROOM_STATE, onState);
    socket.on(S2C.CHAT_MESSAGE, onChat);
    socket.on(S2C.ERROR, onError);
    if (socket.connected) join();

    return () => {
      cancelled = true;
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off(S2C.ROOM_STATE, onState);
      socket.off(S2C.CHAT_MESSAGE, onChat);
      socket.off(S2C.ERROR, onError);
    };
  }, [code, name, asSpectator]);

  /** Send an action; surface errors as a toast. Stale/illegal moves are auto-resynced by the server. */
  const act = useCallback(async (event, payload) => {
    const res = await request(event, payload);
    if (!res.ok && res.error.code !== ERR.STALE_STATE) setError(res.error);
    return res;
  }, []);

  return { room, chat, error, clearError: () => setError(null), fatal, connected, act };
}
