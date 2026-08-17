import { useState } from 'react';
import { Check } from 'lucide-react';
import { cx } from '../lib/cx.js';
import { PRESETS, presetLabel } from '../design/presets.js';
import { MenuItem, Popover } from '../ui/overlay.jsx';
import { IconButton } from '../ui/primitives.jsx';
import { FormatFrame } from '../ui/frame.jsx';
import { NumberField } from '../ui/fields.jsx';

/**
 * The canvas chooser that sits inside a prompt composer — every preset, plus a
 * custom size. Shared by Home's composer and the Ask Apollo assistant so the
 * format is picked the same way wherever a design starts.
 */
export default function FormatPicker({ value, onSelect, onCustom, side = 'bottom', className }) {
  const [draft, setDraft] = useState({ width: value.width, height: value.height });

  return (
    <Popover
      align="start"
      side={side}
      panelClassName="w-[19rem] p-2"
      className={className}
      button={({ toggle, open }) => (
        <button
          onClick={toggle}
          aria-expanded={open}
          className={cx(
            'flex h-8 items-center gap-2 rounded border px-2 text-[13px] transition-colors duration-150',
            open ? 'border-line-strong bg-raised text-ink' : 'border-line text-ink-2 hover:text-ink'
          )}
        >
          <span className="text-ink-3">
            <FormatFrame width={value.width} height={value.height} box={13} />
          </span>
          <span className="max-w-[9rem] truncate">{value.name}</span>
          <span className="num text-2xs text-ink-3">{presetLabel(value)}</span>
        </button>
      )}
    >
      {({ close }) => (
        <>
          <div className="thin-scroll max-h-[15rem] overflow-y-auto">
            {PRESETS.map((preset) => (
              <MenuItem
                key={preset.id}
                onClick={() => {
                  onSelect(preset);
                  close();
                }}
                hint={presetLabel(preset)}
              >
                {preset.name}
              </MenuItem>
            ))}
          </div>
          <div className="mt-1 flex items-center gap-1.5 border-t border-line px-1 pt-2">
            <NumberField
              label="W"
              value={draft.width}
              min={16}
              max={8000}
              onChange={(width) => setDraft((d) => ({ ...d, width }))}
              className="w-full"
            />
            <NumberField
              label="H"
              value={draft.height}
              min={16}
              max={8000}
              onChange={(height) => setDraft((d) => ({ ...d, height }))}
              className="w-full"
            />
            <IconButton
              size="lg"
              variant="secondary"
              aria-label="Use custom size"
              className="border border-line"
              onClick={() => {
                onCustom(draft);
                close();
              }}
            >
              <Check size={14} />
            </IconButton>
          </div>
        </>
      )}
    </Popover>
  );
}
