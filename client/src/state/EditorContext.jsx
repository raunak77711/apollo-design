import { createContext, useContext, useReducer, useMemo, useCallback } from 'react';
import { editorReducer, initialState } from './reducer.js';

const EditorContext = createContext(null);

export function EditorProvider({ children }) {
  const [state, dispatch] = useReducer(editorReducer, initialState);

  // Convenience action creators — all mutations funnel through the operation system.
  const actions = useMemo(
    () => ({
      loadDocument: (document) => dispatch({ type: 'LOAD_DOCUMENT', document }),
      select: (id) => dispatch({ type: 'SELECT_ELEMENT', id }),
      setTool: (tool) => dispatch({ type: 'SET_TOOL', tool }),
      setZoom: (zoom) => dispatch({ type: 'SET_ZOOM', zoom }),

      // Discrete, undoable edits (properties panel, layers, AI apply).
      apply: (operations, opts = {}) => dispatch({ type: 'APPLY', operations, ...opts }),

      // Drag lifecycle.
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

/** Selector helper for the currently selected element. */
export function useSelectedElement() {
  const { state } = useEditor();
  return useCallback(
    () => state.document.elements.find((e) => e.id === state.selectedElementId) || null,
    [state.document, state.selectedElementId]
  )();
}
