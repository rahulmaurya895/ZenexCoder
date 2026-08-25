const STEP_ALIASES = {
  go: 'navigate',
  open: 'navigate',
  visit: 'navigate',
  fill: 'type',
  input: 'type',
  assert: 'verifyText',
  expect: 'verifyText',
  check: 'verifyText',
  screenshot: 'screenshot',
  snap: 'screenshot'
};

function splitQuoted(input = '') {
  const matches = String(input || '').match(/"[^"]*"|'[^']*'|\S+/g) || [];
  return matches.map((part) => part.replace(/^['"]|['"]$/g, ''));
}

function normalizeStep(raw = {}, index = 0) {
  if (typeof raw === 'string') {
    return parseScenario(raw)[0] || { id: `step-${index + 1}`, action: 'note', text: raw };
  }
  const action = STEP_ALIASES[raw.action] || raw.action || 'note';
  return {
    id: raw.id || `step-${index + 1}`,
    action,
    url: raw.url || '',
    selector: raw.selector || '',
    text: raw.text || raw.value || '',
    name: raw.name || raw.label || `step-${index + 1}`,
    timeoutMs: Number(raw.timeoutMs || 15000)
  };
}

export function parseScenario(text = '') {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line, index) => {
      const [command = '', ...rest] = splitQuoted(line);
      const action = STEP_ALIASES[command.toLowerCase()] || command.toLowerCase();
      const id = `step-${index + 1}`;

      if (action === 'navigate') {
        return { id, action, url: rest.join(' '), timeoutMs: 45000 };
      }
      if (action === 'click') {
        return { id, action, selector: rest.join(' '), timeoutMs: 15000 };
      }
      if (action === 'type') {
        const [selector, ...value] = rest;
        return { id, action, selector, text: value.join(' '), timeoutMs: 15000 };
      }
      if (action === 'verifyText') {
        return { id, action, text: rest.join(' '), timeoutMs: 15000 };
      }
      if (action === 'screenshot') {
        return { id, action, name: rest.join('-') || `shot-${index + 1}`, timeoutMs: 15000 };
      }
      if (action === 'wait') {
        return { id, action: 'waitForSelector', selector: rest.join(' '), timeoutMs: 15000 };
      }
      return { id, action: 'note', text: line, timeoutMs: 15000 };
    });
}

export function normalizeScenario(input = {}) {
  const steps = Array.isArray(input.steps) && input.steps.length
    ? input.steps.map(normalizeStep)
    : parseScenario(input.text || input.scenario || '');
  return {
    id: input.id || `scenario-${Date.now()}`,
    name: input.name || 'Synthetic QA Scenario',
    persona: input.persona || 'normal',
    baseUrl: input.baseUrl || '',
    allowProduction: Boolean(input.allowProduction),
    projectPath: input.projectPath || '',
    steps
  };
}
