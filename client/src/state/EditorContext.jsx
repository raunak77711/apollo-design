import { createContext, useContext, useMemo, useReducer } from 'react';
import { editorReducer, initialState } from './reducer.js';

const EditorContext = createContext(null);

export function EditorProvider({ children }) {
  const [state, dispatch] = useReducer(editorReducer, initialState);

  // Every mutation funnels through the operation system, so manual edits and AI
  // edits share one code path, one validation pass and one history.
  const actions = useMemo(
    () => ({
      loadDocument: (document) => dispatch({ type: 'LOAD_DOCUMENT', document }),

      select: (id) => dispatch({ type: 'SELECT', ids: id ? [id] : [] }),
      selectMany: (ids) => dispatch({ type: 'SELECT', ids }),
      toggleSelect: (id) => dispatch({ type: 'TOGGLE_SELECT', id }),
      clearSelection: () => dispatch({ type: 'SELECT', ids: [] }),

      setTool: (tool) => dispatch({ type: 'SET_TOOL', tool }),
      setZoom: (zoom) => dispatch({ type: 'SET_ZOOM', zoom }),

      // Discrete, undoable edits (inspector, layers, AI apply).
      apply: (operations, opts = {}) => dispatch({ type: 'APPLY', operations, ...opts }),

      // Drag lifecycle — many frames, one history entry.
      applyTransient: (operations) => dispatch({ type: 'APPLY_TRANSIENT', operations }),
      commitTransient: () => dispatch({ type: 'COMMIT_TRANSIENT' }),

      undo: () => dispatch({ type: 'UNDO' }),
      redo: () => dispatch({ type: 'REDO' }),
    }),
    []
  );

  const value = useMemo(() => ({ state, dispatch, actions }), [state, actions]);
  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

export function useEditor() {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error('useEditor must be used within an EditorProvider');
  return ctx;
}

/** The elements currently selected, in document order. */
export function useSelection() {
  const { state } = useEditor();
  return useMemo(
    () => state.document.elements.filter((el) => state.selectedIds.includes(el.id)),
    [state.document, state.selectedIds]
  );
}
