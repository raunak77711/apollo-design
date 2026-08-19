import { Fragment, memo, useMemo } from 'react';
import { cx } from './cx.js';

/**
 * Markdown, rendered as React elements.
 *
 * Written rather than installed. Apollo ships no markdown dependency today,
 * and the alternative is ~40kB of parser plus a sanitiser to undo the HTML it
 * produces — for a feature whose whole output surface is headings, lists,
 * tables, emphasis and code. Building React nodes directly means there is no
 * HTML string anywhere in the pipeline, so there is nothing to sanitise and
 * nothing to get wrong: a model that emits `<script>` gets it back as text,
 * because text is the only thing this can produce.
 *
 * It also has to survive being called on a half-written document, several times
 * a second, while a response streams in — so an unterminated code fence renders
 * as a code block rather than as garbage, and an incomplete table renders as
 * the rows that exist so far.
 */

/* ------------------------------- inline ---------------------------------- */

// One pass, longest-match-first. Code spans come first deliberately: backticks
// win over every other marker, which is what stops `**` inside a code span
// being read as emphasis.
//
// Kept as a source string rather than one compiled global RegExp, because
// `renderInline` recurses — emphasis renders its own contents. A shared /g/
// regex carries a single `lastIndex` across every level, so an inner scan
// rewinds the outer one to zero and the outer loop re-matches the construct it
// is already inside, forever, with the tab locked. Every call gets its own
// instance instead; V8 caches the compiled pattern by source, so correctness
// here costs effectively nothing.
const INLINE_SOURCE = [
    '(?<code>`+)(?<codeText>[\\s\\S]+?)\\k<code>',
    '!\\[(?<imgAlt>[^\\]]*)\\]\\((?<imgHref>[^\\s)]+)[^)]*\\)',
    '\\[(?<linkText>[^\\]]+)\\]\\((?<linkHref>[^\\s)]+)[^)]*\\)',
    '(?<strongStar>\\*\\*|__)(?<strongText>[\\s\\S]+?)\\k<strongStar>',
    '(?<strike>~~)(?<strikeText>[\\s\\S]+?)~~',
    // Asterisk emphasis anywhere; underscore emphasis only at word boundaries,
    // so `my_var_name` and `__init__` survive as the identifiers they are.
    '\\*(?<emStar>[^\\s*][\\s\\S]*?)\\*',
    '(?<!\\w)_(?<emScore>[^\\s_][\\s\\S]*?)_(?!\\w)',
    '(?<url>https?://[^\\s<>()\\[\\]]+)',
].join('|');

/** Only schemes that cannot execute. Anything else renders as plain text. */
function safeHref(href) {
  const value = String(href || '').trim();
  return /^(https?:\/\/|mailto:|\/|#)/i.test(value) ? value : null;
}

function renderInline(text, keyPrefix = 'i') {
  if (!text) return null;
  const nodes = [];
  const inline = new RegExp(INLINE_SOURCE, 'g');
  let last = 0;
  let index = 0;

  let match;
  while ((match = inline.exec(text)) !== null) {
    const g = match.groups;
    if (match.index > last) nodes.push(text.slice(last, match.index));
    last = match.index + match[0].length;
    const key = `${keyPrefix}-${index++}`;

    if (g.code !== undefined) {
      nodes.push(
        <code
          key={key}
          className="rounded border border-line bg-raised px-[0.35em] py-[0.1em] font-mono text-[0.86em] text-ink"
        >
          {g.codeText}
        </code>
      );
    } else if (g.imgHref !== undefined) {
      const src = safeHref(g.imgHref);
      nodes.push(
        src ? (
          <img
            key={key}
            src={src}
            alt={g.imgAlt || ''}
            loading="lazy"
            className="my-3 max-w-full rounded-lg border border-line"
          />
        ) : (
          <Fragment key={key}>{match[0]}</Fragment>
        )
      );
    } else if (g.linkHref !== undefined) {
      const href = safeHref(g.linkHref);
      nodes.push(
        href ? (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="text-accent-text underline decoration-accent/40 underline-offset-2 transition-colors hover:decoration-accent"
          >
            {renderInline(g.linkText, key)}
          </a>
        ) : (
          <Fragment key={key}>{g.linkText}</Fragment>
        )
      );
    } else if (g.strongText !== undefined) {
      nodes.push(
        <strong key={key} className="font-semibold text-ink">
          {renderInline(g.strongText, key)}
        </strong>
      );
    } else if (g.strikeText !== undefined) {
      nodes.push(
        <s key={key} className="text-ink-3">
          {renderInline(g.strikeText, key)}
        </s>
      );
    } else if (g.emStar !== undefined || g.emScore !== undefined) {
      nodes.push(<em key={key}>{renderInline(g.emStar ?? g.emScore, key)}</em>);
    } else if (g.url !== undefined) {
      nodes.push(
        <a
          key={key}
          href={g.url}
          target="_blank"
          rel="noreferrer noopener"
          className="text-accent-text underline decoration-accent/40 underline-offset-2 transition-colors hover:decoration-accent"
        >
          {g.url}
        </a>
      );
    }
  }

  if (last < text.length) nodes.push(text.slice(last));
  return nodes.length ? nodes : text;
}

/* -------------------------------- blocks ---------------------------------- */

const FENCE = /^\s*(```|~~~)\s*([\w+#.-]*)\s*$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const BULLET = /^(\s*)[-*+]\s+(.*)$/;
const ORDERED = /^(\s*)(\d{1,9})[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const TABLE_DIVIDER = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

function splitRow(line) {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replace(/\\\|/g, '|'));
}

/**
 * Line-by-line into a block tree. Lists recurse on indentation so a nested
 * bullet under a numbered step comes out as a real nested list.
 */
function parseBlocks(src) {
  const lines = String(src || '').split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[1];
      const lang = fence[2] || '';
      const body = [];
      i += 1;
      let closed = false;
      while (i < lines.length) {
        if (lines[i].trim().startsWith(marker)) {
          closed = true;
          i += 1;
          break;
        }
        body.push(lines[i]);
        i += 1;
      }
      // `closed` travels with the block so a fence still being streamed can be
      // shown as live output rather than as a finished, copyable snippet.
      blocks.push({ type: 'code', lang, text: body.join('\n'), closed });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2].trim() });
      i += 1;
      continue;
    }

    if (RULE.test(line)) {
      blocks.push({ type: 'rule' });
      i += 1;
      continue;
    }

    if (QUOTE.test(line)) {
      const body = [];
      while (i < lines.length && (QUOTE.test(lines[i]) || (body.length && lines[i].trim()))) {
        body.push(QUOTE.exec(lines[i])?.[1] ?? lines[i].trim());
        i += 1;
      }
      blocks.push({ type: 'quote', blocks: parseBlocks(body.join('\n')) });
      continue;
    }

    // A table needs its divider row to exist before it is a table — until then
    // the header line is just a paragraph, which is what it looks like mid-stream.
    if (line.includes('|') && TABLE_DIVIDER.test(lines[i + 1] || '')) {
      const head = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      blocks.push({ type: 'table', head, rows });
      continue;
    }

    if (BULLET.test(line) || ORDERED.test(line)) {
      const { list, next } = parseList(lines, i);
      blocks.push(list);
      i = next;
      continue;
    }

    const para = [];
    while (i < lines.length && lines[i].trim() && !FENCE.test(lines[i]) && !HEADING.test(lines[i]) && !RULE.test(lines[i]) && !BULLET.test(lines[i]) && !ORDERED.test(lines[i]) && !QUOTE.test(lines[i])) {
      para.push(lines[i]);
      i += 1;
    }
    if (para.length) blocks.push({ type: 'paragraph', text: para.join('\n') });
    else i += 1;
  }

  return blocks;
}

/** One list, from `start`, consuming every item at its own indent or deeper. */
function parseList(lines, start) {
  const first = ORDERED.exec(lines[start]) || BULLET.exec(lines[start]);
  const baseIndent = first[1].length;
  const ordered = Boolean(ORDERED.exec(lines[start]));
  const startAt = ordered ? Number(ORDERED.exec(lines[start])[2]) : 1;
  const items = [];
  let i = start;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      // A blank line ends the list unless another item follows it.
      const next = lines[i + 1] || '';
      if (!BULLET.test(next) && !ORDERED.test(next)) break;
      i += 1;
      continue;
    }

    const bullet = BULLET.exec(line);
    const numbered = ORDERED.exec(line);
    const match = numbered || bullet;
    if (!match) break;

    const indent = match[1].length;
    if (indent < baseIndent) break;
    if (indent > baseIndent) {
      const { list, next } = parseList(lines, i);
      if (items.length) items[items.length - 1].children.push(list);
      i = next;
      continue;
    }
    if (Boolean(numbered) !== ordered) break;

    items.push({ text: numbered ? match[3] : match[2], children: [] });
    i += 1;
  }

  return { list: { type: 'list', ordered, start: startAt, items }, next: i };
}

/* ------------------------------- rendering -------------------------------- */

const HEADING_CLASS = {
  1: 'mt-6 text-[19px] font-semibold tracking-[-0.02em] first:mt-0',
  2: 'mt-6 text-[17px] font-semibold tracking-[-0.018em] first:mt-0',
  3: 'mt-5 text-[15px] font-semibold first:mt-0',
  4: 'mt-4 text-[14px] font-semibold first:mt-0',
  5: 'mt-4 text-[13px] font-semibold first:mt-0',
  6: 'mt-4 text-[13px] font-semibold text-ink-2 first:mt-0',
};

/**
 * A single newline inside a paragraph is a line break, not whitespace.
 *
 * Strict markdown would collapse it, and for a document that is right. For an
 * assistant it is wrong: asked to count to forty, a model sends forty lines and
 * means forty lines. Collapsing them turns the answer into a smear of digits.
 */
function softBreaks(text, key) {
  const lines = text.split('\n');
  if (lines.length === 1) return renderInline(text, key);
  return lines.map((line, i) => (
    <Fragment key={i}>
      {i > 0 && <br />}
      {renderInline(line, `${key}-${i}`)}
    </Fragment>
  ));
}

function Blocks({ blocks, renderCode }) {
  return blocks.map((block, index) => {
    const key = `${block.type}-${index}`;

    switch (block.type) {
      case 'heading': {
        const Tag = `h${Math.min(block.level + 1, 6)}`;
        return (
          <Tag key={key} className={cx('font-display text-ink', HEADING_CLASS[block.level])}>
            {renderInline(block.text, key)}
          </Tag>
        );
      }

      case 'code':
        return renderCode(block, key);

      case 'rule':
        return <hr key={key} className="my-6 border-0 border-t border-line" />;

      case 'quote':
        return (
          <blockquote key={key} className="my-4 border-l-2 border-line-strong pl-4 text-ink-2">
            <Blocks blocks={block.blocks} renderCode={renderCode} />
          </blockquote>
        );

      case 'list': {
        const Tag = block.ordered ? 'ol' : 'ul';
        return (
          <Tag
            key={key}
            start={block.ordered && block.start !== 1 ? block.start : undefined}
            className={cx(
              'my-3 space-y-1.5 first:mt-0 last:mb-0',
              block.ordered ? 'list-decimal' : 'list-disc',
              'marker:text-ink-3 ps-[1.35em]'
            )}
          >
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex} className="ps-1 leading-[1.7]">
                {renderInline(item.text, `${key}-${itemIndex}`)}
                {item.children.length > 0 && <Blocks blocks={item.children} renderCode={renderCode} />}
              </li>
            ))}
          </Tag>
        );
      }

      case 'table':
        return (
          <div key={key} className="thin-scroll my-4 overflow-x-auto rounded-lg border border-line">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="bg-raised">
                  {block.head.map((cell, cellIndex) => (
                    <th
                      key={cellIndex}
                      className="whitespace-nowrap border-b border-line px-3 py-2 text-left font-semibold text-ink"
                    >
                      {renderInline(cell, `${key}-h${cellIndex}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b border-line last:border-0">
                    {block.head.map((_, cellIndex) => (
                      <td key={cellIndex} className="px-3 py-2 align-top text-ink-2">
                        {renderInline(row[cellIndex] || '', `${key}-${rowIndex}-${cellIndex}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );

      default:
        return (
          <p key={key} className="my-3 leading-[1.75] first:mt-0 last:mb-0">
            {softBreaks(block.text, key)}
          </p>
        );
    }
  });
}

/** Plain, chrome-free fallback for callers that do not bring their own. */
function defaultCode(block, key) {
  return (
    <pre key={key} className="thin-scroll my-4 overflow-x-auto rounded-lg border border-line bg-raised p-3">
      <code className="font-mono text-[12.5px] leading-[1.65] text-ink">{block.text}</code>
    </pre>
  );
}

/**
 * `renderCode(block, key)` is a prop rather than a branch because a code block
 * in a chat needs a copy button, a language tag and its own scroll container —
 * chrome that has no business living inside a parser.
 */
export const Markdown = memo(function Markdown({ text, renderCode = defaultCode, className }) {
  const blocks = useMemo(() => parseBlocks(text), [text]);
  return (
    <div className={cx('text-[15px] text-ink-2', className)}>
      <Blocks blocks={blocks} renderCode={renderCode} />
    </div>
  );
});
