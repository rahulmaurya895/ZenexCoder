const LANGUAGE_BY_EXTENSION = {
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  json: 'json',
  css: 'css',
  html: 'html',
  md: 'markdown',
  py: 'python',
  java: 'java',
  kt: 'kotlin',
  go: 'go',
  rs: 'rust',
  cpp: 'cpp',
  c: 'c',
  cs: 'csharp',
  php: 'php',
  rb: 'ruby',
  sh: 'shell',
  ps1: 'powershell',
  sql: 'sql',
  yml: 'yaml',
  yaml: 'yaml'
};

export function basename(filePath = '') {
  return filePath.split(/[\\/]/).filter(Boolean).pop() || filePath;
}

export function dirname(filePath = '') {
  const parts = filePath.split(/[\\/]/);
  parts.pop();
  return parts.join(filePath.includes('\\') ? '\\' : '/');
}

export function extension(filePath = '') {
  return basename(filePath).split('.').pop()?.toLowerCase() || '';
}

export function detectLanguage(filePath = '') {
  return LANGUAGE_BY_EXTENSION[extension(filePath)] || 'plaintext';
}

export function testFilePath(filePath = '') {
  const dir = dirname(filePath);
  const name = basename(filePath);
  const dot = name.lastIndexOf('.');
  const nextName = dot > -1 ? `${name.slice(0, dot)}.test${name.slice(dot)}` : `${name}.test.js`;
  return dir ? `${dir}${filePath.includes('\\') ? '\\' : '/'}${nextName}` : nextName;
}

export function flattenTree(nodes = [], prefix = '') {
  return nodes
    .flatMap((node) => {
      const line = `${prefix}${node.type === 'folder' ? '[dir] ' : ''}${node.name}`;
      return [line, ...(node.children?.length ? flattenTree(node.children, `${prefix}  `) : [])];
    })
    .join('\n');
}
