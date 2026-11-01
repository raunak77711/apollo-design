# Jam board — a generated, annotatable video-essay canvas

Date: 2026-09-29
Status: Draft for review

## Purpose

A new Apollo page, **Jam board** (`/board`). The user pastes a long narrative
brief (a video essay: sections, flows, statements, diagrams described in prose)
and DeepSeek turns it into a large, vertically laid-out, white, premium visual
board. The user then screen-records themselves scrolling through it, drawing on
it, adding text/shapes/images, and moving pieces around while they talk.

It is the generative version of `video/website-is-losing-you-sales.html`, which
was hand-authored. Everything that file can do as a tool, the Jam board can do;
what changes is that the content comes from a brief instead of from code.

Reference brief (the shape of prompt to expect): a video concept, a visual style
description, a tool/UI wish-list, then 12 numbered chapters, each written as
prose plus flow fragments (`$5 CLICK ↓ WEBSITE ↓ LOADING ↓ CUSTOMER LEAVES`),
quoted lines, and statements. The brief mixes *content* with instructions about
the tool itself; only the content becomes board sections.

## Success criteria

- Pasting the reference brief yields a 12-section board whose diagrams match
  what each chapter describes (funnel, dependency graph, leak cards,
  side-by-side comparison, locked-CMS panel, the "ridiculous stack" hub), with
  the user's labels and quoted lines preserved verbatim.
- Generation may take a couple of minutes; progress is visible section by
  section and one bad section never loses the board.
- Scrolling is smooth with no size limit; zoom is exact; a 20-section board
  behaves the same as a 3-section one.
- All 18 tools work: Select, Hand, Pen, Highlighter, Eraser, Arrow, Line,
  Rectangle, Circle, Text, Sticky, Image, Undo, Redo, Clear annotations, Zoom
  in, Zoom out, Reset view.
- Presentation pieces are real objects: movable, resizable, rotatable,
  deletable. Connectors follow the nodes they join.
- Work survives refresh: annotations, moved/edited/deleted pieces, and view.
- Recording mode strips the UI to canvas + slim toolbar + zoom + section pill.
- Works with no DeepSeek key via a bundled example board (the reference deck
  rebuilt in the board format); the generator says plainly that it needs a key.
- **Direct mode** (milestone 2): typing "make the $5 click huge and put the
  browser diagram under it" edits the existing board through small validated
  operations, without regenerating anything, as one undo step.

## Non-goals

- No multi-user, no auth, no server-side board storage.
- No automated animation or slide sequencing — pacing is manual.
- No mobile/touch layout; desktop screen-recording tool.
- No image crop in v1 (resize/rotate/move/delete only).
- No pixel-level erase; the eraser removes whole annotation objects.
- Text inside grouped nodes/cards is not edited in place (move/resize/rotate/
  delete only). Free text blocks and everything the user adds are editable.
- Not a replacement for the design editor; boards and designs share nothing
  except the AI provider abstraction. Bridges (send an image to the photo
  editor, open a section as an editable design) are a later project; the
  renderer-independent state exists so they are possible.
- Direct mode does not generate whole new sections or images; that stays with
  *Regenerate section* and manual upload.

## Decisions already made with the user

- **Canvas-pan, not page scroll.** The wheel pans a viewport-sized canvas;
  Ctrl/Cmd+wheel and pinch zoom. No native scroll container, so there is no
  browser canvas-size limit.
- **Structure from the model, geometry from code.** DeepSeek returns blocks
  from a fixed vocabulary; deterministic client code places them. Consistent
  with how Apollo's design pipeline already works (`planDesign` + `layout.js`).
- **Fabric.js 5** as the canvas engine, lazy-loaded with the route.
- **Browser storage (IndexedDB)** for boards, with JSON export/import.
- **Editor-ready model, separate canvas** (decided after reviewing an outside
  critique that proposed hosting the board inside Apollo's design editor). The
  editor was inspected and cannot host this today: no arrow/connector/stroke/
  sticky element types, groups do not move their children (README: known
  limitation), and its renderer is one React DOM node per element on a fixed
  artboard with no virtualization. So the board keeps its own Fabric canvas, but
  its *state is renderer-independent* and changes only through validated
  **board operations** (see *Board state and operations*). Fabric draws that
  state; it is not the source of truth. This is what makes Direct mode cheap
  now and a later move into the editor possible.
- **Two milestones, one spec.** Milestone 1: generate, canvas, tools,
  persistence, recording mode. Milestone 2: **Direct mode** (AI edit commands).
  The state/operations layer is built in milestone 1 because the tools already
  need it.
- **Vertical-crop safe column** carried over from the earlier spec: the
  recording is landscape but will also be cropped to a centred 9:16 slice, so
  content is centred on the board's midline, text ≤ ~700 world px wide;
  wide diagrams (hubs, comparisons) are symmetric around the midline.

## Architecture

```
brief ─► /api/board/generate/stream
           outline call ──► sections[] (title, beat, density)
           per-section calls (×4 parallel) ──► blocks[] ──► validate ──► retry once
         ◄─ SSE: outline · section · done      (degraded fallback if a section fails)
board spec (JSON) ─► layoutBoard(spec, measure) ─► scene (pure geometry)
                  ─► sceneToFabric(scene)       ─► Fabric objects in a viewport canvas
user work = overrides (moves/edits/deletes of pieces) + annotations ─► IndexedDB
```

### Server

| File | Job |
|---|---|
| `server/src/design/board/schema.js` | Block vocabulary, limits, `normalizeSection` / `normalizeOutline`. Coerces, clips, drops unknown blocks, assigns block ids. The model's output is untrusted. |
| `server/src/design/board/prompts.js` | Outline prompt and section prompt (see *Prompting*). |
| `server/src/services/boardService.js` | `generateBoard`, `generateSection`: orchestration, concurrency 4, one retry with validator errors fed back, degraded fallback, abort support. |
| `server/src/design/board/operations.js` | The board-operation vocabulary and `validateBoardOperation` (mirrored on the client). |
| `server/src/routes/board.js` | `GET /api/board/status`, `POST /api/board/generate/stream` (SSE), `POST /api/board/generate` (whole, the stream's fallback), `POST /api/board/section` (regenerate one), `POST /api/board/edit` (Direct mode, milestone 2). |
| `AIProvider.completeJSON({ system, user, temperature, maxTokens, signal })` | New provider method. `DeepSeekProvider` implements it over the existing `chat()` (which gains `signal`). `MockProvider` throws `NotConfiguredError`; `/status` reports `ready:false`. |

Limits: brief 40–60,000 chars (400 otherwise); up to 20 sections; ≤ 10 blocks
per section; per-call `max_tokens` 3,500; per-call timeout 90 s. A client
disconnect aborts the upstream calls, as `assistant.js` does.

Errors reach the browser as sentences, never provider names or status codes
(same `friendlyError` approach as `routes/assistant.js`).

### Board spec (what the model returns)

```
Board   { version:1, title, audience, sections: Section[] }
Section { id, title, beat, density: 1..5, degraded?: true, blocks: Block[] }
Block   { id, type, tone?, ...fields }      // id assigned by the validator
tone    = ink | money | problem | movement | tech | solution   (roles, never hex)
```

| type | fields | used for |
|---|---|---|
| `title` | `text` (`\n` allowed), `size` xl/l/m, `eyebrow?` | section/opening titles |
| `statement` | `text`, `emphasis` loud/quiet | the big claim lines |
| `bigtype` | `text`, `caption?` | "8:47 PM", "$1,500", one huge token |
| `quote` | `text`, `attribution?` | serif italic customer lines |
| `flow` | `direction` up/down/right, `steps[{label,note?,tone?}]` (2–9), `scale` hero/normal/small | funnels, journeys, compact RAG pipeline |
| `hub` | `center`, `nodes[{label}]` (3–12), `links` spokes/spokes+cross | dependency graph, CRM cluster, "ridiculous stack" |
| `cards` | `items[{label,tag?,tone?}]` (2–12), `columns` 2–4 | leak cards, supporting-element chips |
| `compare` | `left`/`right` each `{heading, tone, steps[], footnote?}` | Generic AI vs Business AI |
| `panels` | `panels[{heading, tone, rows[{label,state}]}]` (1–3), state open/locked | field-locked CMS |
| `code` | `text`, `caption?` | `<a href="tel:…">`, LCP/TBT chips; always visually subordinate |
| `timeline` | `events[{when, label, tone?}]` (2–8), `direction` right/down | "8:47 PM → tomorrow morning", six-months-later beats |
| `funnel` | `stages[{label, value?}]` (3–7), `tone` | narrowing sales funnel (a tapered stack; `flow up` stays for plain chains) |
| `browser` | `url?`, `title?`, `note?`, `placeholder` "screenshot"/"blank" | a browser-window frame; the user drops a screenshot into it |

`density` is the model's narrative read of how busy the section should feel. The
layout engine maps it to whitespace and node size; the "simple → complex → chaos
→ simplified" arc comes from the brief through density and `hub.links`, not
from engine decoration.

Text limits enforced by the validator: labels ≤ 60 chars, statements ≤ 140,
`code` ≤ 120. Over-long text is clipped with an ellipsis and logged, never
rejected outright.

### Prompting

- **Outline call** — input: the brief. Output: `{ title, audience, sections:
  [{ title, beat, density }] }`. Told to ignore anything in the brief that is an
  instruction about the tool (toolbar, shortcuts, file names, localStorage,
  testing) and about visual style (built in), and to follow the brief's own
  chapter structure and order.
- **Section call** — the brief comes *first* in the prompt (so DeepSeek's prefix
  cache serves the other 11 calls), then "Build section N of M: title, beat,
  density", the adjacent section titles, and the vocabulary with guidance on
  choosing forms from prose: "browser/network dependency graph" → `hub`;
  `A ↓ B ↓ C` → `flow`; "versus / compare" → `compare`; "leak cards" → `cards`;
  a single dominant clock/number → `bigtype`; "keep visually subordinate" →
  `code` or `flow scale:small`.
- **Fidelity rules** — quoted strings and explicit flow labels are copied
  verbatim; wording is otherwise the model's; nothing (statistics, company
  names, product claims) is invented beyond the brief; a product/brand mention
  the brief says to keep subtle stays a small `title size:m` or `code` block.
- **Repair pass** — if validation drops a block or the section has no
  `title|statement|bigtype`, the section call is repeated once with the
  concrete validator errors appended. A second failure yields a **degraded
  section**: a `title` from the outline plus a `statement` from the beat,
  flagged so the UI shows *Regenerate*.

### Client

| Path | Job |
|---|---|
| `pages/BoardsPage.jsx` (`/board`) | Board list, "New board" (brief textarea, Generate), Import, "Example board". |
| `pages/BoardPage.jsx` (`/board/:id`) | Full-bleed board view. Lazy route; loads Fabric and the fonts here only. |
| `components/board/engine/measure.js` | Text measurement using real Fabric metrics after `document.fonts.load` (client-side layout can measure; the server can only estimate). |
| `components/board/engine/layoutBoard.js` | **Pure**: `layoutBoard(spec, measure) → scene`. Stacks sections top to bottom, blocks within a section with density-driven gaps. No Fabric imports. |
| `components/board/engine/blocks/*.js` | One layout function per block type. |
| `components/board/engine/sceneToFabric.js` | Scene primitives → Fabric objects with `data = { kind, id, section }`; connectors carry `data.from/to`. |
| `components/board/engine/viewport.js` | Pan/zoom: wheel, Ctrl/Cmd+wheel and pinch (zoom about cursor), eased pan for wheel notches, clamps, fit-to-width, focus-object, prev/next section. |
| `components/board/tools/` | One module per tool + the tool state machine. |
| `components/board/state/` | `boardState`, `applyOperation`, `validateBoardOperation` (mirror), snapshot history (undo/redo), scene reconciliation. The only writer of board data. |
| `components/board/direct/` | Command bar, scene-outline builder, `MOVE relativeTo` resolver (milestone 2). |
| `components/board/boardStore.js` | IndexedDB (`apollo-boards`): list, get, put, delete; localStorage fallback if IDB is unavailable. |
| `components/board/Toolbar.jsx`, `PropertyPanel.jsx`, `SectionRail.jsx`, `RecordingHud.jsx`, `HelpDialog.jsx`, `GenerateProgress.jsx` | React chrome following Apollo's `ui/` primitives. The **canvas is always white** regardless of the app's dark theme, because it is the recorded artefact. |
| `components/board/example/website-is-losing-you-sales.json` | The reference deck expressed as a board spec; doubles as the keyless demo and the reference for what good output looks like. |
| `client/src/api/board.js` | `boardStatus`, `generateBoardStream` (with plain fallback, mirroring `aiGenerateStream`), `regenerateSection`. |

`AppHeader` gains a **Jam board** link. Fonts (Inter, Geist, Space Grotesk,
DM Sans, IBM Plex Mono, Source Serif 4) are injected by `BoardPage` only; the
global `index.html` is untouched. New dependency: `fabric@5.3.x`.

### Canvas model

- World width is 1400; sections stack from y = 0. The Fabric canvas is
  container-sized with retina scaling on; `viewportTransform` carries pan/zoom.
  Fabric skips off-screen objects, so cost tracks what is visible.
- Initial zoom fits the board width to the window. Zoom range 0.25–4, always
  about the cursor (or viewport centre for buttons/keys).
- Wheel `deltaY` pans; a mouse-wheel notch eases over ~120 ms, trackpad deltas
  apply directly. Shift+wheel / `deltaX` pans sideways. Vertical clamp keeps the
  board on screen; horizontal is locked-centred until zoomed wider than the
  window. A slim scroll indicator shows position.
- **Tagging.** Every object has `data.kind` = `presentation` | `annotation` and
  a stable `data.id` (`s3.b2.n5` — section, block, part). Ids are deterministic
  from the spec, so layout can be re-run without losing user changes.
- **Connectors are live.** Flow arrows and hub spokes reference node ids and are
  recomputed on move/scale/rotate of either end; deleting a node deletes its
  connectors.

### Board state and operations

Three layers that never reach into each other:

```
AI document   spec            what DeepSeek said should exist (blocks per section)
Editor state  overrides,      what the user changed: moved/edited/deleted pieces,
              annotations,    things they drew or added, the viewport
              view
Render state  Fabric objects  derived, disposable; rebuilt or patched from the two above
```

`boardState = { spec, overrides, annotations, assets }` is plain, serialisable,
immutable-updated data in `components/board/state/`. **Every change goes
through `applyOperation(state, op) → state'`**, whether it came from a mouse
gesture, a toolbar button or DeepSeek. Fabric events are translated into
operations on the way in; state changes are reconciled onto the canvas on the
way out (targeted patches by object id; a layout-affecting operation re-lays out
only its section). Undo/redo is a stack of state snapshots (cap 100) — cheap,
because images live in `assets` (id → data URL) and annotations reference them
rather than embedding them.

Operations are a closed set, validated identically on both sides (a mirrored
`design/board/operations.js`, the same convention as `design/operations.js`):

| op | fields |
|---|---|
| `SET_TEXT` | `target`, `text` |
| `SET_STYLE` | `target`, `changes` (font, size, weight, colour/tone, align, line height, letter spacing, opacity, stroke, fill, radius, dash) |
| `MOVE` | `target`, then either `dx`,`dy` **or** `relativeTo`, `position` above/below/left/right/**over** (centred on the anchor), `gap?`, `align?` center/start/end |
| `RESIZE` | `target`, `scale` (uniform multiplier) or `scaleX`+`scaleY` — pieces resize by transform, not by absolute size |
| `ROTATE` | `target`, `angle` |
| `DELETE` / `RESTORE` | `target` |
| `INSERT_BLOCK` | `section`, `index`, `block` (same vocabulary and validator as generation) |
| `REPLACE_BLOCK` | `target` (block id), `block` |
| `CONNECT` / `DISCONNECT` | `from`, `to` (node ids), `tone?`, `dashed?` |
| `ADD_TEXT` / `ADD_SHAPE` / `ADD_ARROW` | annotation creation with style and, optionally, `relativeTo` placement. A shape placed `over` an object with no stated size is drawn around it ("circle LOADING"). An `ADD_ARROW` between two ids becomes a live `CONNECT`. |
| `FOCUS` / `SET_VIEW` | `target` or `{zoom, x, y}` — moves the camera (not part of undo) |

`target` is an object id (`s3.b2` for a whole block, `s3.b2.n5` for one part, or
an annotation id) or a list of ids. `MOVE` with `relativeTo` is resolved by the
client at apply time from measured bounds into numeric offsets, so stored state
stays numeric and replayable. Unknown ids, unknown ops and out-of-range values
are dropped, never applied.

### Direct mode (milestone 2)

A command bar (`/` or `Ctrl/Cmd+K`, hidden in recording mode) accepts plain
instructions. The client sends the instruction plus a compact **scene outline** —
per section: block ids, types, key labels, and the current bounds of anything
the user moved; the ids of the current selection — to `POST /api/board/edit`.
DeepSeek returns `{ operations, message }`; the server validates every operation
against the vocabulary and drops the invalid ones (as `routes/ai.js` does);
the client applies the batch as **one undo step** and shows the message. Nothing
regenerates. Selection is passed so "make this bigger" works. The outline never
contains image data (the same lesson as `sanitizeForPrompt` in `DeepSeekProvider`).

The section prompt's vocabulary and the edit prompt's operation list are the two
places the model learns the board's language; both are assembled from the same
schema constants so they cannot drift from the validators.

### User work and persistence

A board record: `{ id, title, brief, spec, overrides, annotations, assets, view,
createdAt, updatedAt }`.

- `overrides[id] = { dx, dy, scaleX, scaleY, angle, text?, deleted? }` — every
  change to a presentation piece, expressed **relative to its section's top**.
- `annotations[]` — Fabric `toObject(['data'])` JSON, positions also **relative
  to the owning section's top** (the section under the object's top edge at
  creation). If a later regeneration changes section heights, everything below
  still lands with its section.
- The presentation itself is *never* persisted as geometry; it is recomputed
  from `spec` on every load, so **Clear annotations** and content changes can
  never corrupt it.
- Autosave 800 ms after any change; flushed on `pagehide` / `visibilitychange`.
  Write failures show a toast, never throw.
- **Save** exports the board as `.json`; **Load** restores the whole board state
  (spec, overrides, annotations, images) from a file exported from this board,
  after a confirm (a file from another board opens as a new board). **Clear annotations** removes only `kind:'annotation'`
  after a confirm. **Reset layout** clears `overrides` for the board.
- **Regenerate section** replaces one section's blocks, drops that section's
  overrides (confirm first), keeps its annotations, and clears undo history.

## Tools and interaction

- **Select** — transform handles (move/resize/rotate) on any object; marquee;
  `Delete` removes; property panel follows the selection.
- **Hand** — drag pans; holding `Space` is a temporary Hand.
- **Pen / Highlighter** — freehand, stay active; colour, width, opacity from the
  panel. Strokes are tagged in `path:created`.
- **Eraser** — stays active; dragging across annotation objects removes them.
  Presentation pieces are removed with Select + `Delete` (undoable).
- **Rectangle / Circle / Line / Arrow** — drag to draw (Shift constrains),
  then revert to Select. **Line** and **Arrow** are one custom Fabric class with
  editable endpoints, optional heads at either end, solid/dashed, thickness,
  colour; endpoints snap to the centre or an edge midpoint of any object within
  15 screen px.
- **Text** — click to place, immediately editable. Panel: font (Inter, Geist,
  Space Grotesk, DM Sans, IBM Plex Mono, Source Serif 4), size, bold, italic,
  underline, colour, align, line height, letter spacing.
- **Sticky** — pale-yellow editable text box.
- **Image** — toolbar upload, **drag-and-drop onto the canvas, and paste from the
  clipboard** (screenshots). PNG/JPG/WebP only, downscaled to ≤ 1600 px; placed at
  the viewport centre; behaves as any object.
- One-shot tools revert to Select after use; **double-click a tool button to
  lock it**.
- **Shapes** — fill, border colour, thickness, opacity, corner radius.
- **Colours** — the six semantic tones as swatches plus a free picker; default
  annotation red is `problem`.
- **Undo/redo** — 100 state snapshots covering any object, annotation or
  presentation; a property-panel drag/typing burst coalesces into one step, and a
  Direct-mode batch is one step.
- **Direct bar** — `/` or `Ctrl/Cmd+K` (milestone 2), see *Direct mode*.
- **Keys** — `V H P A T R C E`, `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`, `+ - 0`,
  `F` focus selection, `[` `]` previous/next section, `Esc` exits recording mode
  or deselects. All bare-key shortcuts are ignored while editing text or focus is
  in an input.
- **Recording mode** — hides app header, section rail, save/load/clear and the
  property panel (which becomes a compact popover on selection). Keeps the slim
  toolbar, zoom controls, and a section pill (`4 / 12 — YOU PAID FOR THE CLICK`)
  derived from the viewport centre. A fullscreen button is offered, not forced.
- **Help** — a small `?` button opens the controls dialog.

## Layout rules (`layoutBoard`)

- Sections are contiguous; each is as tall as its content plus generous top and
  bottom padding; `density` scales the gaps and node sizes (1 = airy, 5 = tight).
- Every text block is centred on x = 700 and ≤ 700 wide; `flow right` wraps to
  a second row rather than exceeding the width; `hub` radius grows with node
  count; `compare` columns sit symmetrically about the midline.
- Minimum sizes so recordings stay legible: normal labels ≥ 22 px, `scale:small`
  and `code` ≥ 16 px.
- Block order is model order. No overlapping between blocks within a section.
- Tone → colour: `ink` #0a0a0a, `money` #0f7a3c, `problem` #c81e3a,
  `movement` #1d4ed8, `tech` #6b6b6b, `solution` ink-filled emphasis.

## Error handling

- No key: `/status` → `ready:false`; the New-board form is disabled with a plain
  explanation and the Example board is offered.
- Brief outside 40–60,000 chars: inline validation before any request.
- Outline call fails: the request fails as a whole and nothing is saved.
- A section fails twice: degraded section, board still saved, *Regenerate* shown.
- Stream unavailable or cut short: falls back to `POST /generate`.
- The user leaves during generation: abort propagates to DeepSeek.
- Fonts fail to load: layout proceeds with fallback metrics after a 3 s ceiling.
- IndexedDB unavailable: fall back to localStorage with a visible warning about
  size; quota errors toast.
- Imported files are validated (`parseBoardFile` → `sanitizeSpec`) before use;
  unknown blocks are dropped, never executed. The board contains no HTML — text is drawn onto the
  canvas.

## Testing

No test framework exists in the repo; Node's built-in runner is enough and adds
no dependency (`node --test`).

- `server/test/board.schema.test.js` — the validator coerces, clips, drops
  unknown blocks and assigns ids; the reference example passes unchanged.
- `server/test/board.service.test.js` — with a stub provider: outline → sections
  in order, concurrency cap, repair retry uses the validator errors, degraded
  fallback, abort stops further calls.
- `server/test/board.prompts.test.js` — brief is the leading prefix of every
  section prompt; vocabulary and fidelity rules present.
- `server/test/board.operations.test.js` and `client/test/state.test.js` — every
  operation applies as specified, invalid ones are dropped, undo/redo round-trips
  exactly, and applying a batch then undoing it restores the prior state
  byte-for-byte. `server/test/board.parity.test.js` proves the server and client
  vocabulary files are byte-identical (stronger than agreeing on fixtures).
- `server/test/board.edit.test.js` — with a stub provider: a malformed or partly
  invalid model reply yields only the valid operations plus a message; the
  outline sent to the model contains no `data:` strings.
- `client/test/layout.*.test.js` — with a stub measurer: every block is centred on
  700, no overlaps, sections contiguous, min font sizes hold, output deterministic
  for identical input (ids stable), and the bundled example lays out cleanly with
  the density arc intact.
- Browser acceptance scripts (`docs/superpowers/plans/jam-board-e2e/`) drive the
  real board in Chrome; they are the executable form of the list below.
- A root `npm test` script runs both.
- **Real-browser verification before this is called done** (dev server, real
  DeepSeek if a key is available, otherwise the example board): scroll and zoom
  on the 12-section board; every tool; text styling; shapes; arrows and snapping;
  image upload / drop / paste; undo/redo across annotation and presentation
  changes; connectors following moved nodes; refresh persistence; Save/Load;
  Clear annotations leaving the presentation untouched; Reset layout;
  Regenerate section; recording mode; keyboard shortcuts; a 20-section board.

## Documentation

`README.md` gains a *Jam board* section (what it is, the pipeline, keyless
behaviour, limitations) and the `/api/board/*` routes in the API list, matching
how the other features are documented.

## Known limitations (to state in the README)

- Layout is deterministic but the *choice* of diagram per chapter is the model's;
  it can pick a form the user would not, and Regenerate is the remedy.
- No image crop; eraser is object-level; grouped nodes are not text-editable.
- Direct mode understands the board's own vocabulary and ids; it cannot do
  pixel edits to an uploaded image (that belongs to the photo editor, via a
  future bridge).
- Boards live in one browser; moving machines means Save → Load.
- Regenerating a section discards that section's piece moves.
- `docs/` and `video/` are currently untracked in this repo (not ignored), so
  this spec, its plan, and the reference deck are not yet committed.
