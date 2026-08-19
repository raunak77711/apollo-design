import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, Pencil, PenLine, Trash2, X } from 'lucide-react';
import { cx } from '../../lib/cx.js';
import { IconButton, Tooltip } from '../../ui/primitives.jsx';
import { MenuItem, Popover } from '../../ui/overlay.jsx';

/**
 * Conversation history.
 *
 * A rail, not a sidebar. It holds titles and nothing else, it can be shut, and
 * on a phone it is a drawer — because on a screen this size the conversation is
 * the product and a permanent list of other conversations is furniture.
 */
export default function ConversationRail({
  groups,
  activeId,
  onSelect,
  onNew,
  onRename,
  onDelete,
  onClose,
  className,
}) {
  const [renaming, setRenaming] = useState(null);

  return (
    <div className={cx('flex min-h-0 flex-col', className)}>
      <div className="flex h-11 shrink-0 items-center gap-2 pl-3.5 pr-2">
        <h2 className="min-w-0 flex-1 truncate font-mono text-2xs uppercase tracking-[0.14em] text-ink-3">
          Chats
        </h2>
        <Tooltip label="New chat" hint="⌘K" side="bottom">
          <IconButton size="md" onClick={onNew} aria-label="New chat">
            <PenLine size={14} />
          </IconButton>
        </Tooltip>
        {/* Only the drawer passes this: on a phone the rail *is* the panel, so
            it carries its own dismiss rather than stacking a second header. */}
        {onClose && (
          <IconButton size="md" onClick={onClose} aria-label="Close conversation history">
            <X size={14} />
          </IconButton>
        )}
      </div>

      <nav aria-label="Conversation history" className="thin-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {groups.length === 0 ? (
          <p className="px-1.5 py-2 text-xs leading-relaxed text-ink-3">
            Your conversations will collect here.
          </p>
        ) : (
          groups.map((group) => (
            <section key={group.label} className="mb-1">
              <h3 className="px-1.5 pb-1 pt-3 font-mono text-2xs uppercase tracking-[0.14em] text-ink-3/80">
                {group.label}
              </h3>
              <ul>
                {group.items.map((conversation) => (
                  <li key={conversation.id}>
                    {renaming === conversation.id ? (
                      <RenameField
                        value={conversation.title}
                        onCommit={(title) => {
                          onRename(conversation.id, title);
                          setRenaming(null);
                        }}
                        onCancel={() => setRenaming(null)}
                      />
                    ) : (
                      <Row
                        conversation={conversation}
                        active={conversation.id === activeId}
                        onSelect={() => onSelect(conversation.id)}
                        onRename={() => setRenaming(conversation.id)}
                        onDelete={() => onDelete(conversation.id)}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </nav>
    </div>
  );
}

function Row({ conversation, active, onSelect, onRename, onDelete }) {
  return (
    <div
      className={cx(
        'group/row relative flex h-8 items-center rounded-md transition-colors duration-150',
        active ? 'bg-raised' : 'hover:bg-raised'
      )}
    >
      {active && <span className="absolute left-0 h-4 w-[2px] rounded-full bg-accent" />}
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? 'page' : undefined}
        className={cx(
          'min-w-0 flex-1 truncate rounded-md py-1 pl-2.5 pr-1 text-left text-[13px] transition-colors duration-150',
          active ? 'font-medium text-ink' : 'text-ink-2 group-hover/row:text-ink'
        )}
      >
        {conversation.title}
      </button>

      <Popover
        align="end"
        className={cx(
          'pr-1 transition-opacity duration-150',
          'opacity-0 focus-within:opacity-100 group-hover/row:opacity-100',
          active && 'opacity-100'
        )}
        button={({ toggle, open }) => (
          <IconButton size="sm" onClick={toggle} active={open} aria-label={`Options for ${conversation.title}`}>
            <MoreHorizontal size={13} />
          </IconButton>
        )}
      >
        {({ close }) => (
          <>
            <MenuItem
              icon={Pencil}
              onClick={() => {
                close();
                onRename();
              }}
            >
              Rename
            </MenuItem>
            <MenuItem
              icon={Trash2}
              danger
              onClick={() => {
                close();
                onDelete();
              }}
            >
              Delete
            </MenuItem>
          </>
        )}
      </Popover>
    </div>
  );
}

function RenameField({ value, onCommit, onCancel }) {
  const ref = useRef(null);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit(draft);
        if (e.key === 'Escape') onCancel();
      }}
      aria-label="Conversation name"
      className="h-8 w-full rounded-md border border-line-strong bg-surface px-2 text-[13px] text-ink outline-none"
    />
  );
}
