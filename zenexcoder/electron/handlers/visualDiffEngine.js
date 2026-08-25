import fs from 'node:fs/promises';
import path from 'node:path';

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function safeName(value = 'screenshot') {
  return String(value || 'screenshot')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'screenshot';
}

export async function compareOrCreateGolden({ projectPath, name, imageBuffer, threshold = 0.05 } = {}) {
  if (!projectPath) throw new Error('Project path is required for visual snapshots.');
  const baseDir = path.join(projectPath, 'tests', 'visual');
  const actualDir = path.join(baseDir, 'actual');
  const diffDir = path.join(baseDir, 'diff');
  await Promise.all([ensureDir(baseDir), ensureDir(actualDir), ensureDir(diffDir)]);

  const fileName = `${safeName(name)}.png`;
  const goldenPath = path.join(baseDir, fileName);
  const actualPath = path.join(actualDir, fileName);
  const diffPath = path.join(diffDir, fileName);
  await fs.writeFile(actualPath, imageBuffer);

  try {
    await fs.access(goldenPath);
  } catch {
    await fs.writeFile(goldenPath, imageBuffer);
    return {
      status: 'baseline-created',
      changed: false,
      mismatchRatio: 0,
      goldenPath,
      actualPath,
      diffPath: ''
    };
  }

  const { PNG } = await import('pngjs');
  const pixelmatchModule = await import('pixelmatch');
  const pixelmatch = pixelmatchModule.default || pixelmatchModule;
  const [goldenBuffer, actualBuffer] = await Promise.all([fs.readFile(goldenPath), fs.readFile(actualPath)]);
  const golden = PNG.sync.read(goldenBuffer);
  const actual = PNG.sync.read(actualBuffer);

  if (golden.width !== actual.width || golden.height !== actual.height) {
    await fs.copyFile(actualPath, diffPath);
    return {
      status: 'dimension-mismatch',
      changed: true,
      mismatchRatio: 1,
      goldenPath,
      actualPath,
      diffPath,
      diffBase64: actualBuffer.toString('base64')
    };
  }

  const diff = new PNG({ width: golden.width, height: golden.height });
  const mismatch = pixelmatch(golden.data, actual.data, diff.data, golden.width, golden.height, { threshold: 0.1 });
  const mismatchRatio = mismatch / Math.max(golden.width * golden.height, 1);
  const diffBuffer = PNG.sync.write(diff);
  await fs.writeFile(diffPath, diffBuffer);
  return {
    status: mismatchRatio > threshold ? 'changed' : 'match',
    changed: mismatchRatio > threshold,
    mismatchRatio,
    goldenPath,
    actualPath,
    diffPath,
    diffBase64: diffBuffer.toString('base64')
  };
}
