import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { contentApi } from '../../api/content.js';
import { useToast } from '../../lib/toast.jsx';
import { Button } from '../../ui/primitives.jsx';
import { boardStore } from '../board/boardStore.js';
import { EXAMPLE_ID, createExampleRecord } from '../board/exampleBoard.js';

/**
 * Pick the Jam board this video follows.
 *
 * Boards live in this browser, so choosing one sends a snapshot of its content (sections, blocks and
 * their words - not geometry) to the session. That snapshot is what the tally and, later, the short
 * generator read. If the board is edited afterwards the page offers to re-sync.
 */
export default function BoardLink({ session, onLinked, disabled }) {
  const toast = useToast();
  const [boards, setBoards] = useState([]);
  const [busy, setBusy] = useState(false);
  const [local, setLocal] = useState(null); // the linked board's current record, to spot edits

  useEffect(() => {
    boardStore.list().then(setBoards);
  }, []);

  const linkedId = session.board?.boardId || '';

  const loadRecord = useCallback(async (id) => {
    if (id === EXAMPLE_ID) return (await boardStore.get(id)) || createExampleRecord();
    return boardStore.get(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!linkedId) {
      setLocal(null);
      return undefined;
    }
    loadRecord(linkedId).then((r) => !cancelled && setLocal(r));
    return () => {
      cancelled = true;
    };
  }, [linkedId, loadRecord]);

  const link = async (id) => {
    setBusy(true);
    try {
      const record = await loadRecord(id);
      if (!record?.spec) throw new Error("That board couldn't be opened.");
      const updated = await contentApi.linkBoard(session.id, { boardId: id, title: record.title || record.spec.title, spec: record.spec });
      onLinked(updated);
    } catch (err) {
      toast.error("Couldn't link the board", err.message);
    } finally {
      setBusy(false);
    }
  };

  const change = async (e) => {
    const id = e.target.value;
    if (!id) {
      setBusy(true);
      try {
        onLinked(await contentApi.unlinkBoard(session.id));
      } catch (err) {
        toast.error("Couldn't unlink the board", err.message);
      } finally {
        setBusy(false);
      }
      return;
    }
    link(id);
  };

  const options = boards.some((b) => b.id === EXAMPLE_ID) ? boards : [...boards, { id: EXAMPLE_ID, title: 'Example board (bundled)', sections: 12 }];
  const stale = Boolean(session.board && local && (local.updatedAt || 0) > new Date(session.board.linkedAt).getTime());

  return (
    <div>
      <label htmlFor="content-board" className="font-mono text-2xs uppercase tracking-[0.2em] text-ink-3">
        Selected Jam board
      </label>
      <div className="mt-2 flex items-center gap-2">
        <select
          id="content-board"
          value={linkedId}
          onChange={change}
          disabled={busy || disabled}
          className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-[13px] text-ink outline-none focus:border-line-strong disabled:opacity-50"
        >
          <option value="">No board (transcribe only)</option>
          {options.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title} ({b.sections} sections)
            </option>
          ))}
        </select>
        {stale && (
          <Button size="md" variant="secondary" onClick={() => link(linkedId)} disabled={busy}>
            <RefreshCw size={13} />
            Re-sync
          </Button>
        )}
      </div>
      {session.board && (
        <p className="mt-1.5 text-xs text-ink-3">
          {stale ? 'This board has changed since it was linked. ' : ''}
          {session.board.sections} sections, {session.board.parts} spoken parts linked.
        </p>
      )}
      {boards.length === 0 && !session.board && <p className="mt-1.5 text-xs text-ink-3">Make a board on the Jam board page, or try the bundled example.</p>}
    </div>
  );
}
