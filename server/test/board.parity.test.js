import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** The server and client vocabulary files are mirrors. Line endings may differ per checkout; content may not. */
const read = (url) => readFileSync(url, 'utf8').replace(/\r\n/g, '\n');

for (const file of ['schema.js', 'operations.js']) {
  test(`${file} is identical on the server and the client`, () => {
    const server = read(new URL(`../src/design/board/${file}`, import.meta.url));
    const client = read(new URL(`../../client/src/components/board/state/${file}`, import.meta.url));
    assert.equal(client, server, `client/src/components/board/state/${file} has drifted from server/src/design/board/${file}`);
  });
}
