import { useEffect, useRef } from 'react';
import { fabric } from 'fabric';
import { createEditor } from './editor/createEditor.js';
import { loadBoardFonts } from './engine/fonts.js';
import { attachImageInputs } from './tools/images.js';

/**
 * Mounts the editor. Fonts load first, because layout measures text and a
 * measurement taken before a face arrives is wrong for the life of the board.
 * The initial state is read once; after that the editor owns it.
 */
export default function BoardCanvas({ initialState, hooks, onEditor }) {
  const hostRef = useRef(null);
  const canvasRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    let disposed = false;
    let editor = null;
    let observer = null;
    let detachImages = null;

    loadBoardFonts().then(() => {
      if (disposed || !hostRef.current) return;
      editor = createEditor({ fabric, canvasEl: canvasRef.current, container: hostRef.current, state: initialState, hooks });
      observer = new ResizeObserver(() => editor.viewport.resize());
      observer.observe(hostRef.current);
      detachImages = attachImageInputs(editor, {
        host: hostRef.current,
        input: inputRef.current,
        onError: (message) => hooks.onError?.(message),
      });
      // A console handle for poking at the board while developing: window.__boardEditor.getState(), .dispatch(op), …
      if (import.meta.env.DEV) window.__boardEditor = editor;
      onEditor(editor);
    });

    return () => {
      disposed = true;
      detachImages?.();
      observer?.disconnect();
      editor?.dispose();
      onEditor(null);
    };
    // The editor is created once per mounted board; `initialState` and `hooks` are deliberately read only then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={hostRef} className="absolute inset-0 touch-none overflow-hidden bg-white">
      <canvas ref={canvasRef} />
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden />
    </div>
  );
}
