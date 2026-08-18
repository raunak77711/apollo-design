import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Copy, Ellipsis, LayoutTemplate, Trash2, TriangleAlert } from 'lucide-react';
import { api } from '../api/client.js';
import { cx } from '../lib/cx.js';
import { relativeTime, shorten } from '../lib/format.js';
import { useToast } from '../lib/toast.jsx';
import { useCreateDesign } from '../lib/useCreateDesign.js';
import { QUICK_PRESETS, presetLabel } from '../design/presets.js';
import { Button, EmptyState, IconButton, SectionRule } from '../ui/primitives.jsx';
import { MenuItem, Modal, Popover } from '../ui/overlay.jsx';
import { FormatFrame } from '../ui/frame.jsx';
import AppHeader from '../components/AppHeader.jsx';
import AskApolloLauncher from '../components/AskApolloLauncher.jsx';
import DesignPreview from '../components/DesignPreview.jsx';
import Hero from '../components/home/Hero.jsx';

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
      {/* The header floats on the sky rather than sitting above it, so the hero
          starts at the top of the document and the moon is not cropped by a
          bar. Everything below the hero is the ordinary page again. */}
      <AppHeader overlay />

      <div className="-mt-14">
        <Hero onCreate={create} creating={creating} />
      </div>

      <main className="mx-auto w-full max-w-[1180px] px-5 pb-28 sm:px-8">
        {/* Formats */}
        <section>
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
