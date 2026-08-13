import { applyOperations } from '../design/operations.js';
import { createEmptyDocument } from '../design/schema.js';

const MAX_HISTORY = 100;

export const initialState = {
  document: createEmptyDocument(),
  selectedElementId: null,
  tool: 'select',
  zoom: 1,
  // Undo/redo stacks operate on whole design documents.
  past: [],
  future: [],
  transientBase: null, // snapshot captured at the start of a drag
};

export function editorReducer(state, action) {
  switch (action.type) {
    case 'LOAD_DOCUMENT':
      return {
        ...state,
        document: action.document,
        selectedElementId: null,
        past: [],
        future: [],
        transientBase: null,
      };

    case 'SELECT_ELEMENT':
      return { ...state, selectedElementId: action.id };

    case 'SET_TOOL':
      return { ...state, tool: action.tool };

    case 'SET_ZOOM':
      return { ...state, zoom: Math.min(3, Math.max(0.1, action.zoom)) };

    // Records a single history entry. Used by discrete edits and AI operations.
    case 'APPLY': {
      const { document } = applyOperations(state.document, action.operations);
      return {
        ...state,
        document,
        past: [...state.past, state.document].slice(-MAX_HISTORY),
        future: [],
        transientBase: null,
        selectedElementId: action.selectId !== undefined ? action.selectId : state.selectedElementId,
      };
    }

    // Live updates during a drag: mutate present, remember the pre-drag snapshot.
    case 'APPLY_TRANSIENT': {
      const { document } = applyOperations(state.document, action.operations);
      return {
        ...state,
        document,
        transientBase: state.transientBase ?? state.document,
      };
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
        selectedElementId: null,
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
        selectedElementId: null,
      };
    }

    default:
      return state;
  }
}
