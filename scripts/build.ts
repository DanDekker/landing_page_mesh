import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');
mkdirSync(resolve(root, 'dist'), { recursive: true });
const build = await Bun.build({
  entrypoints: [resolve(root, 'src/main.ts'), resolve(root, 'src/physics/worker.ts')],
  outdir: resolve(root, 'dist'),
  naming: '[name].[ext]',
  target: 'browser',
  format: 'esm',
  minify: true,
  sourcemap: 'none',
});
if (!build.success) { for (const log of build.logs) console.error(log); process.exit(1); }
for (const name of ['index.html', 'style.css', 'icon.svg']) await Bun.write(resolve(root, 'dist', name), Bun.file(resolve(root, 'public', name)));
console.log(`Built ${build.outputs.length} browser bundles. No dependencies.`);
