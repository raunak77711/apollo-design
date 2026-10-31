import test from 'node:test';
import assert from 'node:assert/strict';
import { droppedFiles, supportedMedia, planImport } from '../src/lib/combinator.js';

const entry = path => ({ path, file: { name: path.split('/').at(-1), size: 100, lastModified: 1 } });
test('mixed companion folders import only the chosen video formats', () => {
  const files = Array.from({ length: 51 }, (_, i) => ['gif', 'mov', 'MP3'].map(ext => entry(`hooks/${i + 1}.${ext}`))).flat();
  const plan = planImport(files, ['mov']);
  assert.equal(plan.selected.length, 51);
  assert.deepEqual(plan.skipped, { unsupported: 51, filtered: 51, duplicate: 0 });
  assert.equal(planImport(files, ['mp4']).selected.length, 0);
  assert.equal(planImport(files, ['mp3']).selected.length, 51);
});

test('alternate formats use one matching name by default or both when explicitly allowed', () => {
  const files = ['hooks/8.mov', 'hooks/8.MP4', 'hooks/8.MP3', 'hooks/9.mov'].map(entry);
  const plan = planImport(files, ['mov', 'mp4', 'mp3']);
  assert.deepEqual(plan.selected.map(i => i.path), ['hooks/8.MP4', 'hooks/9.mov']);
  assert.equal(plan.skipped.duplicate, 2);
  assert.equal(planImport(files, ['mov']).selected.length, 2);
  assert.equal(planImport(files, ['mov', 'mp4'], false).selected.length, 3);
});

test('reopened branches retain filename matching, while different subfolders remain separate', () => {
  const files = ['hooks/8.MP4', 'other/8.mov', 'hooks/9.mov'].map(entry);
  const existing = [{ name: '8.mov', sourcePath: 'hooks/8.mov' }];
  const plan = planImport(files, ['mp4', 'mov'], true, existing);
  assert.deepEqual(plan.selected.map(i => i.path), ['hooks/9.mov', 'other/8.mov']);
  assert.equal(plan.skipped.duplicate, 1);
  assert.equal(planImport([files[0], files[0]], ['mp4'], false).selected.length, 1);
});

test('recursive folder import drains every directory batch', async () => {
  const leaf = name => ({ isFile: true, name, file: resolve => resolve({ name }) });
  const folder = (name, batches) => ({ name, isDirectory: true, createReader: () => { let index = 0; return { readEntries: resolve => resolve(batches[index++] || []) }; } });
  const root = folder('hooks', [[leaf('first.MP4')], [folder('nested', [[leaf('voice.wav')]])]]);
  const files = await droppedFiles({ items: [{ kind: 'file', webkitGetAsEntry: () => root, getAsFile: () => null }] });
  assert.deepEqual(files.map(f => f.path), ['hooks/first.MP4', 'hooks/nested/voice.wav']);
  assert.ok(supportedMedia(files[0].file.name));
  assert.ok(supportedMedia(files[1].file.name));
  assert.equal(supportedMedia('notes.txt'), false);
});

test('supports regular dropped files without directory APIs', async () => {
  const file = { name: 'clip.mov' };
  assert.deepEqual(await droppedFiles({ files: [file] }), [{ file, path: 'clip.mov' }]);
});
