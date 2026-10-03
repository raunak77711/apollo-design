import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.resolve(here, rel), 'utf8').replace(/\r\n/g, '\n');

test('the platform presets are identical on the server and in the video engine', () => {
  assert.equal(
    read('../src/services/content/platforms.js'),
    read('../../client/src/video/platforms.js'),
    'client/src/video/platforms.js must be a byte-for-byte copy of server/src/services/content/platforms.js'
  );
});
