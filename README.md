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
| Frontend  | React, Vite, Tailwind, React Context + `useReducer`, Lucide React |
| Backend   | Node, Express, Mongoose (MongoDB) |
| AI        | DeepSeek (behind an `AIProvider` abstraction) |
| Images    | Pexels / Unsplash (behind an `ImageProvider` abstraction) |
| Media     | Sharp (uploads + export) |
| Storage   | Local filesystem (`server/storage/`) |

## Runs with zero API keys

To make the MVP demonstrable out of the box, three graceful fallbacks exist:

- **No MongoDB?** The server uses an in-memory store (data won't persist across restarts).
- **No `DEEPSEEK_API_KEY`?** A deterministic `MockProvider` plans real Apollo
  operations from your prompt, so the full pipeline works. Add a key to switch
  to real DeepSeek — nothing else changes.
- **No image API key?** A keyless `PlaceholderProvider` returns stock-style photos.

Add real keys in `server/.env` to activate the real providers.

---

This is a **local, single-user** app (a school project) — there is no login or
accounts. Run it one of two ways:

### Option A — Docker (recommended, one command)

```bash
# optional: add API keys for real DeepSeek / stock photos
cp .env.example .env    # then edit — totally optional

docker compose up --build     # or: npm run docker:up
```

- Frontend: http://localhost:5180
- Backend:  http://localhost:5010  (health: `/api/health`)
- MongoDB:  localhost:27020

Stop with `docker compose down` (add `-v` to also wipe the database).

### Option B — Local dev (Vite + nodemon)

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

### First milestone walkthrough

1. Open the app → **New design → Banner** (1200 × 628).
2. In the **Apollo AI** panel (bottom dock), send:
   > Create a promotional banner for Aryans Gym. Modern, dark, premium, red accents, a muscular athlete, headline "TRANSFORM YOUR BODY", and a "JOIN NOW" button.
3. Apollo renders a background, hero image, headline, subtitle, button, and icon —
   all as editable layers.
4. Select/move/resize/rotate elements, edit typography and colors in **Properties**,
   reorder in **Layers**, **Undo/Redo** (⌘/Ctrl+Z), then **Export** to PNG/JPG/WebP.
5. Ask follow-ups: *"make the headline bigger"*, *"change the button color to blue"*,
   *"move the image to the right"* — each is a minimal, undoable operation.

---

## Project layout

```
apollo-design/
├── client/                 # Vite + React editor
│   └── src/
│       ├── design/         # schema.js + operations.js (MIRROR of server) + icons.js
│       ├── state/          # EditorContext + reducer (document, selection, history)
│       ├── components/     # Canvas, panels, and per-type element renderers
│       └── pages/          # Dashboard, EditorPage
└── server/                 # Express API
    └── src/
        ├── design/         # canonical schema.js + operations.js
        ├── services/
        │   ├── ai/         # AIProvider → DeepSeekProvider | MockProvider
        │   ├── images/     # ImageProvider → Pexels | Unsplash | Placeholder
        │   ├── aiService.js, exportService.js, storageService.js
        ├── models/         # Project, Asset (Mongoose) — no user/auth
        ├── store/          # repository w/ in-memory fallback
        └── routes/         # projects, ai, images, assets, export
```

## API

```
GET    /api/health
GET    /api/projects            POST /api/projects
GET    /api/projects/:id        PUT  /api/projects/:id     DELETE /api/projects/:id
POST   /api/ai/chat             # { message, document, selectedElementId } → { operations, message }
GET    /api/images/search?q=
POST   /api/assets/upload       # multipart (file, projectId)
POST   /api/export              # { projectId, document, format }
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
- **Server-side export** rasterizes shapes, text, and images via SVG→Sharp, and
  applies image adjustments (brightness/contrast/saturation/hue/grayscale/blur) so
  exports match the on-canvas preview. Lucide **icons render as an outline
  placeholder in exports** (they render fully in the browser). Custom web fonts
  fall back to system fonts in the export renderer.
- **Mini photo editor (Adjust)** is implemented for image layers — presets
  (Auto/B&W/Pop), color/light sliders, blur, radius, opacity, and 90° rotate — all
  editing the design document (one undoable operation). **Pixel crop/flip are not
  yet included** (rotate is).
- **Groups** exist in the schema/operations but the canvas doesn't yet move a
  group's children together — grouping is structural only for now.
- **Design** documents are embedded in the `Project` record for the MVP rather than
  a separate `Design` collection; the model boundary can be split out later.
- The **web-app builder** (`type: "webapp"`) is intentionally not built yet; the
  document/operation architecture leaves room for it.
```
