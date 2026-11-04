import { useEffect, useRef, useState } from 'react';
import { C2S, LIMITS } from '@duoplay/shared';

export function ChatPanel({ chat, youId, act, seatsUI, className = '' }) {
  const [text, setText] = useState('');
  const listRef = useRef(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [chat.length]);

  async function send(e) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText('');
    const res = await act(C2S.CHAT_SEND, { text: t });
    if (!res.ok) setText(t);
  }

  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {chat.length === 0 && <p className="pt-6 text-center text-sm text-gray-400">No messages yet</p>}
        {chat.map((m) => {
          const mine = m.memberId === youId;
          const dot = m.seat !== null ? seatsUI?.[m.seat]?.dot : 'bg-gray-300';
          return (
            <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
              <span className="mb-0.5 flex items-center gap-1 text-[11px] text-gray-500">
                <span className={`size-2 rounded-full ${dot}`} />
                {m.from}
                {m.role === 'spectator' && ' (watching)'}
              </span>
              <span className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-sm break-words ${mine ? 'bg-accent text-white' : 'bg-gray-100 text-gray-900'}`}>{m.text}</span>
            </div>
          );
        })}
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-line p-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={LIMITS.CHAT_MAX}
          placeholder="Message"
          className="min-w-0 flex-1 rounded-lg border border-line px-3 py-2 text-base outline-none focus:border-accent"
        />
        <button type="submit" className="rounded-lg px-3 text-sm font-semibold text-accent hover:bg-accent-soft">Send</button>
      </form>
    </div>
  );
}

/** Mobile: floating button + bottom sheet with unread count. */
export function ChatSheet(props) {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(props.chat.length);
  useEffect(() => {
    if (open) setSeen(props.chat.length);
  }, [open, props.chat.length]);
  const unread = Math.max(0, props.chat.length - seen);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 flex h-11 items-center gap-2 rounded-full border border-line bg-white px-4 text-sm font-semibold shadow-md"
        aria-label="Open chat"
      >
        Chat
        {unread > 0 && <span className="min-w-5 rounded-full bg-red-500 px-1.5 text-xs leading-5 text-white">{unread}</span>}
      </button>
      {open && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end bg-black/30" onClick={() => setOpen(false)}>
          <div className="animate-pop flex h-[70dvh] flex-col rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <span className="font-semibold">Chat</span>
              <button type="button" onClick={() => setOpen(false)} className="rounded-md px-2 py-1 text-sm text-gray-500 hover:bg-gray-100">Close</button>
            </div>
            <ChatPanel {...props} className="flex-1" />
          </div>
        </div>
      )}
    </>
  );
}
