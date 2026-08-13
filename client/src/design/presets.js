/**
 * Canvas format presets offered when starting a new design. `ratio` drives the
 * little preview thumbnail in the picker. All are raster design canvases for the
 * MVP (app/web layouts are designed on a canvas; the structured webapp builder
 * comes later).
 */
export const PRESETS = [
  { id: 'banner', name: 'Banner', width: 1200, height: 628, group: 'Marketing' },
  { id: 'ig-post', name: 'Instagram Post', width: 1080, height: 1080, group: 'Social' },
  { id: 'ig-story', name: 'Instagram Story', width: 1080, height: 1920, group: 'Social' },
  { id: 'yt-thumb', name: 'YouTube Thumbnail', width: 1280, height: 720, group: 'Social' },
  { id: 'poster', name: 'Poster', width: 1080, height: 1350, group: 'Print' },
  { id: 'app-mobile', name: 'App Screen', width: 1080, height: 2160, group: 'App' },
  { id: 'app-web', name: 'Web App', width: 1440, height: 1024, group: 'App' },
];

export function presetLabel(p) {
  return `${p.width} × ${p.height}`;
}
