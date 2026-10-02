/**
 * Jam board — the board spec's vocabulary and its normalizers.
 *
 * MIRRORED byte-for-byte at client/src/components/board/state/schema.js. Keep
 * the two identical; server/test/board.parity.test.js fails if they drift.
 * Pure and dependency-free so the same rules run on both sides.
 *
 * DeepSeek's output is untrusted. Everything here coerces toward something the
 * layout engine can draw and drops what it cannot. It never throws on model
 * output: a board with one lost block is a board, a crashed request is not.
 */

export const SPEC_VERSION = 1;

/** Semantic colour roles. The model names a role; the client owns the hex. */
export const TONES = ['ink', 'money', 'problem', 'movement', 'tech', 'solution'];

export const BLOCK_TYPES = [
  'title', 'statement', 'bigtype', 'quote', 'flow', 'hub', 'cards',
  'compare', 'panels', 'code', 'timeline', 'funnel', 'browser',
  'equation', 'loop', 'matrix', 'bucket', 'list',
  'moment', 'meter', 'eliminate', 'track', 'zones',
];

/** The icon vocabulary. The model names one; the client owns the drawing. Anything else is dropped. */
export const ICONS = [
  'search', 'globe', 'phone', 'phone-off', 'phone-missed', 'mail', 'mail-open', 'inbox', 'send', 'message-square', 'message-circle',
  'bell', 'megaphone', 'siren', 'video', 'camera', 'image',
  'clock', 'hourglass', 'timer', 'calendar',
  'user', 'users', 'handshake', 'heart', 'smile', 'frown', 'thumbs-up', 'thumbs-down',
  'wrench', 'snowflake', 'flame', 'thermometer', 'zap', 'plug-zap', 'settings', 'key', 'lock', 'house', 'truck', 'store', 'building-2', 'briefcase', 'package',
  'dollar-sign', 'coins', 'hand-coins', 'piggy-bank', 'credit-card', 'receipt', 'shopping-cart', 'tag', 'percent', 'gift',
  'star', 'award', 'trophy', 'crown', 'badge-check', 'shield-check', 'check', 'circle-check', 'x', 'circle-x', 'ban', 'skull', 'ghost', 'triangle-alert',
  'eye', 'eye-off', 'target', 'radar', 'mouse-pointer-click', 'map-pin', 'route', 'flag', 'door-open', 'link', 'unplug', 'cloud-off', 'wifi-off',
  'trending-up', 'trending-down', 'chart-column', 'gauge', 'scale', 'battery-low', 'battery-medium', 'battery-full', 'filter',
  'repeat', 'refresh-cw', 'rocket', 'bot', 'database', 'smartphone', 'layout-template', 'file-text', 'clipboard-list', 'book-open',
  'lightbulb', 'sparkles', 'magnet', 'anchor', 'scissors', 'circle-help', 'graduation-cap',
];

const ICON_ALIASES = {
  home: 'house', alert: 'triangle-alert', warning: 'triangle-alert', 'alert-triangle': 'triangle-alert', dollar: 'dollar-sign', money: 'dollar-sign',
  cart: 'shopping-cart', chart: 'chart-column', 'bar-chart': 'chart-column', battery: 'battery-medium', form: 'file-text', document: 'file-text',
  person: 'user', people: 'users', cross: 'x', close: 'x', ac: 'snowflake', cold: 'snowflake', time: 'clock', question: 'circle-help',
  help: 'circle-help', email: 'mail', chat: 'message-square', tools: 'wrench', repair: 'wrench', web: 'globe', website: 'globe', speed: 'zap',
  lightning: 'zap', trust: 'shield-check', 'thumb-up': 'thumbs-up', 'thumb-down': 'thumbs-down', stop: 'ban', checkmark: 'check',
};

/** 'Snowflake', 'snow flake', 'snowFlake' → the canonical kebab-case name, or '' when it is not in the vocabulary. */
export function iconOf(v) {
  if (typeof v !== 'string') return '';
  const k = v.trim().replace(/([a-z])([A-Z])/g, '$1-$2').replace(/[\s_]+/g, '-').toLowerCase();
  const name = ICON_ALIASES[k] || k;
  return ICONS.includes(name) ? name : '';
}

/** A section without one of these has nothing to say out loud and is sent back for repair. */
export const HEADLINE_TYPES = ['title', 'statement', 'bigtype'];

export const LIMITS = {
  sections: 40,
  blocks: 12,
  label: 60,
  note: 80,
  statement: 140,
  code: 120,
  bigtype: 24,
  title: 80,
  beat: 200,
  flowSteps: [2, 14],
  hubNodes: [3, 12],
  cards: [2, 12],
  compareSteps: [1, 7],
  timeline: [2, 8],
  funnel: [3, 7],
  panels: [1, 3],
  rows: [1, 8],
  equationTerms: [2, 6],
  loopNodes: [3, 8],
  matrixCols: [2, 4],
  matrixRows: [1, 8],
  bucketLeaks: [2, 9],
  listItems: [2, 8],
  kicker: 24,
  meterItems: [2, 8],
  eliminateOptions: [3, 6],
  trackStops: [0, 9],
  zoneItems: [1, 5],
  momentChips: [0, 4],
};

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v : []);
const oneOf = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);
const tone = (v, fallback) => oneOf(v, TONES, fallback);

const int = (v, lo, hi, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

/** Trim, collapse whitespace (unless multiline), clip with an ellipsis. Non-strings become ''. */
function text(v, max, { multiline = false } = {}) {
  if (typeof v === 'number') v = String(v);
  if (typeof v !== 'string') return '';
  let s = multiline
    ? v.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
    : v.replace(/\s+/g, ' ').trim();
  if (s.length > max) s = `${s.slice(0, max - 1).trimEnd()}…`;
  return s;
}

/** Models return steps as strings or as {label|text|name|title|when}; accept all of them. */
function labelOf(item, max) {
  if (isObj(item)) return text(item.label ?? item.text ?? item.name ?? item.title ?? item.when, max);
  return text(item, max);
}

function steps(raw, [min, max]) {
  const out = [];
  for (const item of list(raw)) {
    const label = labelOf(item, LIMITS.label);
    if (!label) continue;
    const step = { label };
    if (isObj(item)) {
      const note = text(item.note ?? item.detail ?? item.caption, LIMITS.note);
      if (note) step.note = note;
      if (TONES.includes(item.tone)) step.tone = item.tone;
      const icon = iconOf(item.icon);
      if (icon) step.icon = icon;
    }
    out.push(step);
    if (out.length === max) break;
  }
  return out.length >= min ? out : null;
}

const OPERATORS = { '×': '×', x: '×', X: '×', '*': '×', '+': '+', '−': '−', '-': '−', '÷': '÷', '/': '÷', '=': '=', '→': '→' };
const operatorOf = (v) => OPERATORS[typeof v === 'string' ? v.trim() : ''] || '×';

function normalizeSide(raw) {
  if (!isObj(raw)) return null;
  const s = steps(raw.steps ?? raw.items, LIMITS.compareSteps);
  if (!s) return null;
  const side = { heading: text(raw.heading ?? raw.title, LIMITS.label), tone: tone(raw.tone, 'ink'), steps: s };
  const footnote = text(raw.footnote, LIMITS.note);
  if (footnote) side.footnote = footnote;
  return side;
}

function normalizePanel(raw) {
  if (!isObj(raw)) return null;
  const rows = [];
  for (const row of list(raw.rows)) {
    const label = labelOf(row, LIMITS.label);
    if (!label) continue;
    rows.push({ label, state: oneOf(isObj(row) ? row.state : undefined, ['open', 'locked'], 'open') });
    if (rows.length === LIMITS.rows[1]) break;
  }
  if (rows.length < LIMITS.rows[0]) return null;
  return { heading: text(raw.heading ?? raw.title, LIMITS.label), tone: tone(raw.tone, 'ink'), rows };
}

/** One raw block → a clean block without an id, or null when it cannot be drawn. */
export function normalizeBlock(raw) {
  if (!isObj(raw)) return null;
  const type = typeof raw.type === 'string' ? raw.type.toLowerCase() : '';

  switch (type) {
    case 'title': {
      const t = text(raw.text ?? raw.title, LIMITS.title, { multiline: true });
      if (!t) return null;
      const block = { type, text: t, size: oneOf(raw.size, ['xl', 'l', 'm'], 'l'), tone: tone(raw.tone, 'ink') };
      const eyebrow = text(raw.eyebrow, LIMITS.label);
      if (eyebrow) block.eyebrow = eyebrow;
      const icon = iconOf(raw.icon);
      if (icon) block.icon = icon;
      return block;
    }
    case 'statement': {
      const t = text(raw.text, LIMITS.statement);
      if (!t) return null;
      return { type, text: t, emphasis: oneOf(raw.emphasis, ['loud', 'quiet', 'inverse'], 'loud'), tone: tone(raw.tone, 'ink') };
    }
    case 'bigtype': {
      const t = text(raw.text, LIMITS.bigtype);
      if (!t) return null;
      const block = { type, text: t, tone: tone(raw.tone, 'ink') };
      const caption = text(raw.caption, LIMITS.note);
      if (caption) block.caption = caption;
      return block;
    }
    case 'quote': {
      const t = text(raw.text, LIMITS.statement);
      if (!t) return null;
      const block = { type, text: t };
      const attribution = text(raw.attribution, LIMITS.label);
      if (attribution) block.attribution = attribution;
      return block;
    }
    case 'flow': {
      const s = steps(raw.steps ?? raw.items, LIMITS.flowSteps);
      if (!s) return null;
      return {
        type,
        direction: oneOf(raw.direction, ['up', 'down', 'right'], 'down'),
        scale: oneOf(raw.scale, ['hero', 'normal', 'small'], 'normal'),
        tone: tone(raw.tone, 'ink'),
        steps: s,
      };
    }
    case 'hub': {
      const center = text(raw.center, LIMITS.label);
      const nodes = steps(raw.nodes ?? raw.items, LIMITS.hubNodes);
      if (!center || !nodes) return null;
      return {
        type,
        center,
        nodes: nodes.map(({ label }) => ({ label })),
        links: oneOf(raw.links, ['spokes', 'spokes+cross'], 'spokes'),
        tone: tone(raw.tone, 'ink'),
      };
    }
    case 'cards': {
      const items = [];
      for (const item of list(raw.items)) {
        const label = labelOf(item, LIMITS.label);
        if (!label) continue;
        const card = { label };
        if (isObj(item)) {
          const tag = text(item.tag, 24);
          if (tag) card.tag = tag;
          if (TONES.includes(item.tone)) card.tone = item.tone;
          const icon = iconOf(item.icon);
          if (icon) card.icon = icon;
        }
        items.push(card);
        if (items.length === LIMITS.cards[1]) break;
      }
      if (items.length < LIMITS.cards[0]) return null;
      return { type, items, columns: int(raw.columns, 2, 4, 3), tone: tone(raw.tone, 'ink') };
    }
    case 'compare': {
      const left = normalizeSide(raw.left);
      const right = normalizeSide(raw.right);
      return left && right ? { type, left, right } : null;
    }
    case 'panels': {
      const panels = list(raw.panels).map(normalizePanel).filter(Boolean).slice(0, LIMITS.panels[1]);
      return panels.length >= LIMITS.panels[0] ? { type, panels } : null;
    }
    case 'code': {
      const t = text(raw.text, LIMITS.code);
      if (!t) return null;
      const block = { type, text: t };
      const caption = text(raw.caption, LIMITS.note);
      if (caption) block.caption = caption;
      return block;
    }
    case 'timeline': {
      const events = [];
      for (const ev of list(raw.events ?? raw.items)) {
        const label = isObj(ev) ? text(ev.label ?? ev.text ?? ev.title, LIMITS.label) : text(ev, LIMITS.label);
        if (!label) continue;
        const item = { when: isObj(ev) ? text(ev.when ?? ev.time ?? ev.date, 24) : '', label };
        if (isObj(ev) && TONES.includes(ev.tone)) item.tone = ev.tone;
        const icon = isObj(ev) ? iconOf(ev.icon) : '';
        if (icon) item.icon = icon;
        events.push(item);
        if (events.length === LIMITS.timeline[1]) break;
      }
      if (events.length < LIMITS.timeline[0]) return null;
      return { type, events, direction: oneOf(raw.direction, ['right', 'down'], 'right'), tone: tone(raw.tone, 'ink') };
    }
    case 'funnel': {
      const stages = [];
      for (const st of list(raw.stages ?? raw.items)) {
        const label = labelOf(st, LIMITS.label);
        if (!label) continue;
        const stage = { label };
        const value = isObj(st) ? text(st.value, 24) : '';
        if (value) stage.value = value;
        stages.push(stage);
        if (stages.length === LIMITS.funnel[1]) break;
      }
      if (stages.length < LIMITS.funnel[0]) return null;
      return { type, stages, tone: tone(raw.tone, 'ink') };
    }
    case 'browser': {
      const block = { type, placeholder: oneOf(raw.placeholder, ['screenshot', 'blank'], 'screenshot') };
      const url = text(raw.url, LIMITS.label);
      const title = text(raw.title, LIMITS.label);
      const note = text(raw.note, LIMITS.note);
      if (url) block.url = url;
      if (title) block.title = title;
      if (note) block.note = note;
      return block;
    }
    case 'equation': {
      const terms = steps(raw.terms ?? raw.items, LIMITS.equationTerms);
      if (!terms) return null;
      const block = {
        type,
        terms: terms.map((s) => s.label),
        operator: operatorOf(raw.operator),
        tone: tone(raw.tone, 'ink'),
        resultTone: tone(raw.resultTone, 'money'),
      };
      const result = text(raw.result, LIMITS.label);
      if (result) block.result = result;
      const icons = terms.map((t) => t.icon || '');
      if (icons.some(Boolean)) block.icons = icons;
      const resultIcon = iconOf(raw.resultIcon);
      if (resultIcon) block.resultIcon = resultIcon;
      return block;
    }
    case 'loop': {
      const nodes = steps(raw.nodes ?? raw.items ?? raw.steps, LIMITS.loopNodes);
      if (!nodes) return null;
      const block = { type, nodes: nodes.map(({ label, icon }) => (icon ? { label, icon } : { label })), tone: tone(raw.tone, 'ink') };
      const center = text(raw.center, LIMITS.label);
      if (center) block.center = center;
      return block;
    }
    case 'matrix': {
      const columns = list(raw.columns).map((c) => labelOf(c, LIMITS.label)).filter(Boolean).slice(0, LIMITS.matrixCols[1]);
      if (columns.length < LIMITS.matrixCols[0]) return null;
      const rows = [];
      for (const row of list(raw.rows)) {
        const cells = list(isObj(row) ? row.cells : row).map((c) => labelOf(c, LIMITS.label));
        if (!cells.some(Boolean)) continue;
        rows.push(columns.map((_, i) => cells[i] || ''));
        if (rows.length === LIMITS.matrixRows[1]) break;
      }
      if (rows.length < LIMITS.matrixRows[0]) return null;
      const tones = columns.map((_, i) => tone(list(raw.tones)[i], 'ink'));
      return { type, columns, rows, tones };
    }
    case 'bucket': {
      const leaks = steps(raw.leaks ?? raw.holes ?? raw.items, LIMITS.bucketLeaks);
      if (!leaks) return null;
      const block = { type, leaks: leaks.map(({ label, icon }) => (icon ? { label, icon } : { label })), tone: tone(raw.tone, 'problem') };
      const top = text(raw.top, LIMITS.label);
      const bottom = text(raw.bottom, LIMITS.label);
      if (top) block.top = top;
      if (bottom) block.bottom = bottom;
      return block;
    }
    case 'list': {
      const items = [];
      for (const item of list(raw.items)) {
        const label = labelOf(item, LIMITS.label);
        if (!label) continue;
        const entry = { label };
        const detail = isObj(item) ? text(item.detail ?? item.note ?? item.description, 100) : '';
        if (detail) entry.detail = detail;
        const icon = isObj(item) ? iconOf(item.icon) : '';
        if (icon) entry.icon = icon;
        items.push(entry);
        if (items.length === LIMITS.listItems[1]) break;
      }
      if (items.length < LIMITS.listItems[0]) return null;
      return { type, items, tone: tone(raw.tone, 'ink') };
    }
    case 'moment': {
      const t = text(raw.text ?? raw.title, LIMITS.title, { multiline: true });
      if (!t) return null;
      const block = { type, text: t, tone: tone(raw.tone, 'ink') };
      const icon = iconOf(raw.icon);
      if (icon) block.icon = icon;
      const caption = text(raw.caption, LIMITS.note);
      if (caption) block.caption = caption;
      const chips = [];
      for (const c of list(raw.chips ?? raw.items)) {
        const label = labelOf(c, LIMITS.label);
        if (!label) continue;
        const chip = { label, tone: isObj(c) ? tone(c.tone, 'ink') : 'ink' };
        const chipIcon = isObj(c) ? iconOf(c.icon) : '';
        if (chipIcon) chip.icon = chipIcon;
        chips.push(chip);
        if (chips.length === LIMITS.momentChips[1]) break;
      }
      if (chips.length) block.chips = chips;
      return block;
    }
    case 'meter': {
      const items = [];
      for (const it of list(raw.items ?? raw.rows)) {
        const label = labelOf(it, LIMITS.label);
        if (!label) continue;
        const parsed = isObj(it) ? Number.parseFloat(String(it.value ?? it.percent ?? '').replace('%', '')) : NaN;
        const entry = { label, value: Number.isFinite(parsed) ? Math.min(100, Math.max(0, Math.round(parsed))) : 50 };
        const display = isObj(it) ? text(it.display ?? it.shown, 16) : '';
        if (display) entry.display = display;
        if (isObj(it) && TONES.includes(it.tone)) entry.tone = it.tone;
        const icon = isObj(it) ? iconOf(it.icon) : '';
        if (icon) entry.icon = icon;
        items.push(entry);
        if (items.length === LIMITS.meterItems[1]) break;
      }
      if (items.length < LIMITS.meterItems[0]) return null;
      const block = { type, items, tone: tone(raw.tone, 'ink') };
      if (isObj(raw.total)) {
        const label = text(raw.total.label, LIMITS.label);
        const display = text(raw.total.display ?? raw.total.value, 16);
        if (label && display) block.total = { label, display };
      }
      return block;
    }
    case 'eliminate': {
      const options = list(raw.options ?? raw.items).map((o) => labelOf(o, 24)).filter(Boolean).slice(0, LIMITS.eliminateOptions[1]);
      if (options.length < LIMITS.eliminateOptions[0]) return null;
      const out = [];
      for (const n of list(raw.order ?? raw.eliminated)) {
        const i = Math.round(Number(n));
        if (Number.isInteger(i) && i >= 1 && i <= options.length && !out.includes(i)) out.push(i);
      }
      // Always leave a survivor; with no usable order, knock out everything but the last.
      let order = out.slice(0, options.length - 1);
      if (!order.length) order = options.slice(0, -1).map((_, i) => i + 1);
      return { type, options, order, tone: tone(raw.tone, 'problem') };
    }
    case 'track': {
      const end = (v) => (isObj(v) ? { label: text(v.label ?? v.text, LIMITS.label), icon: iconOf(v.icon) } : { label: text(v, LIMITS.label), icon: '' });
      const start = end(raw.start);
      const finish = end(raw.end);
      if (!start.label || !finish.label) return null;
      const stops = steps(raw.stops ?? raw.items, [0, LIMITS.trackStops[1]]) || [];
      const block = {
        type,
        start: { label: start.label, ...(start.icon ? { icon: start.icon } : {}) },
        end: { label: finish.label, ...(finish.icon ? { icon: finish.icon } : {}) },
        stops,
        tone: tone(raw.tone, 'ink'),
      };
      const title = text(raw.title ?? raw.caption, LIMITS.label);
      if (title) block.title = title;
      return block;
    }
    case 'zones': {
      const zone = (z, fallbackTone) => {
        if (!isObj(z)) return null;
        const zs = steps(z.items ?? z.steps, [1, LIMITS.zoneItems[1]]);
        if (!zs) return null;
        return {
          heading: text(z.heading ?? z.title, LIMITS.label),
          tone: tone(z.tone, fallbackTone),
          items: zs.map((it) => (it.icon ? { label: it.label, icon: it.icon } : { label: it.label })),
        };
      };
      const inside = zone(raw.inside, 'money');
      if (!inside) return null;
      const outside = zone(raw.outside, 'problem');
      return outside ? { type, inside, outside } : { type, inside };
    }
    default:
      return null;
  }
}

function describeDrop(raw) {
  if (!isObj(raw)) return 'not an object';
  const type = String(raw.type).toLowerCase();
  return BLOCK_TYPES.includes(type) ? `invalid ${type} block` : `unknown block type "${raw.type}"`;
}

/**
 * One raw section → a clean section plus a list of problems.
 * `index` is the section's position; it fixes the id (`s1`, `s2`, …).
 */
export function normalizeSection(raw, index) {
  const src = isObj(raw) ? raw : {};
  const issues = [];
  const blocks = [];

  list(src.blocks).forEach((rawBlock, i) => {
    if (blocks.length >= LIMITS.blocks) {
      issues.push(`block ${i + 1} dropped: over the ${LIMITS.blocks}-block limit`);
      return;
    }
    const block = normalizeBlock(rawBlock);
    if (!block) {
      issues.push(`block ${i + 1} dropped: ${describeDrop(rawBlock)}`);
      return;
    }
    blocks.push(block);
  });

  const id = `s${index + 1}`;
  const kicker = text(src.kicker, LIMITS.kicker);
  const section = {
    id,
    title: text(src.title, LIMITS.label) || `Section ${index + 1}`,
    beat: text(src.beat, LIMITS.beat),
    density: int(src.density, 1, 5, 3),
    ...(kicker ? { kicker } : {}),
    blocks: blocks.map((block, i) => {
      const out = { ...block, id: `${id}.b${i + 1}` };
      // The board already prints the marker above the section; a title eyebrow that says the same thing is noise.
      if (kicker && out.eyebrow && out.eyebrow.toLowerCase() === kicker.toLowerCase()) delete out.eyebrow;
      return out;
    }),
  };
  if (src.degraded === true) section.degraded = true;
  if (!section.blocks.some((b) => HEADLINE_TYPES.includes(b.type))) {
    issues.push('no headline block (add a title, statement or bigtype)');
  }
  return { section, issues };
}

/** What a section becomes when the model cannot produce a usable one. */
export function degradedSection(index, entry = {}) {
  const id = `s${index + 1}`;
  const title = text(entry.title, LIMITS.label) || `Section ${index + 1}`;
  const beat = text(entry.beat, LIMITS.beat);
  const blocks = [{ type: 'title', text: title, size: 'l', tone: 'ink', id: `${id}.b1` }];
  const line = text(entry.beat, LIMITS.statement);
  if (line) blocks.push({ type: 'statement', text: line, emphasis: 'quiet', tone: 'ink', id: `${id}.b2` });
  const kicker = text(entry.kicker, LIMITS.kicker);
  return { id, title, beat, density: 1, ...(kicker ? { kicker } : {}), degraded: true, blocks };
}

/** The outline call's answer: the board's title and the sections it will have. */
export function normalizeOutline(raw) {
  if (!isObj(raw)) return null;
  const sections = [];
  for (const s of list(raw.sections)) {
    if (!isObj(s)) continue;
    const title = text(s.title, LIMITS.label);
    if (!title) continue;
    const kicker = text(s.kicker, LIMITS.kicker);
    sections.push({ title, beat: text(s.beat, LIMITS.beat), density: int(s.density, 1, 5, 3), ...(kicker ? { kicker } : {}) });
    if (sections.length === LIMITS.sections) break;
  }
  if (!sections.length) return null;
  return {
    title: text(raw.title, LIMITS.title) || sections[0].title,
    audience: text(raw.audience, LIMITS.title),
    sections,
  };
}

/** A whole board spec from an untrusted source (import, bundled example). */
export function normalizeBoard(raw) {
  if (!isObj(raw)) return null;
  // Two passes: drop sections with no drawable block first, so ids stay contiguous.
  const kept = list(raw.sections)
    .slice(0, LIMITS.sections)
    .filter((s) => normalizeSection(s, 0).section.blocks.length > 0);
  if (!kept.length) return null;
  return {
    version: SPEC_VERSION,
    title: text(raw.title, LIMITS.title) || 'Untitled board',
    audience: text(raw.audience, LIMITS.title),
    sections: kept.map((s, i) => normalizeSection(s, i).section),
  };
}
