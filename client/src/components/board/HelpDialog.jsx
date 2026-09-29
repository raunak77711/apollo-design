import { X } from 'lucide-react';
import { IconButton, Kbd } from '../../ui/primitives.jsx';
import { Modal } from '../../ui/overlay.jsx';

const TOOLS = [
  ['V', 'Select'], ['H', 'Hand (or hold Space)'], ['P', 'Pen'], ['M', 'Highlighter'], ['E', 'Eraser'], ['A', 'Arrow'],
  ['L', 'Line'], ['R', 'Rectangle'], ['C', 'Circle'], ['T', 'Text'], ['N', 'Sticky note'], ['I', 'Add image'],
];
const VIEW = [
  ['Wheel', 'Scroll the board'], ['Ctrl/⌘ + wheel', 'Zoom at the cursor (pinch works too)'], ['+  −', 'Zoom in / out'], ['0', 'Fit the board to the window'],
  ['[  ]', 'Previous / next section'], ['F', 'Focus the selected object'], ['Arrow keys', 'Nudge the selection, or scroll'],
];
const EDIT = [
  ['Ctrl/⌘ Z', 'Undo'], ['Ctrl/⌘ Shift Z', 'Redo'], ['Delete', 'Delete the selection'], ['Double-click a tool', 'Keep it selected'],
  ['Drop or paste', 'Add an image (onto a browser frame to fill it)'], ['Esc', 'Back to Select / leave recording mode'],
];

function Table({ title, rows }) {
  return (
    <section>
      <h3 className="label mb-2">{title}</h3>
      <dl className="space-y-1.5">
        {rows.map(([key, text]) => (
          <div key={key} className="flex items-baseline gap-3 text-[13px]">
            <dt className="w-32 shrink-0"><Kbd>{key}</Kbd></dt>
            <dd className="text-ink-2">{text}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default function HelpDialog({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} className="max-w-2xl" labelledBy="board-help-title">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 id="board-help-title" className="font-display text-lg">Controls</h2>
        <IconButton aria-label="Close" onClick={onClose}><X size={14} /></IconButton>
      </div>
      <div className="grid gap-6 overflow-y-auto p-5 sm:grid-cols-2">
        <Table title="Tools" rows={TOOLS} />
        <div className="space-y-6">
          <Table title="Moving around" rows={VIEW} />
          <Table title="Editing" rows={EDIT} />
        </div>
      </div>
      <div className="border-t border-line px-5 py-3 text-xs leading-relaxed text-ink-3">
        Everything you draw or move saves itself in this browser. <b className="text-ink-2">Save</b> writes the board to a file;{' '}
        <b className="text-ink-2">Load</b> restores from one. <b className="text-ink-2">Clear</b> removes only what you added — the board
        itself is never touched. The eraser removes whole marks; delete a piece of the board with Select + Delete (undoable).
      </div>
    </Modal>
  );
}
