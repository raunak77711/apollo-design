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

import { BLOCK_TYPES, ICONS, LIMITS, TONES } from './schema.js';

/** One example per block type. A block type added to the schema must appear here (a test checks). */
export const BLOCK_SHAPES = {
  title: '{"type":"title","text":"YOUR WEBSITE\\nIS LOSING\\nYOU SALES","size":"xl"|"l"|"m","eyebrow":"optional small label","tone":"ink"}',
  statement: '{"type":"statement","text":"the claim the video lands on","emphasis":"loud"|"quiet"|"inverse","tone":"problem"}   // "inverse" = a black band: the ONE punchline of a section',
  bigtype: '{"type":"bigtype","text":"8:47 PM","caption":"optional line under it","tone":"ink"}',
  quote: '{"type":"quote","text":"\\"Do you service commercial properties?\\"","attribution":"optional, e.g. 10:30 PM"}',
  flow: '{"type":"flow","direction":"down"|"up"|"right","scale":"hero"|"normal"|"small","tone":"money","steps":[{"label":"GOOGLE","note":"optional","tone":"optional","icon":"search"}]}   // 2-14 steps; an icon on most steps makes a chain readable at a glance',
  hub: '{"type":"hub","center":"BROWSER","links":"spokes"|"spokes+cross","tone":"tech","nodes":[{"label":"HTML"}]}   // 3-12 nodes',
  cards: '{"type":"cards","columns":2|3|4,"tone":"problem","items":[{"label":"Phone isn\'t clickable","tag":"LEAK","tone":"problem","icon":"phone-off"}]}   // 2-12 items',
  compare: '{"type":"compare","left":{"heading":"GENERIC AI","tone":"tech","steps":[{"label":"QUESTION"}],"footnote":"optional"},"right":{"heading":"BUSINESS AI","tone":"money","steps":[{"label":"QUESTION"}]}}   // 1-7 steps a side',
  panels: '{"type":"panels","panels":[{"heading":"CONTENT","tone":"money","rows":[{"label":"Headline","state":"open"|"locked"}]}]}   // 1-3 panels, 1-8 rows',
  code: '{"type":"code","text":"<a href=\\"tel:+15551234567\\">","caption":"optional"}',
  timeline: '{"type":"timeline","direction":"right"|"down","tone":"problem","events":[{"when":"8:47 PM","label":"Form submitted","icon":"file-text"}]}   // 2-8 events',
  funnel: '{"type":"funnel","tone":"money","stages":[{"label":"Searches","value":"1,000"}]}   // 3-7 stages, widest first',
  browser: '{"type":"browser","url":"example.com","title":"optional","note":"optional","placeholder":"screenshot"|"blank"}',
  equation: '{"type":"equation","terms":["ATTENTION","CONVERSION","VALUE"],"operator":"×"|"+"|"−"|"÷","result":"REVENUE","tone":"ink","resultTone":"money","icons":["eye","mouse-pointer-click","gauge"],"resultIcon":"dollar-sign"}   // 2-6 terms (icons optional, one per term), drawn as one line of chips ending in the result',
  loop: '{"type":"loop","center":"optional label in the middle","tone":"movement","nodes":[{"label":"ATTENTION","icon":"eye"}]}   // 3-8 nodes in a CYCLE: the last arrow returns to the first, so never repeat the first node at the end',
  matrix: '{"type":"matrix","columns":["FEATURE","PROBLEM","VALUE"],"tones":["tech","problem","money"],"rows":[["Booking","Too much back-and-forth","Faster appointments"]]}   // 2-4 columns, 1-8 rows; each row reads left to right with arrows between cells',
  bucket: '{"type":"bucket","top":"TRAFFIC","bottom":"CUSTOMERS","tone":"problem","leaks":[{"label":"SLOW","icon":"hourglass"}]}   // a bucket with a labelled hole per leak; 2-9 leaks',
  list: '{"type":"list","tone":"ink","items":[{"label":"ACQUISITION","detail":"How do people find us?","icon":"search"}]}   // 2-8 items, each with an optional one-line detail; with icons they are drawn as icon badges, without as numbered circles',
  moment: '{"type":"moment","icon":"user","text":"SARAH","caption":"optional","tone":"ink","chips":[{"label":"8:32 PM","icon":"clock"},{"label":"AC STOPS WORKING","icon":"snowflake","tone":"problem"}]}   // a person or moment introduced: big icon badge, a name, and up to 4 fact chips',
  meter: '{"type":"meter","tone":"ink","items":[{"label":"FRESH PROBLEM","value":100,"display":"100%","tone":"money","icon":"battery-full"}],"total":{"label":"optional bottom line","display":"+60"}}   // 2-8 labelled bars; value is 0-100 (bar length), display is the text at the end of the bar',
  eliminate: '{"type":"eliminate","options":["A","B","C","D"],"order":[2,3,4],"tone":"problem"}   // 3-6 options crossed out one at a time; order = 1-based positions in the order they are eliminated; one survivor is always left',
  track: '{"type":"track","title":"optional label over the whole road","start":{"label":"CUSTOMER","icon":"user"},"end":{"label":"PURCHASE","icon":"credit-card"},"tone":"ink","stops":[{"label":"FORM","icon":"file-text"}]}   // a road from start to end with 0-9 stops (toll booths, obstacles, milestones) along it',
  zones: '{"type":"zones","inside":{"heading":"MOMENTUM WINDOW","tone":"money","items":[{"label":"PROBLEM IS FRESH","icon":"flame"}]},"outside":{"heading":"AFTER THE WINDOW","tone":"problem","items":[{"label":"DISTRACTED","icon":"eye-off"}]}}   // a framed zone (what is inside) and what lies outside it; 1-5 items each; outside optional',
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

A brief is often a SCRIPT with two voices: a spoken track (marked CAMERA, VOICEOVER, NARRATION, or just plain prose the creator will say) and a visual track (marked CANVAS, ON SCREEN, BOARD, DRAW, WRITE, SHOW, with code blocks, arrows and diagrams). The board shows the visual track. A script's headings are its sections: "OPEN", "SCENE 4 — FOLLOW ONE CUSTOMER", "CLOSING". Every such heading is one section, even when its visual track is empty (the creator is just talking), so that the board keeps pace with the video.

Follow the brief's own chapter structure and order. If chapters are numbered, keep their numbering. If it has none, split the narrative into 6-14 sections at natural beats. Never more than ${LIMITS.sections}.

Return ONLY a JSON object:
{
  "title": "the video's title, in normal title case",
  "audience": "who it is for, a short phrase",
  "sections": [
    {
      "kicker": "the marker a viewer sees above the title: \\"OPEN\\", \\"SCENE 4\\", \\"CLOSING\\" — copied from the heading, empty if the heading has none",
      "title": "SHORT SECTION TITLE without the marker, ${LIMITS.label} characters at most, e.g. FOLLOW ONE CUSTOMER",
      "beat": "one sentence: what the viewer should feel or understand here",
      "density": 1
    }
  ]
}

density is 1-5 and says how much there is to look at: 1 = the creator is just talking (no canvas cues) or a single huge line; 2 = one short flow or one statement; 3 = one diagram (a flow, a comparison, a list); 4 = a rich diagram (a bucket, a loop, a matrix, a hub); 5 = the section the brief calls chaotic, exploding or the biggest visual moment. If the brief describes a progression such as "simple, then complex, then chaos, then simplified", make the densities follow it.`;

export function buildOutlinePrompt(brief) {
  return {
    system: OUTLINE_SYSTEM,
    user: `BRIEF:\n${brief}\n\n---\n\nReturn the JSON outline now.`,
  };
}

/* -------------------------------- sections -------------------------------- */

const SECTION_SYSTEM = `You build ONE section of a visual board for a video essay. The creator will screen-record themselves scrolling down this board and talking, so every section must work as a big, sparse, readable picture that the creator can point at while they speak. It is a canvas, not a slide of bullet points.

You are given the creator's whole brief, then told which section to build. Build ONLY that section. Ignore anything in the brief about a tool, a toolbar, shortcuts, saving, or visual style: that is not content.

TWO VOICES, ONE BOARD
A brief is often a script with two tracks. The SPOKEN track (CAMERA, VOICEOVER, NARRATION, or plain prose) is what the creator will SAY. The VISUAL track (CANVAS, ON SCREEN, BOARD, DRAW, WRITE, SHOW, code blocks, arrows, "Left:/Right:", "Two columns", "One by one") is what the board SHOWS. The board is the visual track.
1. The visual track is the section's content. Build exactly what it describes, in its order, using its words verbatim.
2. The spoken track is context. NEVER put narration sentences on the board. At most ONE short line from it may appear as a punchline (a statement of 12 words or fewer, copied word for word, the line the section lands on) — and only if the visual track has no punchline of its own.
3. A section whose visual track is empty (the creator is only talking) is just: a title, plus at most one punchline, plus — when the narration reels off a list of nouns — one cards block of those nouns. Two or three blocks. No more.
4. Never show the same idea twice in different forms. One diagram per idea.

Return ONLY a JSON object: { "blocks": [ ... ] } — usually 2-4 blocks (at most ${LIMITS.blocks}), in reading order, top to bottom.

BLOCK VOCABULARY (use only these; this is the JSON shape of each):
${VOCABULARY}

MATCH THE VISUAL TO THE CUE
- "Write: # X" → title (a numeral, a time or a price → bigtype). A word like "SUCCESS!" → statement, loud, tone money.
- A code block of steps joined by ↓ or → → flow. Long chains are fine: the board lays more than seven steps out in a compact snake by itself. "up" climbs toward a goal (first step at the bottom); "right" is for chains of 2-5 steps.
- Terms joined by operators (ATTENTION × CONVERSION × VALUE = REVENUE; 1,000 VISITORS × 2% = 20 LEADS) → equation. Never put an equation in a title.
- "Draw a bucket", holes, leaks, labels on holes → bucket.
- A funnel that "turns into a circle", or a chain whose last step feeds the first → loop.
- "Create three columns … populate" with rows of cells → matrix, one row per line.
- "Two columns", "Left:/Right:", before and after → compare. A panel of editable and locked fields → panels.
- Several numbered headings, each with a sentence beneath → list.
- A plain list of words with no arrows → cards (tag "LEAK" when the brief calls them problems or holes). Items joined to a hub or "everything connected to X" → hub.
- "One by one" headings → one statement per heading, loud, ink.
- A person, customer or moment being introduced (a name, a time, a situation) → moment.
- Rows drawn with ████░░ bars, percentages, a "battery", a decay table, or a +10/+15 ledger → meter (value = the bar length, display = the text beside it, total = a bottom line).
- Options "crossed out one at a time", "eliminated", "A X C D" → eliminate.
- "Draw a road", toll booths, obstacles between a start and an end, a long "distance" between two statements → track (put a phrase like DECISION DISTANCE in its title).
- "Inside the window" versus "outside the window", a safe zone against what lies beyond it → zones.
- A day-by-day or time sequence ("Branch: DAY 1 / DAY 3 / DAY 7") → timeline. A narrowing pipeline with counts → funnel. A web page the creator will drop a screenshot into → browser.
- "Beside CLICK: $5" → put the $5 in that step's note.
- A spoken customer line in quotes → quote. A snippet of code or a metric list → code (always subordinate).

ICONS
Most boards are far better with icons: an icon turns a word into a thing the viewer recognises before they read it. Put an "icon" on most steps, cards, list items, nodes, leaks, meter rows and stops, and on a title or moment that introduces a person or place. Choose the most literal icon for the label ("AC STOPS WORKING" → snowflake, "WAIT" → hourglass, "PHONE DOESN'T WORK" → phone-off, "QUOTE" → receipt, "REVIEWS" → star, "PRICE" → dollar-sign). Skip an icon when nothing fits rather than force a wrong one; leave out the field entirely. Never put an icon on a title or a statement; icons belong to the parts of a diagram, and a moment block (not a title) introduces a person.
Use ONLY these icon names (anything else is dropped): ${ICONS.join(', ')}.

TONE DISCIPLINE
Tones are colour roles — never write hex codes: ${TONES.join(', ')}. Colour carries meaning; most of a board is ink.
- ink: titles, plain statements, neutral flows. This is your default.
- problem: ONLY leaks, failures, losses and the bad path. Never a whole section out of habit.
- money: results, customers, revenue, the good path.
- movement: the customer's journey and traffic. tech: infrastructure and secondary detail. solution: a resolved end state.
- When a section contrasts bad with good, use problem against money. Use at most two tones per section besides ink.

EMPHASIS
- A statement is "loud" for a claim, "quiet" for a follow-up, and "inverse" (a black band) for THE punchline. Use inverse once per section at most, and not on every section.
- Do not use a title's "eyebrow": the board already prints the scene marker above each section.
- Titles are short (one to four lines). Prefer the brief's own capitalisation.

FIDELITY
- Copy quoted strings, labels and flow steps from the brief EXACTLY, including capitalisation, punctuation and emoji.
- Never invent statistics, prices, company names, testimonials or claims that are not in the brief.
- If the brief says a product or brand should be introduced subtly, keep it a small title (size "m"), never a hero.

RULES
- Labels at most ${LIMITS.label} characters, statements at most ${LIMITS.statement}, code at most ${LIMITS.code}.
- Match the density you are given: 1 is a title and at most one line; 3 is one diagram; 5 is dense, many parts on screen.
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
    `Build section ${index + 1} of ${total}: "${entry.title}"${entry.kicker ? ` (marker: ${entry.kicker})` : ''}`,
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
