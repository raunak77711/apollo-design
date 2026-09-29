import { fitInto, scaledSize } from './util.js';

/**
 * Screenshots are how this board gets used: a Google result, a DevTools panel,
 * a PageSpeed report. So images arrive three ways — the toolbar button, a file
 * dragged onto the board, and Ctrl+V straight from the clipboard — and behave
 * like any other object once they land (move, scale, rotate, delete, undo).
 */

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const MAX_SIDE = 1600;
export const isImageType = (type) => IMAGE_TYPES.includes(type);

/** Read a file as a data URL, downscaled so the long side is at most MAX_SIDE (a saved board must stay small). */
export function readImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!isImageType(file.type)) {
      reject(new Error('Please add a PNG, JPG or WebP image.'));
      return;
    }
    const unreadable = () => reject(new Error("Couldn't read that image file."));
    const reader = new FileReader();
    reader.onerror = unreadable;
    reader.onload = () => {
      const img = new Image();
      img.onerror = unreadable;
      img.onload = () => {
        const { w, h } = scaledSize(img.naturalWidth, img.naturalHeight, MAX_SIDE);
        if (w === img.naturalWidth && h === img.naturalHeight) {
          resolve({ dataUrl: reader.result, w, h });
          return;
        }
        const off = document.createElement('canvas');
        off.width = w;
        off.height = h;
        off.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve({ dataUrl: off.toDataURL(file.type, 0.92), w, h });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/** The body of a browser frame under a world point, if there is one: that is where a screenshot belongs. */
function dropTargetAt(editor, point) {
  for (const { item, obj } of editor.renderer.items()) {
    if (!item.drop || obj.visible === false) continue;
    const r = obj.getBoundingRect(true, true);
    if (point.x >= r.left && point.x <= r.left + r.width && point.y >= r.top && point.y <= r.top + r.height) {
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    }
  }
  return null;
}

/** Place an image at `at` (a world point), or at the middle of the window. */
export function addImage(editor, { dataUrl, w, h }, at) {
  const { fabric, canvas, viewport } = editor;
  const v = viewport.view;
  const point = at || { x: (canvas.getWidth() / 2 - v.x) / v.zoom, y: (canvas.getHeight() / 2 - v.y) / v.zoom };
  const target = dropTargetAt(editor, point);

  return new Promise((resolve) => {
    fabric.Image.fromURL(dataUrl, (img) => {
      let scale;
      if (target) {
        const fit = fitInto(w, h, target, 12);
        scale = fit.scale;
        img.set({ left: fit.left, top: fit.top });
      } else {
        scale = Math.min(1, 640 / w, 480 / h);
        img.set({ left: point.x - (w * scale) / 2, top: point.y - (h * scale) / 2 });
      }
      img.set({ originX: 'left', originY: 'top', scaleX: scale, scaleY: scale });
      const made = editor.addObject(img, 'image');
      editor.select([made.data.id]);
      resolve(made);
    });
  });
}

const typing = (editor) => {
  const el = document.activeElement;
  return Boolean((el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) || editor.canvas.getActiveObject()?.isEditing);
};

export function attachImageInputs(editor, { host, input, onError }) {
  const handle = async (files, at) => {
    for (const file of files) {
      try {
        await addImage(editor, await readImageFile(file), at);
      } catch (err) {
        onError?.(err.message);
      }
    }
  };

  const onChange = () => {
    handle([...input.files]);
    input.value = '';
  };
  const onDragOver = (e) => {
    if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault();
  };
  const onDrop = (e) => {
    const files = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault();
    handle(files, editor.canvas.getPointer(e));
  };
  const onPaste = (e) => {
    if (typing(editor)) return;
    const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault();
    handle(files);
  };

  editor.requestImage = () => input.click();
  input.addEventListener('change', onChange);
  host.addEventListener('dragover', onDragOver);
  host.addEventListener('drop', onDrop);
  window.addEventListener('paste', onPaste);
  return () => {
    input.removeEventListener('change', onChange);
    host.removeEventListener('dragover', onDragOver);
    host.removeEventListener('drop', onDrop);
    window.removeEventListener('paste', onPaste);
    delete editor.requestImage;
  };
}
