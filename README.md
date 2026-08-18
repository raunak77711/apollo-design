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

## How a design gets made

Generation is not one prompt to one model. It is a pipeline where each stage
does the thing it is actually good at:

```
prompt
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

## Stack

| Layer     | Tech |
|-----------|------|
| Frontend  | React, Vite, Tailwind, React Context + `useReducer`, Lucide React + react-icons |
| Backend   | Node, Express, Mongoose (MongoDB), `compression` (gzip) |
| AI        | DeepSeek (behind an `AIProvider` abstraction) |
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
│       │                   # generation/ (moonScene.js — the WebGL moon)
│       ├── raster/         # pixel tools: liquify.js, retouch.js, draw.js,
│       │                   # rasterShapes.js, imageIO.js, useBrushStroke.js
│       └── pages/          # Home, Templates, Assets, EditorPage
├── docker-compose.yml      # production build (nginx)
├── docker-compose.dev.yml  # hot-reload dev stack (vite + nodemon, bind mounts)
└── server/                 # Express API
    └── src/
        ├── design/         # canonical schema.js + operations.js, plus the
        │                   # design engine: artDirection.js (styles, palettes,
        │                   # pairings, formats), layout.js (grid + 10 layout
        │                   # archetypes), typography.js (metrics, fitting,
        │                   # scale), critique.js (review + repair), color.js
        │                   # (contrast, scrims, harmony), industries.js
        ├── services/
        │   ├── ai/         # AIProvider → DeepSeekProvider | MockProvider
        │   ├── images/     # Pexels + Unsplash together, + curator.js (scores
        │   │               # candidates on composition, tone, negative space)
        │   ├── designService.js  # plan → source → compose → critique → revise
        │   ├── aiService.js, exportService.js, storageService.js
        ├── models/         # Project, Asset, ImageSearchCache (Mongoose) — no user/auth
        ├── store/          # repository w/ in-memory fallback
        └── routes/         # projects, ai, images, assets, export (+ /export/flatten)
```

## API

```
GET    /api/health
GET    /api/projects            # list + a capped `preview` document for live cards
POST   /api/projects            # { name, canvas } or { name, document } (templates)
GET    /api/projects/:id        PUT  /api/projects/:id     DELETE /api/projects/:id
POST   /api/ai/chat             # { message, document, selectedElementId } → { operations, message }
                                # routes itself: a design request takes the full
                                # pipeline, an edit goes straight to operations
POST   /api/ai/generate         # always takes the art-direction pipeline
POST   /api/ai/variations       # → three complete directions (bold / minimal / editorial),
                                # each a different composition, not a recolour
GET    /api/images/search?q=    # searches every configured library, interleaved
GET    /api/assets              POST /api/assets/upload    # multipart (file, projectId)
POST   /api/export              # { projectId, document, format }
POST   /api/export/flatten      # { document } → { dataUrl }  — layer merge/flatten
```

## Security notes

- The DeepSeek key never leaves the backend; all AI calls are server-side.
- AI output is untrusted: every operation is re-validated by the operation system
  before it touches a document, icon names are whitelisted, and no raw HTML/SVG/JS
  is ever executed.
- Uploads are re-encoded by Sharp with generated filenames; storage paths are
  confined under `server/storage/` (traversal is blocked).

## Known MVP limitations (honest status)

- **No auth by design** — this is a local single-user app; all projects are shared
  on the one machine it runs on.
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
- The **web-app builder** (`type: "webapp"`) is intentionally not built yet; the
  document/operation architecture leaves room for it.
