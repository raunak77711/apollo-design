import test from 'node:test';
import assert from 'node:assert/strict';
import { IMAGE_TYPES, MAX_SIDE, isImageType } from '../src/components/board/tools/images.js';

test('only PNG, JPG and WebP are accepted, downscaled to 1600 on the long side', () => {
  assert.deepEqual(IMAGE_TYPES, ['image/png', 'image/jpeg', 'image/webp']);
  assert.equal(MAX_SIDE, 1600);
  for (const ok of IMAGE_TYPES) assert.equal(isImageType(ok), true);
  for (const bad of ['image/gif', 'image/svg+xml', 'application/pdf', '', undefined]) assert.equal(isImageType(bad), false);
});
