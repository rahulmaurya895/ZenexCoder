// scan_report.js – generates a markdown report of the project
// This script is placed in the artifact folder; later it will be copied to the project root.
const fs = require('fs');
const path = require('path');

// Project root is passed via an environment variable PROJECT_ROOT when the script is executed.
const PROJECT_ROOT = process.env.PROJECT_ROOT || path.resolve(__dirname, '..', '..', 'nexCode');

function walk(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.git', 'dist', 'build'].includes(entry.name)) continue;
      walk(fullPath, fileList);
    } else {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

function countExtensions(files) {
  const counts = {};
  for (const f of files) {
    const ext = path.extname(f).toLowerCase() || 'no_ext';
    counts[ext] = (counts[ext] || 0) + 1;
  }
  return counts;
}

function generateReport() {
  const allFiles = walk(PROJECT_ROOT);
  const extCounts = countExtensions(allFiles);
  const pkgPath = path.join(PROJECT_ROOT, 'package.json');
  let pkg = {};
  try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')); } catch (_) {}

  const lines = [];
  lines.push('# Project Scan Report');
  lines.push('');
  lines.push(`**Root:** ${PROJECT_ROOT}`);
  lines.push('');
  lines.push('## File Summary');
  lines.push(`Total files (excluding ignored dirs): ${allFiles.length}`);
  lines.push('');
  lines.push('### Extension breakdown');
  lines.push('| Extension | Count |');
  lines.push('|-----------|-------|');
  for (const [ext, cnt] of Object.entries(extCounts).sort()) {
    lines.push(`| ${ext} | ${cnt} |`);
  }
  lines.push('');
  lines.push('## package.json dependencies');
  if (pkg.dependencies) {
    lines.push('### dependencies');
    lines.push('| Package | Version |');
    lines.push('|---------|---------|');
    for (const [name, version] of Object.entries(pkg.dependencies).sort()) {
      lines.push(`| ${name} | ${version} |`);
    }
    lines.push('');
  }
  if (pkg.devDependencies) {
    lines.push('### devDependencies');
    lines.push('| Package | Version |');
    lines.push('|---------|---------|');
    for (const [name, version] of Object.entries(pkg.devDependencies).sort()) {
      lines.push(`| ${name} | ${version} |`);
    }
    lines.push('');
  }

  const reportPath = path.join(PROJECT_ROOT, 'scan_report.md');
  fs.writeFileSync(reportPath, lines.join('\n'), 'utf8');
  console.log('✔ Scan report written to', reportPath);
}

generateReport();
