import { X } from 'lucide-react';
import { Modal } from '../../ui/overlay.jsx';
import { IconButton, Kbd } from '../../ui/primitives.jsx';

const GROUPS = [
  {
    title: 'Tools',
    items: [
      ['Select', 'V'],
      ['Hand', 'H'],
      ['Text', 'T'],
      ['Rectangle', 'R'],
      ['Ellipse', 'O'],
      ['Polygon', 'P'],
      ['Star', 'S'],
      ['Line', 'L'],
      ['Button', 'B'],
      ['Icon', 'I'],
      ['Images', 'M'],
      ['More in a slot', 'Hold or right-click'],
    ],
  },
  {
    title: 'Edit',
    items: [
      ['Undo', '⌘ Z'],
      ['Redo', '⇧ ⌘ Z'],
      ['Duplicate', '⌘ D'],
      ['Delete', '⌫'],
      ['Select all', '⌘ A'],
      ['Save now', '⌘ S'],
      ['Nudge', '← ↑ → ↓'],
      ['Nudge by 10', '⇧ + arrows'],
    ],
  },
  {
    title: 'Layers',
    items: [
      ['Group', '⌘ G'],
      ['Ungroup', '⇧ ⌘ G'],
      ['Bring forward', ']'],
      ['Send backward', '['],
      ['Bring to front', '⌘ ]'],
      ['Send to back', '⌘ ['],
      ['Rename layer', 'F2'],
      ['Hide / show', '⇧ ⌘ H'],
      ['Lock / unlock', '⇧ ⌘ L'],
      ['Enter group', 'Double-click'],
    ],
  },
  {
    title: 'Canvas',
    items: [
      ['Zoom', '⌘ + scroll'],
      ['Pan', 'Space + drag'],
      ['Fit to screen', '⇧ 1'],
      ['Actual size', '⌘ 0'],
      ['Multi-select', '⇧ + click'],
      ['Ignore snapping', 'Alt + drag'],
      ['Layer menu', 'Right-click'],
      ['Pick a colour', 'C'],
    ],
  },
  {
    title: 'Apollo',
    items: [
      ['Command palette', '⌘ K'],
      ['Ask Apollo', '⌘ J'],
      ['Shortcuts', '?'],
      ['Clear selection', 'Esc'],
    ],
  },
];

export default function ShortcutsDialog({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} className="max-w-2xl" labelledBy="shortcuts-title">
      <header className="flex items-center justify-between border-b border-line px-5 py-3.5">
        <h2 id="shortcuts-title" className="font-display text-[15px] font-semibold">
          Keyboard shortcuts
        </h2>
        <IconButton onClick={onClose} aria-label="Close">
          <X size={15} />
        </IconButton>
      </header>

      <div className="thin-scroll grid gap-x-8 gap-y-6 overflow-y-auto px-5 py-5 sm:grid-cols-2">
        {GROUPS.map((group) => (
          <section key={group.title}>
            <p className="label mb-2.5">{group.title}</p>
            <dl className="space-y-1.5">
              {group.items.map(([label, keys]) => (
                <div key={label} className="flex items-center justify-between gap-4">
                  <dt className="text-[13px] text-ink-2">{label}</dt>
                  <dd>
                    <Kbd>{keys}</Kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  );
}
