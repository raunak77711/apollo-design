import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowUp, Copy, Ellipsis, ImagePlus, LayoutTemplate, Trash2, TriangleAlert, X } from 'lucide-react';
import { api } from '../api/client.js';
import { cx } from '../lib/cx.js';
import { relativeTime, shorten } from '../lib/format.js';
import { useToast } from '../lib/toast.jsx';
import { useCreateDesign } from '../lib/useCreateDesign.js';
import { QUICK_PRESETS, findPreset, presetLabel } from '../design/presets.js';
import { Button, EmptyState, IconButton, SectionRule, Spinner, Tooltip } from '../ui/primitives.jsx';
import { MenuItem, Modal, Popover } from '../ui/overlay.jsx';
import { FormatFrame } from '../ui/frame.jsx';
import AppHeader from '../components/AppHeader.jsx';
import AskApolloLauncher from '../components/AskApolloLauncher.jsx';
import DesignPreview from '../components/DesignPreview.jsx';
import FormatPicker from '../components/FormatPicker.jsx';
import PreferenceSheet from '../components/generation/PreferenceSheet.jsx';

const IDEAS = [
  'Instagram post for a 50% weekend sale',
  'Dark, premium banner for a gym',
  'Dinner menu for an Italian restaurant',
  'YouTube thumbnail about focus habits',
];

export default function Home() {
  const navigate = useNavigate();
  const toast = useToast();
  const { create, creating } = useCreateDesign();
  const [projects, setProjects] = useState([]);
  const [status, setStatus] = useState('loading');
  const [pendingDelete, setPendingDelete] = useState(null);

  const load = async () => {
    try {
      setProjects(await api.listProjects());
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const duplicate = async (project) => {
    try {
      const full = await api.getProject(project.id);
      await api.createProject({ name: `${full.name} copy`, document: full.document });
      toast.success('Design duplicated');
      load();
    } catch (err) {
      toast.error('Could not duplicate that design', err.message);
    }
  };

  const remove = async () => {
    const target = pendingDelete;
    setPendingDelete(null);
    try {
      await api.deleteProject(target.id);
      setProjects((list) => list.filter((p) => p.id !== target.id));
      toast.success('Design deleted');
    } catch (err) {
      toast.error('Could not delete that design', err.message);
    }
  };

  return (
    <div className="min-h-screen">
      <AppHeader />

      <main className="mx-auto w-full max-w-[1180px] px-5 pb-28 sm:px-8">
        {/* Hero + prompt composer */}
        <section className="pt-14 text-center sm:pt-20">
          <h1 className="mx-auto max-w-[16ch] font-display text-[38px] font-semibold leading-[1.02] tracking-[-0.04em] sm:text-[54px]">
            Describe it.
            <br />
            Apollo draws it.
          </h1>
          <p className="mx-auto mt-4 max-w-[52ch] text-[15px] leading-relaxed text-ink-2">
            Every layer stays editable — type, images, shapes, colour. Nothing is baked into a picture.
          </p>

          <Composer creating={creating} onCreate={create} />
        </section>

        {/* Formats */}
        <section className="mt-16">
          <SectionRule
            action={
              <Link
                to="/templates"
                className="flex items-center gap-1.5 rounded text-xs text-ink-3 transition-colors hover:text-ink"
              >
                <LayoutTemplate size={13} /> Templates
              </Link>
            }
          >
            Or start blank
          </SectionRule>

          <div className="mt-4 flex flex-wrap gap-2">
            {QUICK_PRESETS.map((preset) => (
              <button
                key={preset.id}
                disabled={creating}
                onClick={() =>
                  create({
                    name: preset.name,
                    canvas: { width: preset.width, height: preset.height, background: '#0A0A0B' },
                  })
                }
                className="group flex w-[calc(50%-0.25rem)] items-center gap-3 rounded-lg border border-line bg-surface px-3 py-3 text-left transition-all duration-150 hover:border-line-strong hover:bg-raised disabled:opacity-50 sm:w-auto sm:min-w-[11rem] sm:flex-1"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center text-ink-3 transition-colors duration-150 group-hover:text-accent">
                  <FormatFrame width={preset.width} height={preset.height} box={30} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-ink">{preset.name}</span>
                  <span className="num block text-2xs text-ink-3">{presetLabel(preset)}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Recent work */}
        <section className="mt-14">
          <SectionRule
            action={
              projects.length > 0 && <span className="num text-2xs text-ink-3">{projects.length}</span>
            }
          >
            Your designs
          </SectionRule>

          {status === 'loading' && (
            <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="aspect-[4/3] rounded-lg border border-line bg-surface" />
                  <div className="mt-2.5 h-3 w-2/3 rounded bg-raised" />
                </div>
              ))}
            </div>
          )}

          {status === 'error' && (
            <div className="mt-6 flex items-start gap-3 rounded-lg border border-line bg-surface px-4 py-3.5">
              <TriangleAlert size={15} className="mt-0.5 shrink-0 text-danger" />
              <div>
                <p className="text-[13px] text-ink">Apollo can’t reach the server.</p>
                <p className="mt-0.5 text-xs text-ink-3">
                  Start the backend on port 5010, then{' '}
                  <button onClick={load} className="rounded underline underline-offset-2 hover:text-ink">
                    try again
                  </button>
                  .
                </p>
              </div>
            </div>
          )}

          {status === 'ready' && projects.length === 0 && (
            <div className="mt-6 rounded-xl border border-dashed border-line py-4">
              <EmptyState
                icon={LayoutTemplate}
                title="Nothing here yet"
                body="Describe a design above, or open a template and make it yours."
                action={
                  <Button variant="secondary" onClick={() => navigate('/templates')}>
                    Browse templates <ArrowRight size={13} />
                  </Button>
                }
              />
            </div>
          )}

          {status === 'ready' && projects.length > 0 && (
            <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4">
              {projects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onOpen={() => navigate(`/editor/${project.id}`)}
                  onDuplicate={() => duplicate(project)}
                  onDelete={() => setPendingDelete(project)}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      <Modal open={Boolean(pendingDelete)} onClose={() => setPendingDelete(null)} className="max-w-sm">
        <div className="px-5 py-5">
          <h2 className="font-display text-[15px] font-semibold">Delete this design?</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
            “{shorten(pendingDelete?.name, 48)}” will be removed for good. This can’t be undone.
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <Button variant="ghost" onClick={() => setPendingDelete(null)}>
            Keep it
          </Button>
          <Button variant="primary" className="!bg-danger !text-white" onClick={remove}>
            Delete design
          </Button>
        </div>
      </Modal>

      {/* Ask Apollo — the editor's assistant, offered from the homepage as a
          greeting rather than a banner. */}
      <AskApolloLauncher />
    </div>
  );
}

/* ------------------------------- Composer ------------------------------- */

const MAX_REFERENCES = 3;

function Composer({ onCreate, creating }) {
  const [prompt, setPrompt] = useState('');
  const [format, setFormat] = useState(() => findPreset('banner'));
  const [custom, setCustom] = useState(null);
  const [references, setReferences] = useState([]); // [{ id, name, dataUrl }]
  // The brief Apollo is asking preferences about — held separately from the
  // live input so editing behind the sheet cannot change what was submitted.
  const [asking, setAsking] = useState(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  const canvas = custom || format;

  const grow = (el) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  };

  const addFiles = async (files) => {
    const room = MAX_REFERENCES - references.length;
    if (room <= 0) return;
    const picked = Array.from(files)
      .filter((f) => f.type.startsWith('image/'))
      .slice(0, room);
    const read = (file) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: file.name, dataUrl: reader.result });
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    const loaded = await Promise.all(picked.map(read));
    setReferences((r) => [...r, ...loaded]);
  };

  /* Submitting no longer starts a generation — it starts a conversation.
     Apollo asks what it cannot infer from the brief, and only then draws. */
  const submit = () => {
    const text = prompt.trim();
    if (!text || creating) return;
    setAsking(text);
  };

  const start = (preferences) => {
    setAsking(null);
    onCreate({
      name: shorten(asking, 60),
      canvas: { width: canvas.width, height: canvas.height, background: '#0A0A0B' },
      prompt: asking,
      referenceImages: references.map((r) => r.dataUrl),
      preferences,
    });
  };

  return (
    <div className="mx-auto mt-8 w-full max-w-[46rem] text-left">
      <div
        className="rounded-xl border border-line bg-surface transition-colors duration-150 focus-within:border-line-strong"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
        }}
      >
        {references.length > 0 && (
          <div className="flex flex-wrap gap-2 px-3 pt-3">
            {references.map((ref) => (
              <span key={ref.id} className="group relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-line">
                <img src={ref.dataUrl} alt={ref.name} className="h-full w-full object-cover" />
                <button
                  onClick={() => setReferences((r) => r.filter((x) => x.id !== ref.id))}
                  aria-label={`Remove ${ref.name}`}
                  className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}

        <textarea
          ref={inputRef}
          value={prompt}
          rows={2}
          onChange={(e) => {
            setPrompt(e.target.value);
            grow(e.target);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="A dark, premium banner for Aryans Gym with the headline “Transform your body”…"
          className="thin-scroll w-full resize-none bg-transparent px-4 pt-3.5 text-[15px] leading-relaxed text-ink outline-none placeholder:text-ink-3"
        />

        <div className="flex items-center gap-2 px-2.5 pb-2.5">
          <FormatPicker
            value={canvas}
            onSelect={(preset) => {
              setCustom(null);
              setFormat(preset);
            }}
            onCustom={(size) => setCustom({ name: 'Custom', ...size })}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files?.length) addFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <Tooltip label="Attach a reference image" side="top">
            <IconButton
              size="lg"
              variant="secondary"
              aria-label="Attach a reference image"
              disabled={references.length >= MAX_REFERENCES}
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagePlus size={15} />
            </IconButton>
          </Tooltip>
          <div className="flex-1" />
          <Tooltip label="Generate" hint="⏎" side="top">
            <Button variant="primary" onClick={submit} disabled={!prompt.trim() || creating} aria-label="Generate design">
              {creating ? <Spinner /> : <ArrowUp size={15} />}
            </Button>
          </Tooltip>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
        <span className="label">Try</span>
        {IDEAS.map((idea) => (
          <button
            key={idea}
            onClick={() => {
              setPrompt(idea);
              inputRef.current?.focus();
              grow(inputRef.current);
            }}
            className="rounded text-[13px] text-ink-3 underline-offset-4 transition-colors duration-150 hover:text-ink hover:underline"
          >
            {idea}
          </button>
        ))}
      </div>

      <PreferenceSheet
        open={Boolean(asking)}
        prompt={asking || ''}
        onCancel={() => {
          setAsking(null);
          inputRef.current?.focus();
        }}
        onConfirm={start}
      />
    </div>
  );
}

/* ------------------------------ Project card ----------------------------- */

function ProjectCard({ project, onOpen, onDuplicate, onDelete }) {
  const canvas = project.preview?.canvas;
  const portrait = canvas ? canvas.height > canvas.width : false;

  return (
    <div className="group">
      <button
        onClick={onOpen}
        className="block w-full overflow-hidden rounded-lg border border-line bg-workspace transition-all duration-200 ease-out hover:border-line-strong"
      >
        <div className="flex aspect-[4/3] items-center justify-center p-4">
          {project.preview ? (
            <DesignPreview
              document={project.preview}
              className="shadow-art"
              style={portrait ? { height: '100%', width: 'auto' } : { width: '100%', height: 'auto' }}
            />
          ) : (
            <span className="label">Empty</span>
          )}
        </div>
      </button>

      <div className="mt-2.5 flex items-start gap-1">
        <button onClick={onOpen} className="min-w-0 flex-1 rounded text-left">
          <p className="truncate text-[13px] font-medium leading-snug text-ink">{project.name}</p>
          <p className="num mt-0.5 text-2xs text-ink-3">
            {relativeTime(project.updatedAt)}
            {canvas && ` · ${canvas.width}×${canvas.height}`}
          </p>
        </button>

        <Popover
          align="end"
          panelClassName="w-40"
          button={({ toggle, open }) => (
            <IconButton
              onClick={toggle}
              aria-label={`Actions for ${project.name}`}
              className={cx('opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100', open && 'opacity-100')}
            >
              <Ellipsis size={15} />
            </IconButton>
          )}
        >
          {({ close }) => (
            <>
              <MenuItem
                icon={Copy}
                onClick={() => {
                  onDuplicate();
                  close();
                }}
              >
                Duplicate
              </MenuItem>
              <MenuItem
                icon={Trash2}
                danger
                onClick={() => {
                  onDelete();
                  close();
                }}
              >
                Delete
              </MenuItem>
            </>
          )}
        </Popover>
      </div>
    </div>
  );
}
