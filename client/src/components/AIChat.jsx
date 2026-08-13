import { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, Loader2 } from 'lucide-react';
import { useEditor } from '../state/EditorContext.jsx';
import { api } from '../api/client.js';

const SUGGESTIONS = [
  'Create a promotional banner for Aryans Gym. Modern, dark, premium, red accents, a muscular athlete, headline "TRANSFORM YOUR BODY", and a "JOIN NOW" button.',
  'Make the headline bigger',
  'Change the button color to blue',
  'Move the image to the right',
];

export default function AIChat() {
  const { state, actions } = useEditor();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', text: "Hi, I'm Apollo. Describe a design to create, or ask me to tweak what's on the canvas." },
  ]);
  const listRef = useRef(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  const send = async (text) => {
    const message = (text ?? input).trim();
    if (!message || busy) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text: message }]);
    setBusy(true);
    try {
      const res = await api.aiChat({
        message,
        document: state.document,
        selectedElementId: state.selectedElementId,
      });
      if (res.operations?.length) {
        // Apply AI operations as ONE undoable history entry via the shared system.
        actions.apply(res.operations);
      }
      const note = res.skipped?.length ? ` (${res.skipped.length} operation(s) were rejected by validation)` : '';
      setMessages((m) => [...m, { role: 'assistant', text: (res.message || 'Done.') + note }]);
    } catch (err) {
      setMessages((m) => [...m, { role: 'assistant', text: `Sorry, that failed: ${err.message}`, error: true }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div ref={listRef} className="flex-1 overflow-y-auto thin-scroll p-3 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
              m.role === 'user' ? 'bg-accent text-white' : m.error ? 'bg-red-500/15 text-red-300' : 'bg-panel2 text-neutral-200'
            }`}>
              {m.role === 'assistant' && !m.error && (
                <div className="flex items-center gap-1 text-xs text-neutral-500 mb-1"><Sparkles size={12} /> Apollo</div>
              )}
              {m.text}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-sm text-neutral-500"><Loader2 size={14} className="animate-spin" /> Apollo is working…</div>
        )}
        {messages.length <= 1 && (
          <div className="pt-2 space-y-1.5">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => send(s)} className="block w-full text-left text-xs text-neutral-400 hover:text-white bg-panel2 hover:bg-edge rounded px-2 py-1.5">
                {s.length > 70 ? s.slice(0, 70) + '…' : s}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="p-2 border-t border-edge flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Ask Apollo…"
          className="input mt-0"
          disabled={busy}
        />
        <button onClick={() => send()} disabled={busy} className="px-3 rounded bg-accent text-white disabled:opacity-50 flex items-center">
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
