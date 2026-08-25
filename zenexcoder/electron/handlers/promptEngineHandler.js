import { ipcMain } from 'electron';

export function optimizePromptPayload(rawPrompt = '', options = {}) {
  const cleanInput = String(rawPrompt || '').trim();
  if (!cleanInput) return { ok: false, originalPrompt: '', optimizedPrompt: '' };

  const startTime = Date.now();

  // If input is a short question or casual query, bypass heavy code generation blueprint tags
  const isQuestionOrCasual =
    cleanInput.length < 100 ||
    /^(hi|hello|hey|kya|kaise|can|how|what|why|is|do|does|can you|access|batao)\b/i.test(cleanInput) ||
    cleanInput.endsWith('?');

  if (isQuestionOrCasual && !/\b(build|create|write|implement|fix|make|code|generate)\b/i.test(cleanInput)) {
    return {
      ok: true,
      elapsedMs: Date.now() - startTime,
      originalPrompt: cleanInput,
      optimizedPrompt: cleanInput
    };
  }

  const framework = options.framework || 'React / Vite / Electron Node.js';
  const projectPath = options.projectPath || 'Active Workspace';

  const optimizedPrompt = [
    `<objective>`,
    cleanInput,
    `</objective>`,
    ``,
    `<context>`,
    `Framework / Tech Stack: ${framework}`,
    `Target Project Location: ${projectPath}`,
    `Engineering Workflow: Multi-Role Swarm (Architect -> Senior Dev -> QA -> SecOps)`,
    `</context>`,
    ``,
    `<constraints>`,
    `1. Production Readiness: Output 100% complete, fully implemented code without placeholders or omitted functions.`,
    `2. Path Integrity: Always specify exact relative file paths for proposed file modifications.`,
    `3. Fault Tolerance: Include defensive input validation, non-null checks, and graceful error boundaries.`,
    `</constraints>`,
    ``,
    `<reasoning_protocol>`,
    `Chain-of-Thought (CoT) Execution:`,
    `Step 1 (Architectural Breakdown): Deconstruct the user objective into modular components.`,
    `Step 2 (Implementation Details): Write complete, bug-free implementation files.`,
    `Step 3 (Verification Check): Verify syntax, API parameter contracts, and edge-case handling.`,
    `</reasoning_protocol>`,
    ``,
    `<output_format>`,
    `Format the output in structured markdown sections:`,
    `## 1. Architectural Blueprint`,
    `## 2. Implementation Files`,
    `## 3. Verification & Test Strategy`,
    `</output_format>`
  ].join('\n');

  const elapsedMs = Date.now() - startTime;

  return {
    ok: true,
    elapsedMs,
    originalPrompt: cleanInput,
    optimizedPrompt
  };
}

export function registerPromptEngineHandlers() {
  ipcMain.handle('prompt:optimize', async (_evt, { prompt, options }) => {
    return optimizePromptPayload(prompt, options);
  });
}
