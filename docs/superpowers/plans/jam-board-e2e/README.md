# Jam board — browser acceptance scripts

Four Playwright scripts that drive the real board in real Chrome. They are the executable form of the
verification checklists in `../2026-09-29-jam-board.md`: run them after Tasks 16–21 (scripts 01–02), after
Task 24 (script 03) and at the end (04).

They are **not** part of the product and add nothing to `package.json`. Install the one dependency next to
the scripts (the folder's `node_modules` is already git-ignored):

```bash
cd docs/superpowers/plans/jam-board-e2e
npm init -y
npm i playwright-core
```

Chrome must be installed (the scripts launch it with Playwright's `channel: 'chrome'`; set `PW_CHANNEL=msedge`
to use Edge instead). The dev server must be running:

```bash
npm run dev                    # from the repo root; the client is on http://localhost:5180
```

Point the scripts at it if it is somewhere else with `BASE_URL`:

```bash
BASE_URL=http://127.0.0.1:5180 node 01-render-and-tools.mjs
```

| Script | Needs | Checks |
|---|---|---|
| `01-render-and-tools.mjs` | dev server, **no API key** | the example board renders 12 sections and fits the window; wheel and Ctrl+wheel; dragging a piece with its connector following; pen, highlighter, rectangle, circle, arrow, text, sticky, eraser; shortcut letters type into text; delete/undo/redo; everything survives a reload |
| `02-panel-images-chrome.mjs` | dev server, **no API key** | property panel (text, tone swatches, defaults, restyling a deck piece); image upload, 2400px → 1600px downscale, drop onto a browser frame, GIF refusal; help dialog; section rail; Save / Clear / Load; Reset layout; recording mode |
| `03-generate-and-direct.mjs` | the **scripted model** (below) | generation with live progress; Direct mode (restyle, relative placement, circle, live connection, hallucinated ids ignored, insert, rename, one-step undo); rebuilding a section keeps later annotations attached |
| `04-perf.mjs` | dev server | a 20-section board: render, drag-step, dispatch and scroll timings |

## The scripted model

Script 03 needs generation and Direct mode to answer without a DeepSeek key. `fake-server.mjs` mounts the
**real** board router (`server/src/routes/board.js`) behind a scripted stand-in for the model, so the whole
client ↔ server path — SSE progress, validation, id checking — is exercised for real:

```bash
node fake-server.mjs                                              # listens on :5111
VITE_BACKEND_URL=http://127.0.0.1:5111 npm run dev --prefix client
node 03-generate-and-direct.mjs
```

(`server/` dependencies must be installed: `npm run install:all`.) Use a different port with `FAKE_PORT`, and
match it in `VITE_BACKEND_URL`. If something already answers on `:5010`, that is the real Apollo server —
leave it alone and use the scripted one on `:5111`.

## What "pass" means

Each script prints `PASS`/`FAIL` per check, lists any browser console **errors**, and exits non-zero on any
failure or any console error. Screenshots go to `$TMPDIR/jam-board-shots` for a visual look. A failure is a bug
in the implementation, not in the script — the assertions are the behaviour the spec asks for.

The board exposes `window.__boardEditor` in development builds only (`import.meta.env.DEV`); the scripts use it
to read state and to reach objects by id.

## 05 - Content Factory

`05-content-factory.mjs` uploads a recording, links a Jam board, processes it (real Whisper) and checks the board tally, timestamp seeking and transcript. It needs the Docker backend, the host worker (`npm run whisper:worker --prefix server`), the Vite dev server (it seeds a board through the app's own modules) and `server/whisper/samples/sample_short.mp4`:

```
BASE_URL=http://127.0.0.1:5299 node 05-content-factory.mjs
```
