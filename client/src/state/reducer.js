import { applyOperations } from '../design/operations.js';
import { createEmptyDocument } from '../design/schema.js';

const MAX_HISTORY = 100;

export const initialState = {
  document: createEmptyDocument(),
  // Selection is a set: one element shows its own controls, several show
  // arrangement controls instead.
  selectedIds: [],
  tool: 'select',
  zoom: 1,
  past: [],
  future: [],
  transientBase: null, // snapshot captured at the start of a drag
};

/** Drops ids that no longer exist (after undo, delete, or an AI edit). */
const prune = (ids, document) => {
  const alive = new Set(document.elements.map((e) => e.id));
  return ids.filter((id) => alive.has(id));
};

export function editorReducer(state, action) {
  switch (action.type) {
    case 'LOAD_DOCUMENT':
      return {
        ...state,
        document: action.document,
        selectedIds: [],
        past: [],
        future: [],
        transientBase: null,
      };

    case 'SELECT':
      return { ...state, selectedIds: action.ids ? [...action.ids] : [] };

    case 'TOGGLE_SELECT': {
      const has = state.selectedIds.includes(action.id);
      return {
        ...state,
        selectedIds: has ? state.selectedIds.filter((id) => id !== action.id) : [...state.selectedIds, action.id],
      };
    }

    case 'SET_TOOL':
      return { ...state, tool: action.tool };

    case 'SET_ZOOM':
      return { ...state, zoom: Math.min(8, Math.max(0.02, action.zoom)) };

    // One history entry. Used by discrete edits and by AI operations.
    case 'APPLY': {
      const { document } = applyOperations(state.document, action.operations);
      return {
        ...state,
        document,
        past: [...state.past, state.document].slice(-MAX_HISTORY),
        future: [],
        transientBase: null,
        selectedIds: action.selectIds !== undefined ? action.selectIds : prune(state.selectedIds, document),
      };
    }

    // Live updates during a drag: mutate present, remember the pre-drag snapshot.
    case 'APPLY_TRANSIENT': {
      const { document } = applyOperations(state.document, action.operations);
      return { ...state, document, transientBase: state.transientBase ?? state.document };
    }

    // End of a drag: fold the pre-drag snapshot into history as one entry.
    case 'COMMIT_TRANSIENT': {
      if (state.transientBase == null) return state;
      return {
        ...state,
        past: [...state.past, state.transientBase].slice(-MAX_HISTORY),
        future: [],
        transientBase: null,
      };
    }

    case 'UNDO': {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        ...state,
        document: previous,
        past: state.past.slice(0, -1),
        future: [state.document, ...state.future].slice(0, MAX_HISTORY),
        selectedIds: prune(state.selectedIds, previous),
      };
    }

    case 'REDO': {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      return {
        ...state,
        document: next,
        past: [...state.past, state.document].slice(-MAX_HISTORY),
        future: state.future.slice(1),
        selectedIds: prune(state.selectedIds, next),
      };
    }

    default:
      return state;
  }
}
