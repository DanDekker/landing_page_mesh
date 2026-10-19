import { watch } from 'node:fs';
import { resolve } from 'node:path';
import { buildBrowser } from './build.ts';

await buildBrowser();
const root = resolve(import.meta.dir, '..');
const server = Bun.spawn([process.execPath, '--watch', resolve(root, 'src/server.ts')], { cwd: root, stdin: 'inherit', stdout: 'inherit', stderr: 'inherit' });
let timer: ReturnType<typeof setTimeout> | undefined;
let building = false, pending = false;
async function rebuild() {
  if (building) { pending = true; return; }
  building = true;
  try { await buildBrowser(); } catch (error) { console.error(error); }
  finally { building = false; if (pending) { pending = false; void rebuild(); } }
}
const watchers = ['src', 'public'].map(directory => watch(resolve(root, directory), { recursive: true }, (_event, filename) => {
  if (!filename || /(^|\/)\./.test(filename) || filename.endsWith('.DS_Store')) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void rebuild(), 60);
}));
const close = () => { if (timer) clearTimeout(timer); for (const watcher of watchers) watcher.close(); server.kill('SIGTERM'); };
process.on('SIGINT', close); process.on('SIGTERM', close);
process.exitCode = await server.exited;
for (const watcher of watchers) watcher.close();
