import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT_DIR = 'd:/nexCode/nexcode';

const IGNORE_DIRS = new Set([
  'node_modules',
  'out',
  'dist',
  '.git',
  '.vite',
  'coverage',
  '.system_generated'
]);

const EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.json',
  '.html',
  '.css',
  '.md',
  '.mjs',
  '.cjs',
  '.yaml',
  '.yml',
  '.bat',
  '.ps1'
]);

let totalFilesScanned = 0;
let totalFilesModified = 0;
let totalReplacements = 0;

async function walkDir(currentDir) {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue;

    const fullPath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      await walkDir(fullPath);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (EXTENSIONS.has(ext) || entry.name === '.env' || entry.name === 'Dockerfile') {
        await processFile(fullPath);
      }
    }
  }
}

async function processFile(filePath) {
  totalFilesScanned++;
  try {
    const originalContent = await fs.readFile(filePath, 'utf8');
    let modifiedContent = originalContent;

    // Replacements
    const patterns = [
      { regex: /ZezenexCoderr/g, replace: 'ZenexCoder' },
      { regex: /ZezenexCoder/g, replace: 'ZenexCoder' },
      { regex: /ZenexCoderr/g, replace: 'ZenexCoder' },
      { regex: /zezenexcoder/g, replace: 'zenexcoder' },
      { regex: /ZEZENEXCODERR/g, replace: 'ZENEXCODER' },
      { regex: /ZEZENEXCODER/g, replace: 'ZENEXCODER' }
    ];

    let fileReplacementCount = 0;
    for (const p of patterns) {
      const matches = modifiedContent.match(p.regex);
      if (matches) {
        fileReplacementCount += matches.length;
        modifiedContent = modifiedContent.replace(p.regex, p.replace);
      }
    }

    if (fileReplacementCount > 0 && modifiedContent !== originalContent) {
      await fs.writeFile(filePath, modifiedContent, 'utf8');
      totalFilesModified++;
      totalReplacements += fileReplacementCount;
      console.log(`✓ Fixed ${fileReplacementCount} typos in: ${path.relative(ROOT_DIR, filePath)}`);
    }
  } catch (err) {
    console.error(`Error processing file ${filePath}:`, err.message);
  }
}

async function main() {
  console.log('Starting exact typo cleanup: ZezenexCoderr -> ZenexCoder...');
  await walkDir(ROOT_DIR);
  console.log('\n==========================================');
  console.log(`Total Files Scanned: ${totalFilesScanned}`);
  console.log(`Total Files Fixed: ${totalFilesModified}`);
  console.log(`Total Typo Replacements Made: ${totalReplacements}`);
  console.log('==========================================\n');
}

main().catch(console.error);
