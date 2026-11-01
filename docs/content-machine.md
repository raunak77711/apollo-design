# Content Machine

Open **Content Machine** immediately before **Distribution** in the navbar, or visit `/content-machine`.

## Fresh extraction, duplicate spoken hooks and TikTok framing

**Extract fresh videos** selects unused combinations, spreads distinct hooks before repeating them within a batch, prioritizes less-used sources across history, and alternates bodies when remaining combinations permit. It cannot create new spoken content from repeated source recordings. When there are only two bodies, a 25-video batch necessarily reuses bodies; the page explains this and shows actual distinct-hook/body counts for each export.

Hooks are checked using decoded mono audio as well as file hashes. MOVs with different names or container metadata but identical decoded sound count as one spoken hook, even if their images differ. Silence is excluded from audio-based hook identity. The check also upgrades old imports and history so renaming or re-importing a duplicate does not reset availability. It detects identical decoded audio, not every lossy re-encode or paraphrase. A duplicate-hook warning reports imported file count versus actual distinct audio. Original files remain in the library.

**Re-render same videos** deliberately preserves old combinations; it is labeled separately from fresh extraction. **Preview AI edit** renders just the first video, with animations enabled, before you re-render an entire batch. Batch downloads display animations ON/OFF, visual-beat count, aspect ratio, frame fitting and face detection. ZIP filenames include the batch ID to avoid mixing identically numbered videos from different exports.

Portrait **Fill frame** exports square-pixel 1080×1920 video without added borders. **Fit whole clip** is available when you prefer borders to cropping. **Face-aware framing & placement** uses the same local YuNet/OpenCV worker as Content Factory, caches face samples per source, keeps the speaker inside the crop, and selects animation and auto-caption regions around detected face rectangles and TikTok UI safe zones. If detection is unavailable, export notes identify the fallback; the app does not claim a detected face. This samples faces like Content Factory rather than tracking every frame of moving footage.

The animation planner now uses Content Factory's shared DeepSeek director prompt and event validation on the full timed transcript. It supports animated comparisons, spoken-number graphics, key statements, keywords and underlines. The model plans the explanation; trusted HTML templates render it. Face placement, safe zones and timing stay under deterministic rules. **Auto · avoid face** chooses subtitle placement; upper/middle/lower remain manual choices.

## Saved library and branches

Every folder drop or file selection opens an **Accept file types** review before uploading. Select MOV only, MP4 only, both, audio types, or any combination of the detected supported formats. Video formats are selected by default when video is present, so companion MP3s are excluded; audio-only selections default to their audio formats. GIF previews are unsupported and skipped without an upload error. The preview lists the exact files and counts excluded by type or matching name. **Choose individual files** also supports selecting files without a folder.

**One clip per matching filename** defaults on: `8.mov`, `8.mp4` and `8.MP3` in the same folder count as one clip among the selected formats, preferring MP4, then MOV, then other video formats before audio. Matching names already in the current branch are skipped too; source paths persist with saved clips. Different subfolders are separate. Turn this option off to deliberately retain alternate formats. Identical file bytes are still deduplicated regardless of this setting. Filename matching is a companion-file convention, not visual similarity detection. Review the preview when equally named files contain different content.

Use **New branch** for a separate recording day or campaign. Name the branch, then drop files or folders into Hooks, Content and CTA. Imported clips and settings save automatically after a short pause; **Save branch** saves immediately. Switching branches also saves current work first. **Duplicate branch** starts a separate collection using the current clips and settings; later additions or removals affect only that branch. A new browser can reopen saved branches from the library without importing the clips again.

Each branch shows its own generated batches, which can be reopened or downloaded separately. Earlier batches created before the library are still shown as **Earlier batch**. Combination uniqueness remains shared across the library, so duplicating a branch does not make previously generated combinations available again.

The local backend stores branch records in `server/storage/combinator/library/<branch-id>.json`, source files in `server/storage/combinator/uploads`, and rendered batches in `server/storage/combinator/<batch-id>`. **Source ZIP** downloads the saved branch's original files in `hooks/`, `bodies/` and `ctas/` folders, plus `branch.json`. Save pending changes before downloading sources. Keep the whole `server/storage/combinator` directory to preserve branches, clips, outputs and no-repeat history. When using Docker these files live in the configured server storage volume; local disk means the machine running the backend.

Drop a folder into each of the Hooks, Content / Body and CTA zones. Nested folders are scanned recursively. Click a zone to use a folder picker instead. Supported extensions: MP4, MOV, M4V, WebM, MKV, AVI, MP3, WAV, M4A, AAC, OGG and FLAC. Unsupported files and identical file contents are skipped; unreadable media is reported. Remove individual clips, or edit **Use** to select the first N clips from a folder. There are no fixed counts: 50 hooks, 25 bodies and 7 CTAs work just as well as 5 of each. Imported groups and settings are restored in the same browser.

Five distinct clips in each zone provide 125 possible Hook × Body × CTA videos. At least one clip per zone is required. Choose 25, 50, 100 or any positive whole number as your **batch size**. A batch balances distinct hooks and alternates bodies while selecting unused combinations. Each finished video follows Hook → Body → CTA order. If fewer combinations remain than requested, the final batch contains the remainder. Availability is calculated against history without constructing the full Cartesian product in memory.

**Download batch ZIP** packages completed MP4s, SRTs (when enabled) and a manifest with clip names and combination keys. ZIP64 streaming supports archives larger than 4 GB without buffering all videos in RAM. Individual MP4 and SRT downloads are also available. Previous batches can be reopened from history; downloading an existing batch again does not generate new videos.

## Uniqueness across batches

The backend hashes each source file's bytes and fingerprints audible decoded hook audio. A combination is the ordered tuple of spoken-hook identity, body hash and CTA hash. Identical renamed or re-imported files, reordered folders and rendering-setting changes do not create fresh combinations. Duplicate sources within each role are counted once. Queued/running batches reserve their selections before the next request is admitted. Completed selections persist across server restarts. A failed or interrupted batch keeps completed selections and releases unfinished ones for future batches.

History is shared by this local Apollo instance and stored in the batch records. Keep `server/storage/combinator` to preserve the no-repeat guarantee. This recognizes identical file bytes and identical decoded hook audio, not all perceptually similar re-encodes. The local service runs in one backend process; multiple independent backend replicas sharing storage would require a shared transactional reservation service.

Choose portrait (1080×1920), landscape (1920×1080) or square (1080×1080). Each clip is normalized once per batch to H.264/AAC, 30 fps, with full-frame cropping by default; borders are optional. Original audio is preserved, silent videos receive silence, and audio-only files receive a black video background. Outputs are MP4 files available individually as they finish.

## Subtitles and CTA overlays

### Editing rules and optional HTML animations

Subtitle rules offer **Lower safe zone**, **Middle**, or **Upper safe zone**, three text sizes, and 3, 4 or 6 words per caption. Lower placement reserves the bottom 20% of the frame and shifts text left of the right-side social controls. These are fixed safe-zone rules, not automatic face detection; choose another position if your footage needs it.

**DeepSeek animations** is optional and off by default. Whisper supplies timed speech; Content Factory's shared director plans comparisons, spoken-number graphics, statements, keywords and underlines. Trusted React/HTML/CSS templates render into MP4 through the existing Remotion worker. No generated code is executed. Rules limit density to at most six callouts per source clip, one at a time, separated by pauses, with fade/slide entrances and exits. The local face detector supplies placement geometry; the language model sees speech text rather than video pixels. Silent/music-only clips without speech may have no animation. For spoken clips, an unusable director response gets a visible speech-grounded fallback rather than silently dropping all animation. Planning and finished source clips are cached across batches.

Animations require DeepSeek, Whisper and an updated host render worker (`node render/worker.mjs` or `npm run workers --prefix server`). The UI reports missing services. Rendering HTML video is slower than plain concatenation. For an existing completed batch, choose finishing settings and click **Improve this batch**: a new batch preserves exactly the completed combinations and video order, leaves original downloads intact, and does not consume new combinations. Download its ZIP when complete, or use the play button beside a result to preview it.

Verify the real HTML renderer with `node render/test-content-machine.mjs` while the worker is running. It checks actual encoded animation frames, fade timing, audio and duration. API tests cover refinement selection preservation and cached rendering; AI responses are mocked in those tests. Rendering uses the existing [Remotion HTML composition and video renderer](https://www.remotion.dev/docs/offthreadvideo).

Enable **Noise cancellation** under Subtitles & finishing to reduce steady background hiss and fan noise in all exported hook, body and CTA audio. This optional setting is saved in your browser and batch history, runs locally with FFmpeg, and leaves uploaded originals untouched. It reduces noise rather than guaranteeing removal of other voices or sudden sounds. Changing it does not reset combination history.

Enable **Burn in subtitles** to use Apollo's existing Whisper service for timed speech captions. Word timestamps are grouped into readable phrases. Captions are burned into the MP4 and supplied as SRT files. Optional **DeepSeek cleanup** corrects casing, punctuation and obvious transcription typos while preserving cue timing. Speech transcription and cleaned text are cached across batches. Transcript text is sent to DeepSeek only when cleanup is selected; media transcription uses the existing Whisper worker.

Enable **Show contact details**, then choose Email, Website or DM. Enter the destination/handle/keyword and an optional heading. For DM, the handle or keyword is optional: leave it blank for a simple SEND ME A DM overlay. **Write heading with DeepSeek** proposes an editable heading without changing the destination. The overlay appears only over each CTA clip. The **Fade in** option animates opacity from 0% to 100%, with a 0.1–5 second duration, shortened if needed to fit the CTA clip. The on-page preview is illustrative; the actual effect and captions are rendered into the exports.

## Server setup

FFmpeg and FFprobe must be available on the **backend server**, either on PATH or through `FFMPEG_PATH` and `FFPROBE_PATH`. Both Docker server images install them; rebuild an existing image after updating. Local development uses the locally installed executables. Uploads use the existing `CONTENT_MAX_UPLOAD_GB` per-file setting (20 GB by default).

DeepSeek requires `DEEPSEEK_API_KEY` and uses the existing `DEEPSEEK_BASE_URL` and `DEEPSEEK_MODEL` settings. Subtitles require an available Whisper environment (`server/whisper/setup.ps1`) or `WHISPER_WORKER_URL`. The UI reports connection status, and requests fail clearly when a requested service is unavailable. FFmpeg must include the ASS/libass filter for captions and CTA overlays (the Debian Docker package does).

Clips, cached caption text, batch records and outputs persist in `server/storage/combinator`. Batches run serially in the backend. If the server restarts during a batch, it reports the interruption and keeps completed downloads; generate the next batch to continue with unused combinations. Uploaded sources and outputs remain on disk and require storage management by the operator. Rendering time and storage grow with batch size.

## Verification

`node --test server/test/combinator.test.js server/test/combinator.routes.test.js server/test/combinator.batches.test.js client/test/combinator.test.js`

The media and API tests require FFmpeg and FFprobe. They exercise actual video encoding, subtitle visibility and CTA opacity through frame-pixel checks, ZIP streaming, concurrent 25/100 batch reservations, restart recovery, renamed inputs, arbitrary counts, caption cleanup/caching and recursive directory traversal. DeepSeek and Whisper integration tests use injected deterministic providers; tests do not make billable upstream calls.
