# Apollo Design

An AI-native visual design environment. **AI creates. You control.**

Apollo doesn't ask an LLM to spit out HTML. It keeps a canonical **design document**
(JSON) and mutates it only through validated **operations**. The same operation
system powers both manual editing (drag, resize, the properties panel) and AI
editing — so anything the AI makes, you can freely edit, and vice-versa.

```
Prompt → AI → Operations → (validate) → Apollo Document → React Renderer → Editable Canvas
```

DeepSeek is replaceable. The document format, operation system, renderer, and
component registry are the core of the product.

Alongside the design studio, **Apollo AI** (`/ai`) is a general-purpose
assistant — coding, learning, writing, research, ordinary questions — built on
the same provider abstraction but deliberately kept a separate experience. See
[Apollo AI](#apollo-ai).

## How a design gets made

Generation is not one prompt to one model. It is a pipeline where each stage
does the thing it is actually good at:

```
prompt (+ an optional scribble)
  → reading         The drawing, if there is one: ink measured with Sharp, then
                    read for meaning. Fixes structure, subject and hierarchy.
  → art direction   DeepSeek returns a design brief: style, palette, type
                    pairing, layout, copy, photographic direction. No coordinates.
  → photography     Pexels + Unsplash searched together; candidates are downloaded
                    at thumbnail size and analysed for tone, detail and flat areas.
  → composition     A grid, a modular type scale and one of ten layout archetypes
                    turn the brief into precisely placed, aligned elements.
  → critique        Contrast, hierarchy, margins, collisions, density and colour
                    discipline are measured, and what can be repaired is repaired.
  → operations      Ordinary CREATE_ELEMENT calls — every layer stays editable.
```

**The model is never asked for geometry.** Language models place elements badly:
a headline that overflows its box, margins that differ on each edge, a 7px
misalignment. Those small errors are what make generated work look cheap. So
DeepSeek art-directs and `server/src/design/layout.js` composes.

**Photographs are chosen, not taken off the top of the list.** The curator
(`server/src/services/images/curator.js`) scores candidates on relevance,
orientation, resolution, tonal fit with the palette, and — from a 48px thumbnail
analysed with Sharp — where the frame is quiet enough to carry type. That gives
the composition a real focal point to crop to and tells it which side has usable
negative space, so the layout responds to the picture instead of dropping it in
a box.

**Apollo reviews its own work.** `server/src/design/critique.js` measures the
result and repairs what it can (weak contrast, clipped type, broken margins,
off-axis edges). If the design still scores badly, the brief goes back to
DeepSeek with the specific failures attached and is reconsidered.

---

## The moon

The homepage opens on a real 3D moon — the project's own `Moon_3D_Model`, its
displaced mesh and crater map baked to 235 KB by `scripts/bake-moon.mjs` and
drawn in raw WebGL. Not a picture of a moon and not a sphere with a gradient on
it.

It is the same moon that turns while Apollo draws, and that is the point: you
brief Apollo under the sky it works under. One scene, two **framings**
(`components/generation/moonScene.js`):

- **drifting** — the generation screen. The moon wanders the frame, unanchored,
  because nothing else is on screen.
- **held** — the homepage. Anchored where the layout leaves room, large enough
  to be the subject, and cropped by the frame like a photograph. Beside the type
  where there is width for a column; stacked above it where there is not.

The held framing answers the page. The pointer moves it against itself, the way
a far object behaves when you pan across it. Focusing the composer brings it
closer *and* lifts its key light, so starting to write reads as Apollo waking
rather than as a zoom. Scrolling lets it lag behind the page and set.

None of it is load-bearing. The moon is fetched at idle, never against first
paint; it stops drawing when scrolled past or covered; and no WebGL, a lost
context, a failed fetch, reduced motion or a data-saving preference each fall
back a step, down to a CSS still. The hero's headline and prompt box never
depend on any of it.

A side effect worth having: a homepage visit decodes the moon once, so the
generation screen already has it.

## Scribble → Design

Draw the idea; Apollo builds the design it describes. `/scribble`.

The temptation with a feature like this is to feed the drawing to an image model
and hand back a picture. Apollo does the opposite, because a picture is not what
this app makes: the output here is an ordinary **Apollo document** — real
photography, a real grid, measured type, every layer editable in the editor
afterwards. The sketch is not traced. It is read as a **composition brief**.

```
sketch → reading → the same brief the composer already builds from → design
```

A drawing enters the pipeline exactly the way creative preferences do
(`design/scribble.js` alongside `design/preferences.js`): as a constraint on the
*raw plan*, applied before `normalizeBrief`, so the user's structure and the
model's taste go through one validator, one aspect-ratio filter and one palette
repair. The art director is told what was drawn and is never trusted to have
obeyed — that module is the enforcement.

What the sketch decides: which layout archetype (a big shape with words beside
it is a split composition; a shape filling the sheet with type over it is a
full-bleed hero; a moon above mountains is one *scene* and gets one photograph),
whether the design is type-led or image-led, what the subject of the photography
is, and **where the frame has to be quiet** — the curator already scores
candidates on usable negative space, so pointing it at the region someone
reserved for their headline is what makes the finished poster hold the shape of
the drawing.

What it never decides is coordinates. `layout.js` still composes, which is the
whole reason the result looks art-directed instead of traced.

**Reading a scribble is two passes, and the free one always runs.** Geometry
first (`services/scribbleReader.js`): ink measured by alpha on a 96px raster,
connected marks extracted with their own bounding boxes, then — the part that
matters — marks merged into *runs*, because someone printing "EXPLORE" draws
eight shapes and reading those as eight objects would be a catastrophic
misreading of a composition containing one word. Detail drawn *inside* a shape
(craters on a moon) is absorbed into it. Roles then come from shape alone: a
long low run of small marks is lettering, a big mark is the subject, a scatter
of specks is decoration. Then Gemini reads it for *meaning* — which shape is the
moon, what the handwriting says — and its regions are checked against the
measured ink before anything acts on them, so a hallucinated region in an empty
corner is overruled by the pixels. No key, a busy model, or a slow one each fall
back to the geometry, which is a genuinely usable brief on its own.

**Nothing is ever overwritten.** The sketch is saved as a version before a
design is generated from it, every design is saved as another, and restoring
snapshots the current work first — so "try again" is an invitation rather than a
gamble. Versions keep both the picture *and* the strokes, normalised to 0..1, so
reopening one puts a live, editable drawing back on the canvas at whatever size
the window happens to be (`services/versionService.js`).

The canvas keeps strokes as points rather than pixels — unlike `raster/`, where
the pixels are the document — which is what makes undo, redo, resize, save,
restore and export-at-any-resolution all cheap. Coalesced pointer events,
midpoint quadratic curves and incremental painting are what make it feel smooth;
pressure is honoured where a stylus reports it.

## Apollo AI

A second, separate experience in the same product: a general-purpose assistant
at `/ai`. Not another way to make a design — a place to ask anything.

```
Apollo AI UI  →  /api/assistant  →  assistantService  →  AIProvider.converse()  →  model
```

The distinction is deliberate and load-bearing:

| | Design AI (`/api/ai`) | Apollo AI (`/api/assistant`) |
|---|---|---|
| Job | language → validated operations | conversation |
| Returns | JSON the operation validator checks | prose the reader reads |
| Lives in | home composer, editor panel | `/ai` |

They share one thing — `services/ai`, the provider abstraction — and nothing
else. Swapping the model behind the assistant cannot change how a poster gets
built, and the assistant is never tempted into deciding it is a design tool:
it answers "what is Nepal?" as readily as "explain async/await".

**Streaming.** `POST /api/assistant/chat/stream` is server-sent events over
POST (the transcript is the body, and `EventSource` can only GET). Tokens arrive
as `delta` frames; Stop aborts the request, which the server passes on to the
provider, so stopping actually stops paying. If the stream is unavailable for
any reason the client falls back to `POST /api/assistant/chat` and the user
loses the live typing, never the answer.

**Markdown** is rendered by `client/src/lib/markdown.jsx` — headings, lists,
tables, emphasis, links and fenced code with copy — built as React elements
rather than an HTML string, so there is no markup to sanitise and a model that
emits `<script>` gets it back as text. It parses correctly mid-stream: an
unterminated fence renders as a live code block, an incomplete table as the rows
that exist so far.

**Conversations** live in `localStorage` (`components/ai/conversations.js`).
A chat is not created until it is spoken to, so the history never fills with
empty threads. Server-side persistence is a change to that one file.

**Extending it.** `services/assistantService.js` holds the three seams the next
capability needs: `buildSystemPrompt()` takes injected context (retrieval, a
design document sent from the editor), `prepareTurn()` is where a request would
be classified and enriched, and `streamReply()` is where a tool loop would wrap
the provider call. None are built yet, and none need to be for this to work.

## Stack

| Layer     | Tech |
|-----------|------|
| Frontend  | React, Vite, Tailwind, React Context + `useReducer`, Lucide React + react-icons |
| Backend   | Node, Express, Mongoose (MongoDB), `compression` (gzip) |
| AI        | DeepSeek (behind an `AIProvider` abstraction) — design briefs, edits, and Apollo AI's streamed conversation |
| Images    | Pexels / Unsplash (behind an `ImageProvider` abstraction), Mongo-cached searches |
| Media     | Sharp (uploads, export, image adjustments, layer merge/flatten) |
| Storage   | Local filesystem (`server/storage/`) |
| Dev       | Docker Compose — a production build (nginx) and a hot-reload dev stack |

## Runs with zero API keys

To make the MVP demonstrable out of the box, three graceful fallbacks exist:

- **No MongoDB?** The server uses an in-memory store (data won't persist across restarts).
- **No `DEEPSEEK_API_KEY`?** A deterministic `MockProvider` art-directs from your
  prompt using the same brief format DeepSeek returns, so the composer, curator
  and critic all still run — a keyless install gets real layouts and palettes,
  not a placeholder. Add a key to switch to real DeepSeek; nothing else changes.
- **No image API key?** A keyless `PlaceholderProvider` returns stock-style photos.
- **Apollo AI without a key?** It says so, plainly, instead of inventing an
  answer — streamed, so the whole interface still works. There is no honest
  offline stand-in for general knowledge.

Add real keys to a root `.env` or `server/.env` — copy `.env.example`. Both are
loaded, so it does not matter which you use.

Both stock libraries are used **together** when both keys are present: they
index very different photography, and giving the curator two pools to choose
from is the cheapest available upgrade to what lands on the canvas.

With DeepSeek connected, editing an existing design can reach **everything** in
the schema (shape, colour, gradients, blend modes, shadows, crop, image
adjustments, grouping — not just text/colour). Vague prompts are handled by the
art-direction stage rather than by keyword matching, though a short industry
list (`server/src/design/industries.js`) still backs the keyless planner. Every
provider result — real or mock — goes through the same operation validator, so a
bad or malformed AI response can't corrupt the document.

Stock photo searches (manual or AI-triggered) are cached in Mongo for two
weeks (in-memory if Mongo isn't running), so repeat searches are instant and
don't burn API quota — see `server/src/models/ImageSearchCache.js`.

---

This is a **local, single-user** app (a school project) — there is no login or
accounts. Run it one of two ways:

### Option A — Docker, production-style build

```bash
# optional: add API keys for real DeepSeek / stock photos
cp .env.example .env    # then edit — totally optional

docker compose up --build     # or: npm run docker:up
```

- Frontend: http://localhost:5180 (nginx, serving the built app)
- Backend:  http://localhost:5010  (health: `/api/health`)
- MongoDB:  localhost:27020

Stop with `docker compose down` (add `-v` to also wipe the database).

### Option A½ — Docker with hot reload (for actively working on the code)

```bash
cp .env.example .env    # optional
docker compose -f docker-compose.dev.yml up --build   # or: npm run docker:dev
```

Same ports, but the frontend runs the real Vite dev server and the backend
runs under `nodemon` — both containers bind-mount your source, so edits on the
host reload automatically (no rebuild). File-watching uses polling
(`--legacy-watch` / `usePolling`), which is what makes this reliable inside
Docker on Windows/macOS, where native filesystem events don't cross a bind
mount. Stop with `npm run docker:dev:down`.

### Option B — Local dev (Vite + nodemon, no Docker)

```bash
npm install && npm run install:all
cp server/.env.example server/.env      # optional keys
docker compose up -d mongo              # or point MONGODB_URI at any mongo
npm run dev
```

- Frontend: http://localhost:5180
- Backend:  http://localhost:5010

Vite proxies `/api` and `/storage` to the backend, so no CORS setup is needed in dev.

> **Ports** (5180 / 5010 / 27020) are chosen to avoid the other local stacks
> (waas, tsultrim, headless, erp). In Docker, nginx serves the frontend and
> proxies the API to the backend; MongoDB and storage persist via volumes.

### Walkthrough

1. Open the app. On **Home**, pick a format in the composer and describe what you want:
   > A dark, premium banner for Aryans Gym with the headline "Transform your body" and a "JOIN NOW" button.
2. Apollo creates the project and draws a background, hero image, headline, subtitle,
   button, and icon — all as editable layers. The design saves itself as you work.
3. Select a layer: the right panel becomes exactly the controls that layer needs
   (typography for text, fill for shapes, adjustments for images). With nothing
   selected it shows canvas settings; with several selected, alignment and grouping.
4. Drag with alignment snapping, marquee-select, nudge with the arrow keys,
   **Copy/Cut/Paste** (⌘C/⌘X/⌘V), **⌘K** for every action, **Undo/Redo** (⌘Z),
   then **Export** to PNG/JPG/WebP.
5. Keep asking: *"make the headline bigger"*, *"change the button colour to blue"* —
   each reply is a minimal, undoable operation applied to the same document.
   The **Apollo** panel and the **Layers** panel share the right column — a
   button in either one's header jumps straight to the other.
6. Double-click an image (or **Adjust** in its properties) for the full photo
   editor: **Adjust** (Color/Light/Details/Scene — vibrance, temperature, tint,
   exposure, black/white points, highlights/shadows, sharpen, clarity, smooth,
   grain, vignette, glamour, bloom, dehaze, plus the original brightness/
   contrast/saturation/hue/blur/rotate) and **Effects** (ten moods — B&W,
   Faded, Vintage, Tone, Portrait, Food, Urban, Nature, Vivid, Artsy — six
   one-click presets each). Hold **Eye** to compare against the original.
   The same editor also has **Liquify** (push/enlarge/shrink/swirl/restore —
   a real pixel warp, with a resizable brush circle and size/strength/density)
   and **Retouch** (dodge & burn by tonal range, plus a local sharpen and
   blur brush).
7. The **Draw** tool (rail, or an image's "Draw" button) opens a full canvas:
   brush, eraser, an 8-mode pen (plain/parallel/sketchy/shaded/furry/trail/
   crayon/ink), a fill bucket (tolerance, opacity, anti-alias, contiguous),
   and shape tools (rectangle/circle/triangle/star/heart/line) you drag to
   size, each with independent fill and outline.
8. In the **Layers** panel: rename, lock, hide, reorder, group, and — new —
   **Merge down**, **Merge visible**, and **Flatten image** (right-click a
   layer, or the **···** menu), which rasterize the target layers into one new
   image layer via the same Sharp pipeline export uses. The **+** button adds
   an empty image, a frame, text, or a shape.
9. The icon picker (in Properties and in the Library panel) has two sets —
   **Line** (Lucide, what the AI uses) and **Fun** (Game Icons — animals,
   food, party, nature) — each searchable.

10. **Scribble** (`/scribble`) is the other way in: draw the idea instead of
    describing it — a circle for the moon, a ridge for mountains, a bar where
    the headline goes — optionally add a line of direction, and press
    **Generate**. Apollo reads the arrangement and builds a finished design to
    it. Hold **Your sketch** on the result to ghost the drawing back over the
    design and see what it kept. Every sketch and every design is a version;
    **Try again** adds one rather than replacing one, and any version can be
    reopened or restored. **Edit design** hands the result to the ordinary
    editor as ordinary layers.

**Templates** opens ten finished layouts as live layers, and **Assets** holds your
uploads plus the stock photo library.

---

## Project layout

```
apollo-design/
├── client/                 # Vite + React editor
│   └── src/
│       ├── design/         # schema.js + operations.js (MIRROR of server), icons
│       │                   # (multi-library), imageFilters.js, effects.js,
│       │                   # templates, presets, fonts, arrange (align/snap)
│       ├── state/          # EditorContext + reducer, useLayerActions,
│       │                   # useMergeLayers (merge/flatten)
│       ├── ui/             # design system: primitives, fields, overlays, brand,
│       │                   # onboarding (the AI-generating overlay + hints)
│       ├── components/     # editor/ (stage, rail, inspector, panels, PhotoEditor,
│       │                   # LiquifyTab, RetouchTab, DrawStudio) + elements/,
│       │                   # home/ (hero, moon stage, composer),
│       │                   # scribble/ (sketch canvas, tools, versions),
│       │                   # generation/ (moonScene.js — the WebGL moon),
│       │                   # ai/ (Apollo AI: composer, messages, code blocks,
│       │                   # conversation rail, useApolloAI)
│       ├── raster/         # pixel tools: liquify.js, retouch.js, draw.js,
│       │                   # rasterShapes.js, imageIO.js, useBrushStroke.js
│       └── pages/          # Home, Templates, Assets, EditorPage, ScribblePage,
│                           # ApolloAI (the assistant workspace)
├── docker-compose.yml      # production build (nginx)
├── docker-compose.dev.yml  # hot-reload dev stack (vite + nodemon, bind mounts)
└── server/                 # Express API
    └── src/
        ├── design/         # canonical schema.js + operations.js, plus the
        │                   # design engine: artDirection.js (styles, palettes,
        │                   # pairings, formats), layout.js (grid + 10 layout
        │                   # archetypes), typography.js (metrics, fitting,
        │                   # scale), critique.js (review + repair), color.js
        │                   # (contrast, scrims, harmony), industries.js,
        │                   # scribble.js (a drawing as a composition brief)
        ├── services/
        │   ├── ai/         # AIProvider → DeepSeekProvider | MockProvider
        │   │               # (planDesign · generateOperations · converse)
        │   ├── images/     # Pexels + Unsplash together, + curator.js (scores
        │   │               # candidates on composition, tone, negative space)
        │   ├── designService.js  # plan → source → compose → critique → revise
        │   ├── scribbleReader.js # ink geometry (Sharp) + vision (Gemini)
        │   ├── versionService.js # append-only snapshots per project
        │   ├── assistantService.js # Apollo AI: system prompt, history budget,
        │   │               # and the seams for context/tools
        │   ├── aiService.js, exportService.js, storageService.js
        ├── models/         # Project, Asset, ImageSearchCache (Mongoose) — no user/auth
        ├── store/          # repository w/ in-memory fallback
        └── routes/         # projects, ai, assistant, images, assets, export
```

## API

```
GET    /api/health
GET    /api/projects            # list + a capped `preview` document for live cards
POST   /api/projects            # { name, canvas } or { name, document } (templates)
GET    /api/projects/:id        PUT  /api/projects/:id     DELETE /api/projects/:id
GET    /api/projects/:id/versions              POST /api/projects/:id/versions
GET    /api/projects/:id/versions/:vid         DELETE /api/projects/:id/versions/:vid
POST   /api/projects/:id/versions/:vid/restore # append-only history; restoring
                                # snapshots the current work first
POST   /api/ai/chat             # { message, document, selectedElementId } → { operations, message }
                                # routes itself: a design request takes the full
                                # pipeline, an edit goes straight to operations
POST   /api/ai/generate         # always takes the art-direction pipeline
                                # optional `scribble` (a PNG data URL) is read as
                                # a composition brief — see Scribble → Design
POST   /api/ai/variations       # → three complete directions (bold / minimal / editorial),
                                # each a different composition, not a recolour
GET    /api/assistant/status    # → { ready, model } — is a live model configured?
POST   /api/assistant/chat/stream  # { messages:[{role,content}], context? }
                                # SSE: `delta` (text) · `done` · `failed` (human-readable)
POST   /api/assistant/chat      # the same turn delivered whole — the stream's fallback
GET    /api/images/search?q=    # searches every configured library, interleaved
GET    /api/assets              POST /api/assets/upload    # multipart (file, projectId)
POST   /api/export              # { projectId, document, format }
POST   /api/export/flatten      # { document } → { dataUrl }  — layer merge/flatten
```

## Security notes

- The DeepSeek key never leaves the backend; all AI calls are server-side.
- AI output is untrusted: every operation is re-validated by the operation system
  before it touches a document, icon names are whitelisted, and no raw HTML/SVG/JS
  is ever executed. Apollo AI's markdown is built as React elements, never as an
  HTML string, and only `http(s)`, `mailto:` and same-origin links are followed.
- Upstream failures are translated before they reach the browser: a user sees
  "Apollo AI couldn't complete that response", never a provider name or status.
- Uploads are re-encoded by Sharp with generated filenames; storage paths are
  confined under `server/storage/` (traversal is blocked).

## Known MVP limitations (honest status)

- **No auth by design** — this is a local single-user app; all projects are shared
  on the one machine it runs on.
- **Apollo AI has no web access and no tools yet.** It answers from the model's
  own knowledge and says so when a question needs current information. The
  service layer is shaped for retrieval and tool calls (`assistantService.js`),
  but nothing is wired. Conversations are stored per-browser in `localStorage`,
  so they do not follow you to another machine.
- **Server-side export** rasterizes shapes, text, and images via SVG→Sharp.
  brightness/contrast/saturation/hue/grayscale/blur/sharpen and vignette are
  applied for real (Sharp `modulate`/`linear`/`sharpen`/a composited gradient).
  vibrance/temperature/tint/exposure/black/white/highlights/shadows/clarity/
  dehaze have **no CSS or Sharp primitive** and are folded into
  brightness/contrast/saturation with the same formula on both the client
  preview and the server export (`design/imageFilters.js` /
  `exportService.js`) — a close approximation, not a true tone curve or white
  balance. **Grain, glamour, and bloom are preview-only** — they render live on
  the canvas and in the photo editor (as overlay layers) but are not
  reproduced in the exported file. Lucide/Game **icons render as an outline
  placeholder in exports** (they render fully in the browser). Custom web
  fonts fall back to system fonts in the export renderer.
- **Photo editor** has two tabs: **Adjust** (see above) and **Effects** (60
  one-click mood presets). **Pixel crop/flip are not yet included** in the
  editor UI (rotate and a focal-point crop are, via the Properties panel).
- **Groups** exist in the schema/operations but the canvas doesn't yet move a
  group's children together — grouping is structural only for now.
- **Merge down / Merge visible / Flatten image** rasterize the target layers
  (via the server's SVG→Sharp pipeline) into one new image layer — a real
  operation, not a placeholder, but it's a one-way conversion: the merged
  layers' individual properties are gone once merged (undo still restores them,
  since it's one operation like any other).
- **Liquify, Retouch, and a freehand Draw studio** are implemented as real
  pixel tools (`client/src/raster/`) — a canvas is loaded from the image, the
  brush paints/warps it live, and Apply bakes the result back into the
  element's `src` as one undoable step (Liquify/Retouch live as tabs inside
  the photo editor; Draw is its own full-screen tool, reachable from the tool
  rail or an image's "Draw" button, and can start from a blank layer or an
  existing photo). Liquify does real per-pixel backward-mapped warping
  (push/enlarge/shrink/swirl/restore); Retouch does tonal-range-aware dodge
  & burn plus local sharpen/blur; Draw has a soft brush, eraser, an 8-mode
  pen (plain/parallel/sketchy/shaded/furry/trail/crayon/ink — each a
  genuinely different render, not a reskin), a flood fill (contiguous or
  global, with tolerance/anti-alias), and drag-to-create shapes
  (rectangle/circle/triangle/star/heart/line) with independent fill/outline.
  One real limitation: a photo from a host that doesn't grant cross-origin
  pixel access (the keyless Picsum placeholder fallback; Pexels and Unsplash
  both do) can't be read back into pixels — the tool detects this and tells
  you to upload the image first rather than failing silently.
- **Merge/flatten and the pixel tools don't move a group's frame** — see the
  groups note above; this is the same limitation, not a new one.
- **Type fitting is measured, not rendered.** The server has no font rasteriser,
  so `design/typography.js` estimates line widths from per-face advance-width
  metrics (biased ~2% wide, since under-estimating clips text and
  over-estimating only costs a fraction of a point). It is accurate enough to
  keep headlines inside their frames, but it is an estimate, not a shaped run.
- **Negative-space detection is coarse.** The curator analyses a 48px thumbnail
  as a 3×3 field of luminance and local variance. That reliably finds which
  third of a frame is quiet and roughly where the subject sits; it is not
  saliency detection and won't understand a subject it can't see at that size.
- **Generation takes a few seconds** (roughly 4–7s): one DeepSeek call, two
  stock searches, and a handful of thumbnail downloads. A design that fails its
  own critique badly costs a second DeepSeek call. Searches are cached, analysis
  is cached in-process, and the three-directions view runs its three designs in
  parallel.
- **Gradients** are supported on rectangles and circles, render identically on
  canvas and in the SVG export, and survive the document round-trip — but there
  is no gradient *editor* in the Properties panel. You can see the one Apollo
  used and clear it back to a flat fill; authoring a new one by hand is not
  wired up.
- The editor bundle is larger than ideal because
  `ElementRenderer` statically imports every element type — including the icon
  libraries — so `DesignPreview` (used on Home for recent-project thumbnails)
  pulls them into the eagerly-loaded bundle despite the editor route itself
  being lazy-loaded. Splitting the icon libraries out behind their own lazy
  boundary is a reasonable follow-up.
- **Project cards render the real document** rather than a stored thumbnail, so the
  list endpoint ships each project's canvas plus its first 80 elements.
- **Templates** are built-in documents in `client/src/design/templates.js`; they are
  not yet user-creatable.
- **Design** documents are embedded in the `Project` record for the MVP rather than
  a separate `Design` collection; the model boundary can be split out later.
- **A scribble is read, not understood.** With a Gemini key the vision pass
  names what was drawn and transcribes legible handwriting; without one — or
  when the model is busy or slow, both of which happen — the geometry pass
  still gives structure (how many marks, how big, where, which are lettering)
  but cannot know that the circle is a moon. The design is then art-directed
  from the prompt and the *shape* of the drawing, which is a real composition
  match and not a semantic one. Handwriting is deliberately never guessed at:
  an unreadable scrawl becomes "space reserved for a headline" and the
  copywriter fills it, rather than the model inventing words the user did not
  write.
- **Scribble versions are capped** at 40 per project, and a stored sketch is
  downscaled to 1024px on its long edge. Both are generous for a sketchpad and
  neither is configurable.
- The **web-app builder** (`type: "webapp"`) is intentionally not built yet; the
  document/operation architecture leaves room for it.
