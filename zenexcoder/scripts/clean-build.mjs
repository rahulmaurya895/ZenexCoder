import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const targets = ['dist', 'dist-test', 'out'];
for (const target of targets) {
  const full = path.join(root, target);
  await fs.rm(full, { recursive: true, force: true }).catch(() => {});
}
