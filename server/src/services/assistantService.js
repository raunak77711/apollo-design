import { getAIProvider } from './ai/index.js';

/**
 * Apollo AI — the general-purpose assistant.
 *
 * This is deliberately a separate service from `aiService`, which exists to
 * turn language into design operations. That one is a compiler; this one is a
 * conversation. They share a provider (`services/ai`) and nothing else, which
 * is the right seam: swapping the model behind Apollo AI must not be able to
 * change how a poster gets built, and vice versa.
 *
 * Everything a future capability would need to hook into lives here rather than
 * in the route or the UI:
 *
 *   buildSystemPrompt()  ← where retrieved context is injected
 *   prepareTurn()        ← where a request is classified and enriched
 *   streamReply()        ← where a tool loop would wrap the provider call
 *
 * None of those are speculative abstractions; they are the three functions the
 * feature already needs, written so the next one has somewhere obvious to go.
 */

/** Turns kept in context. Old enough to remember the thread, short enough to stay fast. */
const MAX_HISTORY_TURNS = 24;

/** A single message. Long enough for a pasted stack trace or a whole component. */
const MAX_MESSAGE_CHARS = 24_000;

/** Total characters of history sent upstream, oldest dropped first. */
const MAX_CONTEXT_CHARS = 60_000;

/**
 * What Apollo AI knows about the product it lives inside.
 *
 * Kept short on purpose. This is not a manual — it is enough for the assistant
 * to answer "what can I make here?" without guessing, and to point somewhere
 * real. When retrieval arrives, it appends to this rather than replacing it.
 */
const APOLLO_CONTEXT = `Apollo is a design environment. Its Design Studio generates finished, fully
editable designs from a written brief — posters, social posts, banners, flyers, menus, logos,
invitations and advertisements — and opens them as live layers in an editor with text, shapes,
images, icons, charts, filters and effects. Scribble turns a rough drawing into a real design.
Templates are finished layouts to start from. You are Apollo AI, a separate space in the same
product: a general assistant, not the design generator. If someone wants a design *made*, point
them at the Design Studio on the home page; if they want to think, learn, write or debug, that is
you.`;

/**
 * The assistant's character.
 *
 * The single most important line here is the one about scope. An assistant that
 * lives inside a design tool is under constant pressure — from its own context —
 * to decide it is a design assistant. It is not. It is a general assistant that
 * happens to know about Apollo.
 */
function buildSystemPrompt({ context } = {}) {
  const parts = [
    `You are Apollo AI, a general-purpose AI assistant.

You help with anything: coding, learning, research, writing, brainstorming, analysis, everyday
questions, and ordinary conversation. You are not limited to design or to Apollo — if someone asks
where Nepal is, who Einstein was, how gravity works or how to learn Python, answer properly and in
full. Never deflect with "I'm only a design assistant"; that is not what you are.

How you write:
- Answer the question that was asked, directly, in the first sentence.
- Use GitHub-flavoured markdown: headings, lists, tables, **bold**, \`inline code\` and fenced code
  blocks with a language tag.
- Always tag code fences with their language (\`\`\`js, \`\`\`python, \`\`\`bash).
- Keep prose tight. Prefer a short paragraph and a concrete example over a long preamble.
- No filler openings ("Great question!"), no restating the question, no unnecessary apologies.
- Match depth to the ask: a one-line question gets a short answer; "explain X" gets structure and
  a worked example.

When helping with code:
- Show working code, not a sketch. Name the language.
- Explain the *why*, briefly, after the code rather than before it.
- When debugging, say what is wrong first, then the fix, then why it happened.
- Assume the beginner might be reading. Define a term the first time it matters, then move on.

Be honest. If you are unsure, say so. If something depends on information more recent than you
have, say that plainly rather than guessing — you do not currently have web access.`,
    `About the product you live in:\n${APOLLO_CONTEXT}`,
  ];

  // The injection point for retrieval, design context, or a document the user
  // sent over from the editor. Nothing supplies it yet; the shape is the point.
  if (context) parts.push(`Additional context for this conversation:\n${context}`);

  return parts.join('\n\n');
}

/** One clean, bounded message, or null if there is nothing usable in it. */
function readMessage(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const role = raw.role === 'assistant' ? 'assistant' : raw.role === 'user' ? 'user' : null;
  if (!role) return null;
  const content = typeof raw.content === 'string' ? raw.content.trim() : '';
  if (!content) return null;
  return { role, content: content.slice(0, MAX_MESSAGE_CHARS) };
}

/**
 * Turn whatever the client posted into a transcript worth sending upstream.
 *
 * Trims from the oldest end on both counts, then drops any leading assistant
 * turn — a conversation that starts mid-answer confuses every model there is.
 */
function normalizeMessages(raw) {
  const clean = (Array.isArray(raw) ? raw : []).map(readMessage).filter(Boolean);
  const recent = clean.slice(-MAX_HISTORY_TURNS);

  let budget = MAX_CONTEXT_CHARS;
  const kept = [];
  for (let i = recent.length - 1; i >= 0; i -= 1) {
    budget -= recent[i].content.length;
    if (budget < 0 && kept.length) break;
    kept.unshift(recent[i]);
  }
  while (kept.length && kept[0].role === 'assistant') kept.shift();
  return kept;
}

/**
 * Everything that happens between "a request arrived" and "ask the model".
 *
 * Today that is validation and a system prompt. It is also exactly where a
 * router would decide this question needs current information and attach search
 * results, or where an editor document would be summarised into context — which
 * is why it returns a prepared turn rather than just a boolean.
 */
function prepareTurn({ messages, context }) {
  const history = normalizeMessages(messages);
  if (!history.length) return { error: 'a message is required' };
  return { messages: history, system: buildSystemPrompt({ context }) };
}

/**
 * Ask the model, streaming each fragment through `onToken`.
 *
 * Resolves with the complete text. Throws on upstream failure; the route turns
 * that into something a person can read.
 */
export async function streamReply({ messages, context, onToken, signal }) {
  const turn = prepareTurn({ messages, context });
  if (turn.error) throw Object.assign(new Error(turn.error), { status: 400 });

  const { text } = await getAIProvider().converse({
    system: turn.system,
    messages: turn.messages,
    onToken,
    signal,
  });

  return { text: text || '' };
}
