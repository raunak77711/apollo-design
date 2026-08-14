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

---

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
- **No `DEEPSEEK_API_KEY`?** A deterministic `MockProvider` plans real Apollo
  operations from your prompt, so the full pipeline works. Add a key to switch
  to real DeepSeek — nothing else changes.
- **No image API key?** A keyless `PlaceholderProvider` returns stock-style photos.

Add real keys to a root `.env` (Docker) or `server/.env` (local dev) — copy
`.env.example` — to activate the real providers. With DeepSeek connected it can
edit **everything** in the schema (shape, colour, blend modes, shadows, crop,
image adjustments, grouping — not just text/colour), and it's given a short
list of common industries (gym, restaurant, real estate, SaaS, healthcare,
finance, etc. — see `server/src/design/industries.js`) so a vague prompt like
"banner for my gym" gets a sensible starting palette and imagery. Every
provider result — real or mock — goes through the same operation validator, so
a bad or malformed AI response can't corrupt the document.

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
7. In the **Layers** panel: rename, lock, hide, reorder, group, and — new —
   **Merge down**, **Merge visible**, and **Flatten image** (right-click a
   layer, or the **···** menu), which rasterize the target layers into one new
   image layer via the same Sharp pipeline export uses. The **+** button adds
   an empty image, a frame, text, or a shape.
8. The icon picker (in Properties and in the Library panel) has two sets —
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
│       ├── components/     # editor/ (stage, rail, inspector, panels, PhotoEditor)
│       │                   # + elements/ (one renderer per type)
│       └── pages/          # Home, Templates, Assets, EditorPage
├── docker-compose.yml      # production build (nginx)
├── docker-compose.dev.yml  # hot-reload dev stack (vite + nodemon, bind mounts)
└── server/                 # Express API
    └── src/
        ├── design/         # canonical schema.js + operations.js + industries.js
        ├── services/
        │   ├── ai/         # AIProvider → DeepSeekProvider | MockProvider
        │   ├── images/     # ImageProvider → Pexels | Unsplash | Placeholder
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
GET    /api/images/search?q=
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
- **Liquify, Retouch (dodge/burn/heal), and a freehand Draw suite** (brush/pen/
  eraser/fill-bucket/drag-to-create shapes) were requested but are **not
  built**. Apollo edits a structured document, not a pixel buffer — those tools
  need a genuine raster-editing engine (pixel warping, brush stamping, a paint
  history) that's a substantial subsystem on its own. Rather than ship a
  half-working version, this is the clear next milestone.
- The editor bundle (~155KB gzipped) is larger than ideal because
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
