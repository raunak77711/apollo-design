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

Two further workspaces share the same philosophy — a model decides structure
and intent, deterministic code decides geometry and pixels — applied to a
different medium: **Jam board** (`/board`) turns a written brief into a
scrollable canvas to record a video essay over, and **Content Factory**
(`/content`) turns that kind of recording into reviewed, rendered short-form
video with retakes cut, captions burned in, and the Jam board's own diagrams
appearing on screen at the right moment. See [Jam board](#jam-board) and
[Content Factory](#content-factory).

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

## Jam board

A different way to use Apollo: a big, quiet, scrollable board for **recording a video essay**. `/board`.

Paste the story of your video — chapters, flows like `GOOGLE ↓ WEBSITE ↓ LEAD`, the lines you will say on screen, how it should build — and Apollo turns it into a board: titles, flows, dependency graphs, cards, comparisons, timelines, icon diagrams and screenshot frames, laid out on a white canvas that scrolls smoothly and never runs out. Then you record yourself talking over it: scroll, zoom, draw, circle the leak, add a note, drop in a screenshot, move a piece if the composition is wrong. It is also the visual source for **Content Factory** below — the same board spec drives what appears behind you in a rendered short.

```
brief → outline → one call per section (four at a time) → validate → repair → board spec
board spec → layout (measured, centred, deterministic) → Fabric canvas
```

As in the design pipeline, **the model never chooses coordinates.** DeepSeek returns *structure* — which blocks a section needs and what they say — from a fixed vocabulary of **23 block types** (`client/.../state/schema.js`, mirrored byte-for-byte on the server — `server/test/board.parity.test.js` fails if they drift):

- **Text/claim:** `title`, `statement` (loud / quiet / `inverse` — a black band for the one punchline of a section), `bigtype`, `quote`, `code`
- **Process:** `flow` (auto-folds into a serpentine past 7 steps), `hub`, `timeline`, `funnel`, `track` (a road with toll-booth stops), `loop` (a closed cycle)
- **Comparison/structure:** `compare`, `panels`, `matrix`, `cards`, `list`, `zones` (what's inside a frame vs. what's outside it), `eliminate` (options crossed out one at a time)
- **Numeric/concept:** `equation` (chips joined by `×`/`+`/`−`/`÷`), `meter` (labelled bars — a motivation "battery", a decay curve), `bucket` (a leaking funnel with labelled holes), `moment` (introduces a person/moment with an icon and fact chips)
- **Media:** `browser` (a screenshot frame)

Any block can carry **icons** — a curated set of ~110 Lucide glyphs (`ICONS` in `schema.js`) the model is told to choose from by name; an unrecognised name is dropped rather than guessed at. `client/.../engine/blocks/layoutBoard.js` places every block centred on the board's midline with text inside a ~700-unit column, so a centred 9:16 crop of a landscape recording still holds the story.

**One state, changed only by operations.** A board is `{ spec, overrides, annotations, connections, assets }`. Every change — a drag, a toolbar button, a colour swatch — is a validated operation applied by `applyOperation`; Fabric only *renders* that state. That is what makes undo exact, lets connectors follow the pieces they join, and is the seam Direct mode uses.

**It survives a bad section.** The outline and sections are separate calls. A section that fails validation is retried once with the errors fed back; one that still fails becomes a plain title-and-statement section marked *needs a second try*, and can be rebuilt on its own from the section rail. The rest of the board, and everything you drew, is untouched.

**Direct mode** (`/` or `Ctrl/⌘ K`) edits the board you have, in plain English — *"make the $5 click huge and put the browser diagram under it"*. The model is sent a compact outline (section, block and part ids with their labels — never image data) and answers with the same validated operations the toolbar uses. Anything that names an id the outline did not contain is dropped, relative placement ("under X") is resolved to numbers from the objects' real bounds at that moment, and the whole instruction is one undo step. It edits; it never regenerates.

**Boards live in your browser** (IndexedDB, with a localStorage fallback) and save themselves 800 ms after you stop. *Save* writes a board to a file and *Load* restores from one. *Clear* removes only what you added.

- **Runs without a key:** the example board (this project's "Your Website Is Losing You Sales" deck) opens with no `DEEPSEEK_API_KEY`; generating a new board needs one and says so.
- **Tools:** select, hand, pen, highlighter, eraser, arrow, line, rectangle, circle, text, sticky note, image (upload, drop or paste), undo/redo, zoom, reset. `?` lists every shortcut.
- **Recording mode** strips everything but the board, a slim toolbar, zoom, and a `4 / 12 — TITLE` pill.
- **Limits, honestly:** the eraser removes whole marks, not pixels; text inside a card or node is edited by rebuilding the section, not in place; there is no image crop; a board lives in one browser (use Save/Load to move it); the model chooses *which* diagram fits a chapter, and can pick differently than you would — rebuild the section with a note.

## Content Factory

A long-form talking-head recording in, a stack of reviewed, rendered, ready-to-post 9:16 shorts out. `/content`.

Record 20–40 minutes on a phone, stumbling and restarting sentences the way everyone actually does. Apollo transcribes it locally (no audio ever leaves the machine), finds every clip in it that stands alone as a short, cuts out the stutters and false starts in favour of the clean retake, decides what appears on screen and when, crops the horizontal footage to vertical without losing your hands, and renders a finished MP4 with burned-in captions — **a human reviews and approves every one before anything is exported.** Nothing in this feature posts anywhere; there is no publishing integration, deliberately.

The same split that governs the design pipeline and the Jam board governs this: **a model decides structure and intent; deterministic code decides geometry, timing and pixels.** DeepSeek is never asked for a timestamp, a crop rectangle, or an animation curve — only for *which* words to keep and *what* should appear while they're spoken, from a closed vocabulary. Every word a model's answer refers to is re-found in the real, Whisper-measured transcript before it is trusted; an event whose quoted phrase was never actually said is dropped, not rendered.

```
upload → faster-whisper (local, GPU) → word-level transcript ─┬→ board tally (which Jam
                                                                │   board block is said when)
                                                                └→ utterances → retake
                                                                   detection → DeepSeek
                                                                   finds shorts (spans +
                                                                   cuts, grounded in real
                                                                   words) → Director Track
                                                                   (DeepSeek or free rules)
                                                                   → review → render (Remotion)
```

### Pipeline, stage by stage

1. **Transcription** (`server/whisper/transcribe.py`, faster-whisper `large-v3-turbo`). Runs on the GPU if CUDA is available, CPU otherwise — both paths are exercised and neither crashes the app if Whisper isn't installed at all (`transcriptionService.status()` just reports it unavailable). Decoded in ~3-minute **re-prompted chunks**: faster-whisper's own punctuation decays into one long run-on sentence after a few minutes of continuous decoding, and sentence boundaries are what the rest of the pipeline cuts on, so each chunk restarts from the verbatim-style prompt. Transcripts are cached by the **SHA-256 of the video's bytes** (`transcriptCache.js`) — the same recording, even renamed, is never transcribed twice.
2. **Board tally** (`boardIndex.js`, `boardTally.js`) — purely deterministic, no model call. Every spoken word is matched against every word on the linked Jam board (tf-idf weighted both ways, so a word used once on the board scores higher than one on every card), producing, for each board block, the stretches of the recording where it was actually being talked about. This is what lets a rendered short show the *right* board diagram at the *right* moment.
3. **Utterances & retake detection** (`analysis/utterances.js`, `retakeSignals.js`) — also free and deterministic. The transcript is re-cut into sentence-sized units (breaking at punctuation, pauses, *and* mid-run-on at restart phrases or an immediately repeated clause, since Whisper doesn't always punctuate a stumble). Each utterance is flagged: `restart_marker` ("let me say that again"), `abandoned` (trails into "sorry"), `repeated_opening` (a later utterance starts the same way — the earlier one is the false start), `filler_burst`, `long_pause`. A restart marker or a false start whose clean retake survives review is **force-cut regardless of what any model decides** — this is enforced in code, not suggested in a prompt.
4. **Finding the shorts** (`analysis/analyze.js`, `prompts.js`) — DeepSeek, windowed for long recordings (overlapping ~2,200-word windows run in parallel, answers cached by exact prompt hash so re-analysing unchanged input costs nothing). It receives the flagged, numbered utterances and the board tally, and answers with a **span of utterances plus the cuts inside that span** — never raw timestamps. Every answer is validated: ids must exist, cuts must stay inside their span, scores must be real, a clip under 15s or over 120s is refused, and the true word times are looked up to place each cut in the middle of the silence between two words so neither take is clipped. Proposals that don't clear a quality bar (hook/clarity/value/relevance ≥ 6) are dropped; two shorts that turn out to be the same idea said twice keep only the stronger.
5. **The Director Track** (`content/director/`) — one validated, grounded edit-decision-list per short, in a closed vocabulary (`emphasis`, `number`, `statement`, `camera`, `board`, `comparison`, `annotation`). This is the feature's second AI/deterministic boundary and has its own toggle (below). A quoted emphasis phrase, a spoken figure, or an annotation target is re-found in the real transcript and re-timed to it; a camera punch is always paired with a return; only one board visual is ever on screen at once; the whole track is capped so a 40-second short carries a handful of beats, not a slideshow.
6. **Review** (`ReviewDrawer.jsx`) — every short plays in the browser through the *exact* Remotion composition the final render uses (same props, same code — what you see is what renders), with every Director Track event listed and individually toggleable, trim controls (snapped to word boundaries), and an approve/reject/rename flow. **Nothing renders or is considered "done" without this step.**
7. **Render** (`render/worker.mjs`, a host-side queue) — FFmpeg fast-cuts the kept stretches out of the (often multi-gigabyte, phone-codec, possibly upside-down) source into one small clip, Remotion draws every frame in headless Chrome, and the result is muxed to a faststart MP4 with a matching `.srt`. Renders are content-addressed by a hash of the clip's source, its edit, its captions and the engine's own version, so an unchanged short already rendered is served instead of re-rendered.

### Two AI/deterministic toggles, not one

- **Finding shorts and cutting retakes** is always: deterministic detection → DeepSeek proposes spans → deterministic validation enforces the retake rules regardless of the model's answer. There is no "off" switch here because the detection and enforcement are already free and always-on; DeepSeek only decides *which* clean stretches are worth publishing.
- **The AI director** (`EditingSettings.jsx`, a visible switch per recording) is the one genuinely optional AI step. **On:** DeepSeek decides what appears when — board visuals, emphasis, numbers, camera moves — for every short. **Off:** a free, instant rule-based director (`director/baseline.js`) does the same job from the board tally and plain heuristics (a spoken figure becomes a number callout, the board diagram with the densest cluster of spoken parts gets shown while it's being explained, distinctive board-matching words get emphasis). Either way the result passes through the same validator, so a short directed by the free rules looks like a worse first draft, not a broken one — and flipping the toggle on an existing short offers to re-direct it without ever overwriting an edit you made by hand.
- **Handing an edit to another AI.** Every short has an "Edit with Claude / ChatGPT" button: it copies a self-contained prompt (the vocabulary, the real transcript in clip time, the board blocks the creator's words matched, the current edit) for you to run through whatever model you like, and a box to paste the JSON answer back into — which goes through the identical grounding/validation pass as DeepSeek's own answer. The feature doesn't care which model proposed an edit; it only trusts what survives validation.

### Framing a horizontal phone video for 9:16

`server/whisper/framing.py` finds the speaker's head using **YuNet**, a ~230KB local face detector bundled with OpenCV — no API call, no cost. It checks three frames in the first few seconds (to anchor the crop) and then one frame every ten minutes (a person on a tripod barely moves; if they do, the next sample catches it), so a 40-minute recording costs six cheap CPU detections, not 40 minutes of video analysis.

The crop itself (`client/src/video/framing.js`) is deliberately **not** a tight face-follow: the default window is a 4:3 slice — three quarters of the source frame's width — leaned toward the face but biased back toward the middle of the frame, because a talking-head short needs the speaker's **hand movement** in shot as much as their face. A person can choose a tighter window (1:1, 4:5) or a wider one (3:2, 16:9 = the whole frame, uncropped) per recording. When a board visual comes on screen, the speaker steps down to the full uncropped frame automatically, regardless of the chosen window, since gesture matters less than the diagram at that moment.

### Output format

One render works everywhere: 1080×1920, H.264 High profile, yuv420p, 30fps, AAC 192kbps 48kHz stereo, faststart MP4 (`content/platforms.js`, mirrored byte-for-byte to `client/src/video/platforms.js`, parity-tested). Captions, emphasis text and board visuals are laid out inside the **strictest** of TikTok's / YouTube Shorts' / Instagram Reels' own safe zones (clear of each app's caption bar, account name and action rail), so the one file is never covered by a platform's own UI; a per-platform preview overlay in the review drawer shows exactly which margins that is.

### Two host-side worker processes

Transcription (GPU-bound) and rendering (Chrome + FFmpeg-bound) cannot run inside the Docker backend, so two small long-lived processes run on the host and the Dockerised backend talks to them over HTTP (`host.docker.internal`):

```
npm run workers --prefix server      # starts + auto-restarts both, one terminal
                                      # or double-click start-workers.bat
```

which is `npm run whisper:worker` (transcription, head-finding, the browser-playable preview copy of the source video) and `npm run render:worker` (the Remotion/FFmpeg render queue) together. Either one being down is reported as a plain sentence in the UI with the exact command to fix it — never a raw connection error.

### Why a local, non-cloud Whisper

Near-zero marginal cost was a hard requirement: `large-v3-turbo` decodes at roughly 35–40× real-time on a consumer GPU (a 40-minute recording transcribes in about a minute), and DeepSeek is sent **compact text only** — numbered utterances and a board outline, never audio or video — so a 40-minute recording's entire shorts-finding + directing pass costs a few cents, not a few dollars.

### Known Content Factory limitations

- **Platform publishing is out of scope on purpose.** The output is a downloadable MP4 + `.srt`; there is no TikTok/YouTube/Instagram API integration, and none is planned as part of this feature — review and export only.
- **Word-level matching, not semantic.** The board tally and the Director Track's grounding match on stemmed words, so a board that says "AC" won't match a speaker saying "air conditioner." A stronger match would need an embedding step this MVP doesn't have.
- **Face detection is a point sample, not tracking.** Six checks across a 40-minute video assume a mostly-static camera (a tripod or a propped phone); someone who moves around the room between samples will get a crop based on the nearest sample, not continuous tracking.
- **The synthetic test recording** (`server/scripts/make-test-recording.js`) proves the retake-cutting logic against *known*, deliberately planted mistakes using Windows text-to-speech — it is not a substitute for testing against your own voice and accent, which the real-recording run in this repo's history did once, manually.
- **Render time is real-time-ish**, not instant: a ~40-second short takes roughly 2–3 minutes end-to-end (clip cut + Chrome frame render + encode) on the reference machine (RTX 4060).
- **One render at a time.** The render queue is intentionally serial — a render uses the whole machine (Chrome + FFmpeg) — so "render all approved" works through a batch one at a time rather than in parallel.
- **No background-removal or multi-speaker handling.** The engine assumes one speaker, one camera, one take at a time; it doesn't composite, key, or switch between multiple source angles.

## Stack

| Layer     | Tech |
|-----------|------|
| Frontend  | React, Vite, Tailwind, React Context + `useReducer`, Lucide React + react-icons |
| Backend   | Node, Express, Mongoose (MongoDB), `compression` (gzip) |
| AI        | DeepSeek (behind an `AIProvider` abstraction) — design briefs, edits, Apollo AI's streamed conversation, Jam board generation, Content Factory's shorts-finding and Director Track |
| Images    | Pexels / Unsplash (behind an `ImageProvider` abstraction), Mongo-cached searches |
| Media     | Sharp (uploads, export, image adjustments, layer merge/flatten), Fabric.js (Jam board canvas) |
| Canvas board| Jam board: a scrollable Fabric.js canvas, structured board spec, deterministic layout engine |
| Video     | Content Factory: faster-whisper (local transcription, GPU/CPU), OpenCV/YuNet (face finding), FFmpeg (audio/clip extraction, encoding), Remotion (frame-accurate React video rendering) |
| Storage   | Local filesystem (`server/storage/`) |
| Dev       | Docker Compose — a production build (nginx) and a hot-reload dev stack; two host-side worker processes for Whisper + rendering (GPU/Chrome/FFmpeg can't run inside the backend container) |

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

**Content Factory is the one feature that is not keyless-friendly in the same way.**
Transcription, face-finding and rendering are local and free (no key needed at
all), but they need a one-time Python environment setup (`server/whisper/setup.ps1`,
a `uv`-managed venv with faster-whisper + OpenCV) and two host processes running
(`npm run workers --prefix server`) — they genuinely cannot run keyless-in-the-browser
the way the rest of the app does, because they need the GPU and a real Chrome.
Finding shorts and directing their edit does use DeepSeek and needs
`DEEPSEEK_API_KEY`; without one, transcription and the board tally still work
and the UI says plainly that shorts-finding needs a key, same pattern as
everywhere else in Apollo.

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

11. **Jam board** (`/board`) is a third way in: paste the story of a video essay and
    Apollo scrolls out a board of titles, flows, diagrams and icon blocks to record
    yourself talking over — see [Jam board](#jam-board).
12. **Content Factory** (`/content`) turns a recorded talking-head video into
    reviewed, rendered 9:16 shorts — see [Content Factory](#content-factory). It
    needs the two host worker processes running (`npm run workers --prefix server`,
    or double-click `start-workers.bat`): they do the GPU transcription and the
    Chrome/FFmpeg rendering that can't run inside the Docker backend.

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
│       │                   # conversation rail, useApolloAI),
│       │                   # board/ (Jam board: canvas, toolbar, property panel,
│       │                   #   recording mode, Direct mode; engine/ — the pure
│       │                   #   layoutBoard.js + one layout file per block family,
│       │                   #   state/ — schema.js + operations.js MIRROR, boardStore),
│       │                   # content/ (Content Factory UI: upload, board link,
│       │                   #   board tally, shorts panel, review drawer, editing
│       │                   #   settings, live short preview)
│       ├── video/          # Content Factory's render engine, shared by the live
│       │                   # preview (Remotion Player, in-browser) and the final
│       │                   # render (same code, in headless Chrome): Short.jsx
│       │                   # (the composition), timeline.js (pure event→picture
│       │                   # math), framing.js (crop geometry), captions.js,
│       │                   # boardScene.js (reveals a Jam board block part-by-part
│       │                   # as it's spoken), theme.js, platforms.js (MIRROR of
│       │                   # server), components/ (Speaker, BoardCard, Overlays)
│       ├── raster/         # pixel tools: liquify.js, retouch.js, draw.js,
│       │                   # rasterShapes.js, imageIO.js, useBrushStroke.js
│       └── pages/          # Home, Templates, Assets, EditorPage, ScribblePage,
│                           # ApolloAI, BoardsPage/BoardPage, ContentPage
├── render/                 # Remotion render worker (host process: needs Chrome +
│                           # FFmpeg) — entry.jsx (the Remotion root, importing the
│                           # client's video/ engine directly) + worker.mjs (an HTTP
│                           # job queue the backend talks to)
├── docker-compose.yml      # production build (nginx)
├── docker-compose.dev.yml  # hot-reload dev stack (vite + nodemon, bind mounts)
├── start-workers.bat       # double-click launcher for both host workers (Windows)
└── server/                 # Express API
    ├── whisper/            # Python (uv-managed venv): transcribe.py (faster-whisper,
    │                       # chunked + re-prompted for long recordings), framing.py
    │                       # (YuNet face finding), proxy.py (browser-playable preview
    │                       # copy via FFmpeg), worker.py (the HTTP job server)
    └── src/
        ├── design/         # canonical schema.js + operations.js, plus the
        │                   # design engine: artDirection.js (styles, palettes,
        │                   # pairings, formats), layout.js (grid + 10 layout
        │                   # archetypes), typography.js (metrics, fitting,
        │                   # scale), critique.js (review + repair), color.js
        │                   # (contrast, scrims, harmony), industries.js,
        │                   # scribble.js (a drawing as a composition brief),
        │                   # board/ (Jam board: canonical schema.js + operations.js,
        │                   #   prompts.js — the outline/section/edit prompts)
        ├── services/
        │   ├── ai/         # AIProvider → DeepSeekProvider | MockProvider
        │   │               # (planDesign · generateOperations · converse · completeJSON)
        │   ├── images/     # Pexels + Unsplash together, + curator.js (scores
        │   │               # candidates on composition, tone, negative space)
        │   ├── designService.js  # plan → source → compose → critique → revise
        │   ├── boardService.js   # Jam board generation: outline → sections → repair
        │   ├── scribbleReader.js # ink geometry (Sharp) + vision (Gemini)
        │   ├── versionService.js # append-only snapshots per project
        │   ├── assistantService.js # Apollo AI: system prompt, history budget,
        │   │               # and the seams for context/tools
        │   ├── transcription/ # whisperRunner.js (spawns the Python worker or talks
        │   │               # to the host HTTP worker), transcriptCache.js (keyed by
        │   │               # video SHA-256), transcriptSchema.js
        │   ├── content/    # Content Factory: sessionStore.js (one JSON doc per
        │   │               #   session, atomic writes), uploadVideo.js (streamed),
        │   │               #   boardIndex.js/boardTally.js (deterministic word↔board
        │   │               #   matching), analysis/ (utterances.js, retakeSignals.js,
        │   │               #   prompts.js, analyze.js, candidate.js — finding +
        │   │               #   validating shorts), director/ (schema.js — the
        │   │               #   Director Track vocabulary + validator, baseline.js —
        │   │               #   the free rule-based director, llmDirector.js —
        │   │               #   DeepSeek's prompt, clipTimeline.js/clipBoard.js —
        │   │               #   source-time↔clip-time + board-tally mapping),
        │   │               #   candidates.js (review/trim/render-props), mediaClient.js
        │   │               #   + renderClient.js (talk to the two host workers),
        │   │               #   platforms.js (output format, MIRROR of client),
        │   │               #   settings.js (per-recording editing settings),
        │   │               #   contentService.js (orchestrates all of the above)
        │   ├── aiService.js, exportService.js, storageService.js
        ├── models/         # Project, Asset, ImageSearchCache (Mongoose) — no user/auth
        ├── store/          # repository w/ in-memory fallback
        └── routes/         # projects, ai, assistant, images, assets, export, board, content
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
GET    /api/board/status               # → { ready, model } — is a live model configured?
POST   /api/board/generate/stream      # { brief } → SSE: outline · section · result · failed
POST   /api/board/generate             # { brief } → { board } — the stream's fallback
POST   /api/board/section              # { brief, outline, index, note? } → { section }
POST   /api/board/edit                 # { message, outline, selection } → { operations, message }

GET    /api/content/status                      # transcription / render worker reachability, upload limit
GET    /api/content/sessions                    POST /api/content/sessions          # { title? }
GET    /api/content/sessions/:id                PATCH .../:id  { title }   DELETE .../:id
PUT    /api/content/sessions/:id/video?name=x.mp4  # the recording as the raw request body, streamed to disk
PUT    /api/content/sessions/:id/board          # { boardId, title, spec } — link a Jam board snapshot
POST   /api/content/sessions/:id/process        # { force? } transcribe (cached) + board-tally, in the background
POST   /api/content/sessions/:id/analyze        # { force? } find shorts + retakes (DeepSeek), in the background
PATCH  /api/content/sessions/:id/settings       # { aiDirector, framing, platform, captions, background }
POST   /api/content/sessions/:id/media          # find the speaker's head + build the preview copy (host worker)
PATCH  .../candidates/:cid                      # { status, title, note } — approve / reject / rename a short
POST   .../candidates/:cid/trim                 # { start, end } — move the edges, snapped to spoken words
PUT    .../candidates/:cid/director             # { events, source } — replace the edit (validated + grounded)
POST   .../candidates/:cid/director/regenerate  # { ai? } — direct again (DeepSeek or the free rules)
GET    .../candidates/:cid/props                # exactly what the live preview plays and the renderer renders
GET    .../candidates/:cid/package              # JSON hand-off for Claude/ChatGPT; /prompt is the same as plain text
POST   .../candidates/:cid/render               # queue a render; DELETE cancels
POST   /api/content/sessions/:id/render         # queue every approved short
GET    /api/content/sessions/:id/transcript     GET .../tally   GET .../analysis
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
- **Content Factory's video and audio never leave the machine for transcription,
  face-finding or rendering** — faster-whisper, OpenCV and Remotion/FFmpeg all run
  locally; only compact text (a numbered transcript, a board outline) goes to
  DeepSeek to find shorts and direct their edit, never audio or video. Uploaded
  recordings and every path the host workers touch are resolved and checked
  against the storage root the same way (`mediaClient.js`, `renderClient.js`).

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
