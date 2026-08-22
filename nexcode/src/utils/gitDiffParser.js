export function parseGitDiff(rawDiff = '') {
  const files = [];
  let current = null;

  rawDiff.split(/\r?\n/).forEach((line) => {
    if (line.startsWith('diff --git ')) {
      current = { header: line, before: [], after: [], hunks: [] };
      files.push(current);
      return;
    }
    if (!current) return;
    if (line.startsWith('@@')) {
      current.hunks.push(line);
      return;
    }
    if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('index ') || line.startsWith('new file') || line.startsWith('deleted file')) {
      return;
    }
    if (line.startsWith('-')) {
      current.before.push(line.slice(1));
      return;
    }
    if (line.startsWith('+')) {
      current.after.push(line.slice(1));
      return;
    }
    if (line.startsWith(' ')) {
      const value = line.slice(1);
      current.before.push(value);
      current.after.push(value);
    }
  });

  return files;
}

export function diffToBeforeAfter(rawDiff = '') {
  const files = parseGitDiff(rawDiff);
  if (!files.length) {
    return { original: '', updated: '' };
  }
  return {
    original: files.flatMap((file) => file.before).join('\n'),
    updated: files.flatMap((file) => file.after).join('\n')
  };
}
