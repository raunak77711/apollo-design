import { useRef, useState } from 'react';
import { ArrowUp, ImagePlus, X } from 'lucide-react';
import { shorten } from '../../lib/format.js';
import { findPreset } from '../../design/presets.js';
import { Button, IconButton, Spinner, Tooltip } from '../../ui/primitives.jsx';
import FormatPicker from '../FormatPicker.jsx';
import PreferenceSheet from '../generation/PreferenceSheet.jsx';

/**
 * The prompt composer — where a design starts.
 *
 * Submitting does not begin a generation; it begins a conversation. Apollo asks
 * the two or three things it cannot infer from the brief, and only then draws.
 */

const IDEAS = [
  'Instagram post for a 50% weekend sale',
  'Dark, premium banner for a gym',
  'Dinner menu for an Italian restaurant',
  'YouTube thumbnail about focus habits',
];

const MAX_REFERENCES = 3;

export default function Composer({ onCreate, creating }) {
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
        reader.onload = () =>
          resolve({
            id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            name: file.name,
            dataUrl: reader.result,
          });
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    const loaded = await Promise.all(picked.map(read));
    setReferences((r) => [...r, ...loaded]);
  };

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
              <span
                key={ref.id}
                className="group relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-line"
              >
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
            <Button
              variant="primary"
              onClick={submit}
              disabled={!prompt.trim() || creating}
              aria-label="Generate design"
            >
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
