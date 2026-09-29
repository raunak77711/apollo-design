import test from 'node:test';
import assert from 'node:assert/strict';
import { DeepSeekProvider } from '../src/services/ai/DeepSeekProvider.js';
import { MockProvider } from '../src/services/ai/MockProvider.js';
import { NotConfiguredError } from '../src/services/ai/AIProvider.js';

const provider = () => new DeepSeekProvider({ apiKey: 'k', baseUrl: 'https://x.test/', model: 'm' });
const reply = (content) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });

async function withFetch(stub, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = stub;
  try {
    return await fn();
  } finally {
    globalThis.fetch = real;
  }
}

test('completeJSON sends a JSON-mode request and returns the parsed object', async () => {
  const seen = [];
  await withFetch(async (url, init) => { seen.push({ url, init }); return reply('{"sections":[1]}'); }, async () => {
    const out = await provider().completeJSON({ system: 'SYS', user: 'USR', maxTokens: 111, temperature: 0.2 });
    assert.deepEqual(out, { sections: [1] });
  });
  const body = JSON.parse(seen[0].init.body);
  assert.equal(seen[0].url, 'https://x.test/chat/completions');
  assert.equal(body.max_tokens, 111);
  assert.equal(body.temperature, 0.2);
  assert.deepEqual(body.response_format, { type: 'json_object' });
  assert.equal(body.messages[0].content, 'SYS');
  assert.equal(body.messages[1].content, 'USR');
});

test('aborting the caller signal cancels the upstream request', async () => {
  const ctrl = new AbortController();
  const stub = (url, init) => new Promise((_, reject) => {
    init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });
  await withFetch(stub, async () => {
    const pending = provider().completeJSON({ system: 's', user: 'u', signal: ctrl.signal });
    setTimeout(() => ctrl.abort(), 5);
    await assert.rejects(pending, { name: 'AbortError' });
  });
});

test('a reply that is valid JSON but not an object becomes {}', async () => {
  await withFetch(async () => reply('[1,2,3]'), async () => {
    assert.deepEqual(await provider().completeJSON({ system: 's', user: 'u' }), {});
  });
});

test('a non-JSON reply throws', async () => {
  await withFetch(async () => reply('not json at all'), async () => {
    await assert.rejects(provider().completeJSON({ system: 's', user: 'u' }), /non-JSON/);
  });
});

test('an HTTP error carries its status', async () => {
  await withFetch(async () => new Response('nope', { status: 401 }), async () => {
    await assert.rejects(provider().completeJSON({ system: 's', user: 'u' }), (err) => err.status === 401);
  });
});

test('only DeepSeek is live; the mock refuses with NotConfiguredError', async () => {
  assert.equal(provider().live, true);
  const mock = new MockProvider();
  assert.equal(mock.live, false);
  await assert.rejects(mock.completeJSON({ system: 's', user: 'u' }), (err) => err instanceof NotConfiguredError && err.status === 503);
});
