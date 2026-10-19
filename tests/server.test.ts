import { afterAll, expect, test } from 'bun:test';
import { createServer } from '../src/server.ts';

const instance = createServer({ port: 0, hostname: '127.0.0.1', privateFactory: null });
const base = instance.server.url;
afterAll(() => instance.stop());

test('only the allowlisted browser assets are served', async () => {
  const response = await fetch(base);
  expect(response.status).toBe(200);
  expect(await response.text()).toContain('<particle-field');
  expect(response.headers.get('content-security-policy')).toContain("connect-src 'self'");
  for (const path of ['.env', '.git/config', 'src/server.ts', 'private/adapter.ts', '.private/engine.wasm', 'otto.dylib', 'main.js.map', '%2e%2e/.env']) {
    const response = await fetch(new URL(path, base));
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('Not found');
  }
});

test('the API reveals no private implementation and rejects writes', async () => {
  const response = await fetch(new URL('api/field', base));
  expect(await response.json()).toEqual({ private: false });
  const post = await fetch(base, { method: 'POST', body: '{}' });
  expect(post.status).toBe(405);
});

test('private streaming is absent without an adapter', async () => {
  expect((await fetch(new URL('field', base))).status).toBe(404);
});
