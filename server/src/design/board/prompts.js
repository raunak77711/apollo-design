/**
 * Jam board — what DeepSeek is told.
 *
 * The model is asked for *structure*, never geometry: which blocks a section
 * needs and what they say. Code places them (client/.../engine/layoutBoard.js).
 * That is the same split the design pipeline uses (planDesign + layout.js), and
 * it is what keeps a generated board aligned, centred and readable.
 *
 * The section prompt is arranged for DeepSeek's prefix cache: an identical
 * system prompt, then the whole brief, and only *then* the part that varies.
 * Twelve section calls therefore pay for the brief once.
 */

import { BLOCK_TYPES, LIMITS, TONES } from './schema.js';

/** One example per block type. A block type added to the schema must appear here (a test checks). */
export const BLOCK_SHAPES = {
  title: '{"type":"title","text":"YOUR WEBSITE\\nIS LOSING\\nYOU SALES","size":"xl"|"l"|"m","eyebrow":"optional small label","tone":"ink"}',
  statement: '{"type":"statement","text":"the claim the video lands on","emphasis":"loud"|"quiet","tone":"problem"}',
  bigtype: '{"type":"bigtype","text":"8:47 PM","caption":"optional line under it","tone":"ink"}',
  quote: '{"type":"quote","text":"\\"Do you service commercial properties?\\"","attribution":"optional, e.g. 10:30 PM"}',
  flow: '{"type":"flow","direction":"down"|"up"|"right","scale":"hero"|"normal"|"small","tone":"money","steps":[{"label":"GOOGLE","note":"optional","tone":"optional"}]}   // 2-9 steps',
  hub: '{"type":"hub","center":"BROWSER","links":"spokes"|"spokes+cross","tone":"tech","nodes":[{"label":"HTML"}]}   // 3-12 nodes',
  cards: '{"type":"cards","columns":2|3|4,"tone":"problem","items":[{"label":"Phone isn\'t clickable","tag":"LEAK","tone":"problem"}]}   // 2-12 items',
  compare: '{"type":"compare","left":{"heading":"GENERIC AI","tone":"tech","steps":[{"label":"QUESTION"}],"footnote":"optional"},"right":{"heading":"BUSINESS AI","tone":"money","steps":[{"label":"QUESTION"}]}}   // 1-7 steps a side',
  panels: '{"type":"panels","panels":[{"heading":"CONTENT","tone":"money","rows":[{"label":"Headline","state":"open"|"locked"}]}]}   // 1-3 panels, 1-8 rows',
  code: '{"type":"code","text":"<a href=\\"tel:+15551234567\\">","caption":"optional"}',
  timeline: '{"type":"timeline","direction":"right"|"down","tone":"problem","events":[{"when":"8:47 PM","label":"Form submitted"}]}   // 2-8 events',
  funnel: '{"type":"funnel","tone":"money","stages":[{"label":"Searches","value":"1,000"}]}   // 3-7 stages, widest first',
  browser: '{"type":"browser","url":"example.com","title":"optional","note":"optional","placeholder":"screenshot"|"blank"}',
};

const VOCABULARY = BLOCK_TYPES.map((type) => BLOCK_SHAPES[type]).join('\n');

const DENSITY_WORDS = {
  1: 'almost empty — one idea, lots of space',
  2: 'sparse',
  3: 'a normal section',
  4: 'busy — several ideas or a big diagram',
  5: 'dense — the visual peak; many parts on screen at once',
};

/* -------------------------------- outline -------------------------------- */

const OUTLINE_SYSTEM = `You are the producer of a video essay. A creator will screen-record themselves talking over a large visual board, scrolling from section to section. You read their brief and decide what the sections of that board are.

The brief mixes several kinds of text. Only ONE kind becomes sections:
- The narrative itself: the chapters, beats, flows, statements and diagrams the video will show. THIS becomes sections, in the brief's own order.
- Instructions about a tool or interface: toolbars, shortcuts, file names, storage, testing, "build me an HTML page", how software should behave. IGNORE these completely.
- Visual style guidance (white theme, typography, restraint, "premium"). IGNORE it: the board's look is built in.

Follow the brief's own chapter structure. If chapters are numbered, keep their numbering and order. If it has none, split the narrative into 6-14 sections at natural beats. Never more than ${LIMITS.sections}.

Return ONLY a JSON object:
{
  "title": "the video's title",
  "audience": "who it is for, a short phrase",
  "sections": [
    { "title": "SHORT SECTION TITLE, ${LIMITS.label} characters at most", "beat": "one sentence: what this section makes the viewer feel or understand", "density": 1 }
  ]
}

density is 1-5 and follows the video's arc: a section that opens or resolves the story is sparse (1-2); the middle builds (3-4); the section the brief describes as chaotic, exploding or the biggest visual moment is 5. If the brief describes a progression such as "simple, then complex, then chaos, then simplified", make the densities follow it.`;

export function buildOutlinePrompt(brief) {
  return {
    system: OUTLINE_SYSTEM,
    user: `BRIEF:\n${brief}\n\n---\n\nReturn the JSON outline now.`,
  };
}

/* -------------------------------- sections -------------------------------- */

const SECTION_SYSTEM = `You build ONE section of a visual board for a video essay. The creator will screen-record themselves scrolling down this board and talking, so every section must work as a big, sparse, readable picture — not a slide of bullet points.

You are given the creator's whole brief, then told which section to build. Build ONLY that section. The brief mixes real content with instructions about a tool, a toolbar, shortcuts, saving, or visual style: ignore all of that; it is not content.

Return ONLY a JSON object: { "blocks": [ ... ] } — between 2 and ${LIMITS.blocks} blocks, in reading order, top to bottom.

BLOCK VOCABULARY (use only these; this is the JSON shape of each):
${VOCABULARY}

TONES are colour roles — never write hex codes. Use: ${TONES.join(', ')}.
- money: revenue, customers, things that work, the good path.
- problem: leaks, failures, losses, the bad path.
- movement: the customer's journey, traffic, steps in motion.
- tech: infrastructure, code, secondary technical detail.
- ink: neutral headlines and plain statements.
- solution: the resolved end state.

CHOOSING A FORM FROM THE BRIEF'S PROSE
- "A ↓ B ↓ C", "A → B → C" or a numbered journey → flow. Direction "up" for a funnel that climbs toward a goal (the FIRST step is drawn at the bottom), "right" for short left-to-right chains of 2-5 steps, "down" otherwise. scale "hero" for the one journey that IS the section; "small" for a technical detail the brief says to keep subordinate.
- A network, dependency graph, architecture, or "everything connected to X" → hub. links "spokes+cross" when the point is tangled chaos, "spokes" otherwise.
- A grid of small labelled things, "leak cards", supporting elements → cards. Use a tag such as "LEAK" when the brief tags them.
- "versus", "generic … versus business …", before and after → compare.
- A panel with editable and locked fields → panels.
- One dominant clock, price or number such as "8:47 PM" or "$1,500" → bigtype.
- A spoken customer line or a quoted question → quote.
- A big claim the video lands on → statement: "loud" for the claim, "quiet" for a follow-up line.
- A code snippet or a metric list such as LCP · TBT → code (always visually subordinate).
- A sequence with times → timeline. A narrowing pipeline with counts → funnel. A picture of a web page or a screenshot the creator will drop in → browser.
- Open the section with a title or statement, unless the brief opens it with a bigtype.

FIDELITY
- Copy quoted strings and explicit flow labels from the brief EXACTLY, including capitalisation, punctuation and emoji. Prefer the brief's own words for labels.
- Never invent statistics, prices, company names, testimonials or claims that are not in the brief.
- If the brief says a product or brand should be introduced subtly, keep it a small title (size "m") or a code block, never a hero.

RULES
- Labels at most ${LIMITS.label} characters, statements at most ${LIMITS.statement}, code at most ${LIMITS.code}.
- Match the density you are given: 1 is one or two blocks with generous space; 3 is a normal section; 5 is dense — several diagrams, many nodes.
- No markdown, no commentary, no code fences. JSON only.`;

export function buildSectionPrompt({ brief, outline, index, note = '', issues = [] }) {
  const entry = outline.sections[index];
  const total = outline.sections.length;
  const previous = outline.sections[index - 1]?.title;
  const next = outline.sections[index + 1]?.title;

  const parts = [
    `BRIEF:\n${brief}`,
    '---',
    `Video: ${outline.title}${outline.audience ? ` — for ${outline.audience}` : ''}`,
    `Build section ${index + 1} of ${total}: "${entry.title}"`,
    entry.beat ? `What this section is for: ${entry.beat}` : '',
    `Density: ${entry.density}/5 (${DENSITY_WORDS[entry.density] || DENSITY_WORDS[3]})`,
    previous ? `Previous section: "${previous}"` : 'This is the first section.',
    next ? `Next section: "${next}"` : 'This is the last section.',
  ];
  if (note) parts.push(`Extra direction from the creator for this section: ${note}`);
  if (issues.length) parts.push(`Your previous attempt had these problems — fix them:\n- ${issues.join('\n- ')}`);
  parts.push('Return the JSON now.');

  return { system: SECTION_SYSTEM, user: parts.filter(Boolean).join('\n\n') };
}

/* ---------------------------------- edits ---------------------------------- */

const EDIT_SYSTEM = `You operate a visual board for a video essay. The creator gives you a plain instruction; you answer with a small list of OPERATIONS that carry it out. You never regenerate the board, and you do not write coordinates unless the instruction asks for an exact nudge.

You are given an OUTLINE of the board — its sections, their blocks, every named part with its id and current label, and the creator's own annotations — and the ids of what is currently SELECTED. Refer to things ONLY by those ids.

Return ONLY a JSON object: { "operations": [ ... ], "message": "one short sentence saying what you did" }

OPERATIONS (use only these):
{ "type":"SET_TEXT", "target":"<id>", "text":"..." }
{ "type":"SET_STYLE", "targets":["<id>"], "changes": { "fontFamily":"Inter|Geist|Space Grotesk|DM Sans|IBM Plex Mono|Source Serif 4", "fontSize":n, "fontWeight":"bold|normal|100-900", "italic":bool, "underline":bool, "color":"<tone or #hex>", "fill":"<tone|#hex|transparent>", "stroke":"<tone|#hex>", "strokeWidth":n, "opacity":0-1, "align":"left|center|right", "lineHeight":n, "letterSpacing":n, "radius":n, "dash":bool, "headEnd":bool, "headStart":bool } }
{ "type":"MOVE", "targets":["<id>"], "dx":n, "dy":n }   or   { "type":"MOVE", "targets":["<id>"], "relativeTo":"<id>", "position":"above|below|left|right|over", "gap":n, "align":"center|start|end" }
{ "type":"RESIZE", "targets":["<id>"], "scale":0.1-10 }
{ "type":"ROTATE", "targets":["<id>"], "angle":degrees }
{ "type":"DELETE", "targets":["<id>"] }   { "type":"RESTORE", "targets":["<id>"] }
{ "type":"INSERT_BLOCK", "section":"s3", "index":n, "block":{ ...a block } }
{ "type":"REPLACE_BLOCK", "target":"s3.b2", "block":{ ...a block } }
{ "type":"CONNECT", "from":"<id>", "to":"<id>", "tone":"problem", "dashed":bool }
{ "type":"ADD_TEXT", "text":"...", "style":{ ... }, "relativeTo":"<id>", "position":"below" }
{ "type":"ADD_SHAPE", "shape":"rectangle|circle", "width":n, "height":n, "style":{ ... }, "relativeTo":"<id>", "position":"over" }
{ "type":"ADD_ARROW", "from":"<id>", "to":"<id>", "dashed":bool, "tone":"problem" }
{ "type":"FOCUS", "target":"<id>" }

Block shapes for INSERT_BLOCK and REPLACE_BLOCK:
${VOCABULARY}

TONES: ${TONES.join(', ')}.

RULES
- Make the SMALLEST change that satisfies the instruction. "Make X bigger" is SET_STYLE fontSize or RESIZE, never a rebuild.
- Sizes are in board units: a body label is about 40, a headline about 90. "Huge" is 2-3 times the current size; "bigger" is 1.3-1.5 times.
- Use a whole block id ("s3.b2") to move, scale or delete a diagram as one; use a part id to change one label.
- "This", "it" and "these" mean the SELECTED ids. If nothing is selected and the instruction is ambiguous, pick the most likely id from the outline.
- To circle or box something: ADD_SHAPE relative to its id with position "over" and no width or height (it sizes itself around the target), in tone "problem" unless told otherwise. To point at something: ADD_ARROW.
- Never invent ids. If the instruction cannot be done with these operations, return { "operations": [], "message": "<why, in a few words>" }.
- No markdown, no commentary, no code fences. JSON only.`;

export function buildEditPrompt({ message, outline, selection = [] }) {
  return {
    system: EDIT_SYSTEM,
    user: [
      `OUTLINE:\n${JSON.stringify(outline)}`,
      `SELECTED: ${JSON.stringify(selection)}`,
      `INSTRUCTION: ${message}`,
      'Return the JSON now.',
    ].join('\n\n'),
  };
}
