import { createPatch, diffLines } from 'diff';

export function makeLineDiff(original = '', updated = '') {
  return diffLines(original, updated).map((part, index) => ({
    id: index,
    value: part.value,
    added: Boolean(part.added),
    removed: Boolean(part.removed),
    unchanged: !part.added && !part.removed
  }));
}

export function makeUnifiedPatch(fileName = 'file', original = '', updated = '') {
  return createPatch(fileName, original, updated, 'original', 'ai');
}

export function countChangedLines(parts = []) {
  return parts.reduce((total, part) => {
    if (!part.added && !part.removed) {
      return total;
    }
    return total + part.value.split('\n').filter(Boolean).length;
  }, 0);
}
