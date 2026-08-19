/**
 * Where Apollo AI's conversations live.
 *
 * localStorage, deliberately. Projects belong on the server because they are
 * work that must survive a lost laptop; a chat history is a convenience, and
 * putting it behind an API would mean inventing an account model Apollo does
 * not have yet. The storage functions are isolated here so that when it does,
 * only this file changes.
 */

const KEY = 'apollo.ai.conversations';
const ACTIVE_KEY = 'apollo.ai.activeConversation';

/** Enough to find last week's thread, few enough to stay under the storage quota. */
const MAX_CONVERSATIONS = 40;

export function loadConversations() {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((c) => c && typeof c.id === 'string' && Array.isArray(c.messages));
  } catch {
    return [];
  }
}

export function saveConversations(list) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_CONVERSATIONS)));
  } catch {
    // Quota exhausted or storage disabled (private mode). History is a
    // convenience — never worth failing a conversation over.
  }
}

export function loadActiveId() {
  try {
    return window.localStorage.getItem(ACTIVE_KEY) || null;
  } catch {
    return null;
  }
}

export function saveActiveId(id) {
  try {
    if (id) window.localStorage.setItem(ACTIVE_KEY, id);
    else window.localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* see above */
  }
}

/** Short, collision-proof enough for a local list. */
export function newId() {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * A conversation's name, taken from its opening message.
 *
 * Local and instant rather than a second model call: a title that is there the
 * moment you press send beats a cleverer one that costs a request and arrives
 * after you have already moved on.
 */
export function titleFrom(message) {
  const text = String(message || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#*`>_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return 'New chat';
  const sentence = text.split(/(?<=[.?!])\s/)[0] || text;
  const title = sentence.length > 44 ? `${sentence.slice(0, 42).trimEnd()}…` : sentence;
  return title.charAt(0).toUpperCase() + title.slice(1);
}

/** "Today" / "Yesterday" / "Last 7 days" / "Older" — grouped for the history list. */
export function groupByAge(conversations) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86_400_000;
  const groups = new Map();

  for (const conversation of conversations) {
    const at = new Date(conversation.updatedAt || 0).getTime();
    const label =
      at >= startOfToday
        ? 'Today'
        : at >= startOfToday - day
          ? 'Yesterday'
          : at >= startOfToday - 7 * day
            ? 'Previous 7 days'
            : 'Older';
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(conversation);
  }

  return [...groups.entries()].map(([label, items]) => ({ label, items }));
}
