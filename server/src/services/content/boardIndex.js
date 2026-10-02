import { createHash } from 'node:crypto';

/**
 * A Jam board, flattened into what is SAID on it.
 *
 *   section -> block -> part  (a flow step, a card, an equation term, a meter row ...)
 *
 * Every part carries a semantic path such as `steps.2` or `rows.1.0`, never a
 * coordinate: the geometry is the layout engine's business, and the same address
 * works for the board on screen and for a video renderer later. Section and block
 * ids are the board spec's own (`s3`, `s3.b2`).
 */

const clean = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : typeof v === 'number' ? String(v) : '');

/** [path, text, role] triples for one block. Empty text is skipped by the caller. */
function partsOf(block) {
  const out = [];
  const add = (path, text, role = 'label') => out.push({ path, text: clean(text), role });
  const each = (list, key, fn) => (Array.isArray(list) ? list : []).forEach((item, i) => fn(item, `${key}.${i}`, i));

  switch (block.type) {
    case 'title':
      add('text', block.text, 'heading');
      add('eyebrow', block.eyebrow, 'caption');
      break;
    case 'statement':
    case 'bigtype':
      add('text', block.text, 'statement');
      add('caption', block.caption, 'caption');
      break;
    case 'quote':
      add('text', block.text, 'quote');
      add('attribution', block.attribution, 'caption');
      break;
    case 'code':
      add('text', block.text, 'code');
      add('caption', block.caption, 'caption');
      break;
    case 'flow':
      each(block.steps, 'steps', (s, p) => { add(p, s.label); add(`${p}.note`, s.note, 'caption'); });
      break;
    case 'hub':
      add('center', block.center, 'heading');
      each(block.nodes, 'nodes', (n, p) => add(p, n.label));
      break;
    case 'cards':
      each(block.items, 'items', (c, p) => { add(p, c.label); add(`${p}.tag`, c.tag, 'caption'); });
      break;
    case 'compare':
      for (const side of ['left', 'right']) {
        add(`${side}.heading`, block[side]?.heading, 'heading');
        each(block[side]?.steps, `${side}.steps`, (s, p) => add(p, s.label));
        add(`${side}.footnote`, block[side]?.footnote, 'caption');
      }
      break;
    case 'panels':
      each(block.panels, 'panels', (panel, p, i) => {
        add(`${p}.heading`, panel.heading, 'heading');
        each(panel.rows, `panels.${i}.rows`, (r, rp) => add(rp, r.label));
      });
      break;
    case 'timeline':
      each(block.events, 'events', (e, p) => { add(p, e.label); add(`${p}.when`, e.when, 'caption'); });
      break;
    case 'funnel':
      each(block.stages, 'stages', (s, p) => { add(p, s.label); add(`${p}.value`, s.value, 'caption'); });
      break;
    case 'browser':
      add('title', block.title, 'heading');
      add('url', block.url, 'caption');
      add('note', block.note, 'caption');
      break;
    case 'equation':
      each(block.terms, 'terms', (t, p) => add(p, t));
      add('result', block.result, 'heading');
      break;
    case 'loop':
      add('center', block.center, 'heading');
      each(block.nodes, 'nodes', (n, p) => add(p, n.label));
      break;
    case 'matrix':
      each(block.columns, 'columns', (c, p) => add(p, c, 'heading'));
      each(block.rows, 'rows', (row, p, r) => each(row, `rows.${r}`, (cell, cp) => add(cp, cell)));
      break;
    case 'bucket':
      add('top', block.top, 'heading');
      add('bottom', block.bottom, 'heading');
      each(block.leaks, 'leaks', (l, p) => add(p, l.label));
      break;
    case 'list':
      each(block.items, 'items', (it, p) => { add(p, it.label); add(`${p}.detail`, it.detail, 'caption'); });
      break;
    case 'moment':
      add('text', block.text, 'heading');
      add('caption', block.caption, 'caption');
      each(block.chips, 'chips', (c, p) => add(p, c.label));
      break;
    case 'meter':
      each(block.items, 'items', (it, p) => add(p, it.label));
      add('total', block.total?.label, 'heading');
      break;
    case 'eliminate':
      each(block.options, 'options', (o, p) => add(p, o));
      break;
    case 'track':
      add('title', block.title, 'heading');
      add('start', block.start?.label);
      add('end', block.end?.label);
      each(block.stops, 'stops', (s, p) => add(p, s.label));
      break;
    case 'zones':
      for (const zone of ['inside', 'outside']) {
        add(`${zone}.heading`, block[zone]?.heading, 'heading');
        each(block[zone]?.items, `${zone}.items`, (it, p) => add(p, it.label));
      }
      break;
    default:
      break;
  }
  return out.filter((p) => p.text);
}

/** A stable fingerprint of a board spec: used to tell when a linked board has changed. */
export function hashBoardSpec(spec) {
  return createHash('sha256').update(JSON.stringify(spec)).digest('hex').slice(0, 24);
}

export function buildBoardIndex(spec) {
  const sections = (spec?.sections || []).map((section, order) => ({
    id: section.id,
    order,
    title: clean(section.title),
    kicker: clean(section.kicker),
    beat: clean(section.beat),
    blocks: (section.blocks || []).map((block) => ({
      id: block.id,
      type: block.type,
      parts: partsOf(block).map((p) => ({ ...p, id: `${block.id}#${p.path}` })),
    })),
  }));
  return { title: clean(spec?.title), hash: hashBoardSpec(spec), sections };
}

/** What a person sees as the headline of a section (first heading-like part), for lists and cards. */
export function sectionHeadline(section) {
  for (const role of ['heading', 'statement']) {
    for (const block of section.blocks) {
      const part = block.parts.find((p) => p.role === role);
      if (part) return part.text;
    }
  }
  return section.title;
}
