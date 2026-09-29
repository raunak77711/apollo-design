import test from 'node:test';
import assert from 'node:assert/strict';
import { describeSelection, modeOf } from '../src/components/board/propertyModel.js';

const ann = (kind, obj, type = 'x') => ({ obj, id: 'a_1', kind: 'annotation', ann: kind, type });
const piece = (type, obj) => ({ obj, id: 's1.b1.n1', kind: 'presentation', type });

test('modeOf classifies annotations by kind and pieces by shape', () => {
  assert.equal(modeOf(ann('text')), 'text');
  assert.equal(modeOf(ann('sticky')), 'text');
  assert.equal(modeOf(ann('shape')), 'shape');
  assert.equal(modeOf(ann('arrow')), 'line');
  assert.equal(modeOf(ann('line')), 'line');
  assert.equal(modeOf(ann('path')), 'stroke');
  assert.equal(modeOf(ann('highlight')), 'stroke');
  assert.equal(modeOf(ann('image')), 'image');
  assert.equal(modeOf(piece('textbox', {})), 'text');
  assert.equal(modeOf(piece('group', {})), 'piece');
  assert.equal(modeOf(piece('line', {})), 'other');
});

test('nothing selected, or a mixed selection, has no editable mode', () => {
  assert.equal(describeSelection([]).mode, 'none');
  assert.equal(describeSelection([ann('shape', {}), ann('path', {})]).mode, 'mixed');
});

test('text values are read off the Fabric text box', () => {
  const { mode, values } = describeSelection([ann('text', {
    fontFamily: 'Inter', fontSize: 56, fontWeight: '700', fontStyle: 'italic', underline: false,
    fill: '#c81e3a', textAlign: 'center', lineHeight: 1.1, charSpacing: 20,
  })]);
  assert.equal(mode, 'text');
  assert.deepEqual(values, {
    fontFamily: 'Inter', fontSize: 56, bold: true, italic: true, underline: false,
    color: '#c81e3a', align: 'center', lineHeight: 1.1, letterSpacing: 20,
  });
});

test('regular weight text is not bold', () => {
  assert.equal(describeSelection([ann('text', { fontWeight: '400' })]).values.bold, false);
  assert.equal(describeSelection([ann('text', { fontWeight: 'bold' })]).values.bold, true);
});

test('shape, line, stroke and image values', () => {
  assert.deepEqual(describeSelection([ann('shape', { type: 'rect', fill: 'rgba(0,0,0,.1)', stroke: '#111', strokeWidth: 5, opacity: 0.5, rx: 10 })]).values,
    { fill: 'rgba(0,0,0,.1)', stroke: '#111', strokeWidth: 5, opacity: 0.5, radius: 10, isRect: true });
  assert.equal(describeSelection([ann('shape', { type: 'ellipse', rx: 80 })]).values.isRect, false);
  assert.deepEqual(describeSelection([ann('arrow', { color: '#c81e3a', lineWidth: 5, dashed: true, headEnd: true, headStart: false })]).values,
    { color: '#c81e3a', strokeWidth: 5, dashed: true, headEnd: true, headStart: false });
  assert.deepEqual(describeSelection([ann('path', { stroke: '#000', strokeWidth: 4 })]).values, { color: '#000', strokeWidth: 4, opacity: 1 });
  assert.deepEqual(describeSelection([ann('image', { opacity: 0.8 })]).values, { opacity: 0.8 });
});

test('a grouped piece reads its box and its label', () => {
  const group = { opacity: 1, getObjects: () => [{ fill: '#fff', stroke: '#111', strokeWidth: 2 }, { fill: '#0a0a0a', fontSize: 22 }] };
  assert.deepEqual(describeSelection([piece('group', group)]).values,
    { fill: '#fff', stroke: '#111', strokeWidth: 2, opacity: 1, color: '#0a0a0a', fontSize: 22 });
});
