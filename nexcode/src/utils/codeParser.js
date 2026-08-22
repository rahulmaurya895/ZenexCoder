const CODE_BLOCK_RE = /```([\w.+-]*)\s*(?:\n(?:\/\/|#)\s*filepath:\s*([^\n]+)\n)?([\s\S]*?)```/g;

export function extractCodeBlocks(markdown = '') {
  const blocks = [];
  let match;
  while ((match = CODE_BLOCK_RE.exec(markdown)) !== null) {
    blocks.push({
      language: match[1] || 'plaintext',
      filePath: match[2]?.trim() || null,
      code: match[3].trim()
    });
  }
  return blocks;
}

export function firstCodeBlock(markdown = '') {
  return extractCodeBlocks(markdown)[0] || null;
}

export function looksLikeCommand(code = '') {
  const trimmed = code.trim();
  return /^(npm|pnpm|yarn|node|python|pip|git|cargo|go|deno|bun|ollama|npx)\b/.test(trimmed);
}
