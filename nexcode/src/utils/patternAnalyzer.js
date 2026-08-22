const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'your', 'have',
  'has', 'was', 'were', 'are', 'but', 'not', 'you', 'ai', 'run', 'step'
]);

function clean(value = '') {
  return String(value || '')
    .replace(/[`"'()[\]{}]/g, ' ')
    .replace(/\b\d{2,}\b/g, 'N')
    .replace(/[A-Fa-f0-9]{12,}/g, 'HASH')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(value = '') {
  return clean(value)
    .toLowerCase()
    .split(/[^a-z0-9_.:-]+/i)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token))
    .slice(0, 24);
}

function signature(value = '') {
  const text = clean(value).toLowerCase();
  const known = [
    [/module_not_found|cannot find package|cannot find module/, 'missing_dependency'],
    [/permission denied|eacces|access is denied/, 'permission_denied'],
    [/command not found|not recognized as .*cmdlet|not recognized as an internal/, 'command_not_found'],
    [/timed out|timeout|etimedout/, 'timeout'],
    [/enoent|no such file or directory|path not found/, 'path_missing'],
    [/merge conflict|conflict detected/, 'merge_conflict'],
    [/syntaxerror|unexpected token|parse error/, 'syntax_error'],
    [/typeerror|cannot read propert|undefined is not/, 'runtime_type_error']
  ];
  const match = known.find(([pattern]) => pattern.test(text));
  if (match) return match[1];
  return tokens(text).slice(0, 6).join('_') || 'unknown_failure';
}

function commandHead(description = '') {
  const text = clean(description);
  const commandMatch = text.match(/(?:command|run|exec(?:ute)?):?\s*([^\n\r]{3,120})/i);
  const raw = commandMatch?.[1] || text;
  return raw.split(/\s+/).slice(0, 4).join(' ');
}

function triggerForGroup(group) {
  const actionType = group[0]?.actionType || 'agent_action';
  const first = group[0]?.description || group[0]?.error || '';
  const head = actionType === 'terminal_run' ? commandHead(first) : tokens(first).slice(0, 5).join(' ');
  return clean(`${actionType} ${head || group[0]?.signature || ''}`).slice(0, 180);
}

function lessonFor(group) {
  const actionType = group[0]?.actionType || 'agent_action';
  const sig = group[0]?.signature || signature(group[0]?.description || group[0]?.error);
  const trigger = triggerForGroup(group);
  let avoid = `Repeating ${actionType} after ${sig}`;
  let suggest = 'Check the previous failure details and choose a safer alternative before executing.';

  if (sig === 'missing_dependency') {
    avoid = 'Assuming a package is bundled without verifying package.json or node_modules';
    suggest = 'Verify the dependency first, then install/package it before using the import.';
  } else if (sig === 'command_not_found') {
    avoid = 'Calling a binary from PATH without resolving the project runtime';
    suggest = 'Use the configured runtime path or detect the executable before running the command.';
  } else if (sig === 'permission_denied') {
    avoid = 'Retrying the same privileged operation without approval or a writable path check';
    suggest = 'Ask for approval or switch to a workspace-writable path before retrying.';
  } else if (sig === 'timeout') {
    avoid = 'Running the same long task without timeout control or progress handling';
    suggest = 'Use a longer explicit timeout, streaming output, or split the task into smaller checks.';
  } else if (sig === 'path_missing') {
    avoid = 'Using an inferred path without checking it exists';
    suggest = 'Resolve and verify the path before reading, writing, or executing against it.';
  } else if (sig === 'syntax_error') {
    avoid = 'Shipping generated code before compiling the changed module';
    suggest = 'Run the nearest build/typecheck and fix syntax errors before moving on.';
  } else if (sig === 'runtime_type_error') {
    avoid = 'Assuming optional runtime objects are always present';
    suggest = 'Add null/shape guards and verify with a smoke test.';
  }

  return {
    trigger,
    avoid,
    suggest,
    confidence: Math.min(0.95, 0.58 + group.length * 0.08),
    evidenceCount: group.length,
    category: sig
  };
}

function normalizeApproval(row = {}) {
  const decision = String(row.decision || '').toLowerCase();
  if (!['deny', 'denied', 'rejected', 'edited'].includes(decision)) return null;
  const description = clean(row.description || '');
  if (description.length < 8) return null;
  return {
    id: row.id,
    sourceType: 'approval',
    actionType: row.action_type || row.actionType || 'approval',
    description,
    error: description,
    decision,
    createdAt: row.created_at || row.createdAt || Date.now(),
    signature: signature(description)
  };
}

function normalizeChange(row = {}) {
  const status = String(row.status || '').toLowerCase();
  if (!['reverted', 'rejected'].includes(status)) return null;
  const detail = clean([row.file_path || row.filePath, row.explanation, status].filter(Boolean).join(' '));
  if (detail.length < 8) return null;
  return {
    id: row.id,
    sourceType: 'change_record',
    actionType: 'file_write',
    description: detail,
    error: detail,
    decision: status,
    createdAt: row.created_at || row.createdAt || Date.now(),
    signature: signature(detail)
  };
}

function groupFailures(failures = []) {
  const groups = new Map();
  failures.forEach((failure) => {
    const key = `${failure.actionType}:${failure.signature}:${tokens(failure.description).slice(0, 4).join('_')}`;
    const group = groups.get(key) || [];
    group.push(failure);
    groups.set(key, group);
  });
  return [...groups.values()];
}

export function analyzeFailurePatterns({ approvals = [], changes = [], minEvidence = 3 } = {}) {
  const failures = [
    ...approvals.map(normalizeApproval),
    ...changes.map(normalizeChange)
  ].filter(Boolean);
  return groupFailures(failures)
    .filter((group) => group.length >= minEvidence)
    .map((group) => ({
      ...lessonFor(group),
      evidence: group.map((item) => ({
        id: item.id,
        sourceType: item.sourceType,
        actionType: item.actionType,
        decision: item.decision,
        createdAt: item.createdAt
      }))
    }))
    .filter((rule) => rule.trigger.length >= 8 && rule.avoid.length >= 8 && rule.suggest.length >= 8);
}

export function ruleMatchesPrompt(rule = {}, prompt = '') {
  const promptTokens = new Set(tokens(prompt));
  const ruleTokens = tokens(`${rule.trigger} ${rule.category || ''}`);
  if (!promptTokens.size || !ruleTokens.length) return false;
  const overlap = ruleTokens.filter((token) => promptTokens.has(token)).length;
  return overlap >= Math.min(2, ruleTokens.length);
}

export function triggerKey(trigger = '') {
  return tokens(trigger).slice(0, 8).join(':') || clean(trigger).toLowerCase().slice(0, 80);
}
