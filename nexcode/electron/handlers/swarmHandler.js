import { BrowserWindow, ipcMain } from 'electron';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import { APPROVAL_NODE, PERSONAS, SWARM_HANDOFF_TARGETS, buildPersonaPrompt } from '../../src/utils/swarmPersonas.js';
import { ragContextForPrompt } from './vectorDbHandler.js';
import { ClusterOffloadError, isClusterOllamaEnabled, streamOllamaChatViaCluster } from './websocketClient.js';
import { learningContextForPrompt } from './learningHandler.js';

const activeRuns = new Map();
const shadowResultResolvers = new Map();

async function autoWritePlanFiles(executionPlan, projectPath) {
  let targetDir = projectPath;
  if (!targetDir) {
    const homeDir = os.homedir();
    const oneDriveDesktop = path.join(homeDir, 'OneDrive', 'Desktop');
    targetDir = existsSync(oneDriveDesktop) ? oneDriveDesktop : path.join(homeDir, 'Desktop');
  }
  if (!executionPlan?.steps?.length) return;

  for (const step of executionPlan.steps) {
    const isFileWrite = ['file_write', 'create_file', 'write_file'].includes(step.actionType) || (step.filePath && step.content != null && String(step.content).trim());
    if (isFileWrite && step.filePath) {
      try {
        const fullPath = path.isAbsolute(step.filePath) ? step.filePath : path.join(targetDir, step.filePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, step.content || '', 'utf8');
        sendToAll('file:saved', { filePath: fullPath, content: step.content || '', savedAt: Date.now() });
      } catch (err) {
        console.warn('Swarm auto-write error:', err.message);
      }
    } else if (step.actionType === 'create_directory' && step.filePath) {
      try {
        const fullPath = path.isAbsolute(step.filePath) ? step.filePath : path.join(targetDir, step.filePath);
        await fs.mkdir(fullPath, { recursive: true });
      } catch (err) {
        console.warn('Swarm mkdir error:', err.message);
      }
    }
  }
}

const DEFAULT_MODELS = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-sonnet-latest',
  google: 'gemini-3.6-flash',
  groq: 'llama-3.3-70b-versatile',
  ollama: 'llama3.2:3b'
};

function sendToAll(channel, payload) {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(channel, payload);
  });
}

function notify(title, body, type = 'info') {
  sendToAll('notify:show', {
    id: `swarm-note-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title,
    body,
    message: body,
    type,
    timestamp: Date.now()
  });
}

function resolveShadowResult(taskId, consensus) {
  const pending = shadowResultResolvers.get(taskId);
  if (!pending) return;
  clearTimeout(pending.timeout);
  shadowResultResolvers.delete(taskId);
  pending.resolve(consensus);
}

function rejectShadowResult(taskId, error) {
  const pending = shadowResultResolvers.get(taskId);
  if (!pending) return;
  clearTimeout(pending.timeout);
  shadowResultResolvers.delete(taskId);
  pending.reject(error instanceof Error ? error : new Error(String(error || 'Shadow swarm failed.')));
}

function emitSwarm(payload, channel, eventPayload) {
  if (!payload.isShadowRun) {
    sendToAll(channel, eventPayload);
  }
}

function normalizeProvider(provider) {
  return provider || 'ollama';
}

function compactText(value, limit = 12000) {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '', null, 2);
  return text.length > limit ? `${text.slice(0, limit)}\n... [trimmed]` : text;
}

function extractJsonCandidates(text = '') {
  const candidates = [];
  const trimmed = text.trim();
  if (trimmed) candidates.push(trimmed);

  const fenced = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((match) => match[1]?.trim()).filter(Boolean);
  candidates.push(...fenced);

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  return [...new Set(candidates)];
}

function normalizeHandoffTarget(value) {
  const raw = String(value || '').trim().toLowerCase().replaceAll('-', '_').replaceAll(' ', '_');
  if (['approval', 'user', 'userapproval', 'user_approve'].includes(raw)) return 'user_approval';
  if (['security', 'security_qa', 'reviewer'].includes(raw)) return 'secops';
  if (raw === 'developer') return 'coder';
  return raw;
}

function repairJson(str = '') {
  try {
    return JSON.parse(str);
  } catch {
    try {
      const sanitized = str
        .replace(/[\u0000-\u001F]+/g, (match) => (match === '\n' ? '\\n' : match === '\r' ? '\\r' : match === '\t' ? '\\t' : ''))
        .replace(/,\s*([\]}])/g, '$1');
      return JSON.parse(sanitized);
    } catch {
      return null;
    }
  }
}

export function parseHandoff(text = '') {
  for (const candidate of extractJsonCandidates(text)) {
    const parsed = repairJson(candidate);
    if (!parsed || typeof parsed !== 'object') continue;
    const handoffTo = normalizeHandoffTarget(parsed.handoff_to || parsed.handoffTo || parsed.next || parsed.next_agent);
    if (!SWARM_HANDOFF_TARGETS.includes(handoffTo)) continue;
    return {
      ...parsed,
      analysis: typeof parsed.analysis === 'string' ? parsed.analysis : compactText(parsed.analysis || ''),
      instructions: typeof parsed.instructions === 'string' ? parsed.instructions : compactText(parsed.instructions || ''),
      handoff_to: handoffTo
    };
  }

  if (text.trim()) {
    const lower = text.toLowerCase();
    let handoffTo = 'qa';
    if (lower.includes('user_approval') || lower.includes('approve') || lower.includes('ready for approval') || lower.includes('final review')) {
      handoffTo = 'user_approval';
    } else if (lower.includes('secops') || lower.includes('security')) {
      handoffTo = 'secops';
    } else if (lower.includes('coder') || lower.includes('developer') || lower.includes('fix')) {
      handoffTo = 'coder';
    }
    return {
      analysis: compactText(text, 2000),
      instructions: 'Proceeding with extracted agent suggestions.',
      handoff_to: handoffTo
    };
  }

  return null;
}


function openAiMessages(messages = [], systemPrompt = '') {
  return [
    { role: 'system', content: systemPrompt },
    ...messages.map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: compactText(message.content || '')
    }))
  ];
}

function anthropicMessages(messages = []) {
  return messages.map((message) => ({
    role: message.role === 'assistant' ? 'assistant' : 'user',
    content: compactText(message.content || '')
  }));
}

function geminiContents(messages = []) {
  return messages.map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: compactText(message.content || '') }]
  }));
}

async function requestJson(response, provider) {
  if (!response.ok) {
    throw new Error((await response.text()) || `${provider} request failed with ${response.status}`);
  }
  return response.json();
}

async function callOpenAiCompatible(payload, signal, config) {
  if (!payload.apiKey) {
    throw new Error(config.missingKeyMessage);
  }
  const json = await requestJson(
    await fetch(config.endpoint, {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${payload.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: payload.modelId || config.defaultModel,
        messages: openAiMessages(payload.messages, payload.systemPrompt),
        temperature: payload.temperature ?? 0.25,
        [config.maxTokensKey]: payload.maxTokens || 4096
      })
    }),
    config.name
  );
  return json.choices?.[0]?.message?.content || '';
}

async function callAnthropic(payload, signal) {
  if (!payload.apiKey) {
    throw new Error('Add your Anthropic API key in Settings.');
  }
  const json = await requestJson(
    await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal,
      headers: {
        'x-api-key': payload.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: payload.modelId || DEFAULT_MODELS.anthropic,
        system: payload.systemPrompt || '',
        messages: anthropicMessages(payload.messages),
        max_tokens: payload.maxTokens || 4096,
        temperature: payload.temperature ?? 0.25
      })
    }),
    'Anthropic'
  );
  return (json.content || []).map((part) => part.text || '').join('');
}

async function callGemini(payload, signal) {
  if (!payload.apiKey) {
    throw new Error('Add your Google API key in Settings.');
  }
  const model = payload.modelId || DEFAULT_MODELS.google;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(payload.apiKey)}`;
  const json = await requestJson(
    await fetch(endpoint, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: geminiContents(payload.messages),
        generationConfig: {
          temperature: payload.temperature ?? 0.25,
          maxOutputTokens: payload.maxTokens || 4096
        },
        systemInstruction: payload.systemPrompt ? { parts: [{ text: payload.systemPrompt }] } : undefined
      })
    }),
    'Gemini'
  );
  return (json.candidates || [])
    .flatMap((candidate) => candidate.content?.parts || [])
    .map((part) => part.text || '')
    .join('');
}

async function callOllama(payload, signal) {
  const body = {
    model: payload.modelId || DEFAULT_MODELS.ollama,
    messages: openAiMessages(payload.messages, payload.systemPrompt),
    stream: false,
    options: {
      temperature: payload.temperature ?? 0.25,
      num_predict: payload.maxTokens || 4096
    }
  };
  if (isClusterOllamaEnabled({ personaId: payload.personaId })) {
    try {
      const json = await streamOllamaChatViaCluster({
        body,
        signal,
        taskContext: { personaId: payload.personaId, source: 'swarm' }
      });
      return json.message?.content || json.response || '';
    } catch (error) {
      if (!(error instanceof ClusterOffloadError) && error.code !== 'CLUSTER_OFFLOAD_DROPPED') {
        throw error;
      }
    }
  }
  const response = await fetch('http://localhost:11434/api/chat', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const json = await requestJson(response, 'Ollama');
  return json.message?.content || json.response || '';
}

async function callModel(payload, signal) {
  const provider = normalizeProvider(payload.provider);
  if (provider === 'openai') {
    return callOpenAiCompatible(payload, signal, {
      name: 'OpenAI',
      endpoint: 'https://api.openai.com/v1/chat/completions',
      defaultModel: DEFAULT_MODELS.openai,
      maxTokensKey: 'max_tokens',
      missingKeyMessage: 'Add your OpenAI API key in Settings.'
    });
  }
  if (provider === 'groq') {
    return callOpenAiCompatible(payload, signal, {
      name: 'Groq',
      endpoint: 'https://api.groq.com/openai/v1/chat/completions',
      defaultModel: DEFAULT_MODELS.groq,
      maxTokensKey: 'max_completion_tokens',
      missingKeyMessage: 'Add your Groq API key in Settings.'
    });
  }
  if (provider === 'anthropic') return callAnthropic(payload, signal);
  if (provider === 'google') return callGemini(payload, signal);
  return callOllama(payload, signal);
}

async function callModelWithRetry(payload, signal) {
  const primary = normalizeProvider(payload.provider);
  const providersToTry = [];
  providersToTry.push({ provider: primary, apiKey: payload.apiKey, modelId: payload.modelId });

  const fallbackOrder = ['google', 'groq', 'openai', 'anthropic', 'ollama'].filter((p) => p !== primary);
  for (const p of fallbackOrder) {
    const key = payload.apiKeys?.[p] || (p === primary ? payload.apiKey : '');
    if (p === 'ollama' || key) {
      providersToTry.push({ provider: p, apiKey: key, modelId: DEFAULT_MODELS[p] });
    }
  }

  let lastError;
  for (let i = 0; i < providersToTry.length; i += 1) {
    const candidate = providersToTry[i];
    try {
      const activePayload = { ...payload, provider: candidate.provider, apiKey: candidate.apiKey, modelId: candidate.modelId || payload.modelId };
      return await callModel(activePayload, signal);
    } catch (err) {
      lastError = err;
      if (signal?.aborted) throw err;

      const isRateLimit = /429|RESOURCE_EXHAUSTED|quota|rate limit|rate_limit_exceeded|tokens per minute|Limit \d+/i.test(err.message);
      const hasNext = i < providersToTry.length - 1;

      if (isRateLimit && hasNext) {
        const nextProvider = providersToTry[i + 1].provider;
        console.warn(`[Swarm Auto-Fallback] Provider ${candidate.provider} rate-limited. Instantly switching to ${nextProvider} (0ms pause)...`);
        notify('Provider Auto-Switch', `Switched from ${candidate.provider} to ${nextProvider} instantly to avoid rate-limit pause.`, 'info');
        continue;
      }
      if (hasNext && !String(err.message || '').includes('Settings')) {
        continue;
      }
    }
  }
  throw lastError || new Error('All candidate Swarm AI models failed.');
}

function compactHandoffForHistory(handoff = {}) {
  if (!handoff) return {};
  const steps = Array.isArray(handoff.execution_plan?.steps)
    ? handoff.execution_plan.steps.map((s) => ({ title: s.title, filePath: s.filePath || s.path, actionType: s.actionType }))
    : undefined;
  const files = Array.isArray(handoff.files)
    ? handoff.files.map((f) => ({ filePath: f.filePath || f.path, title: f.title || f.description }))
    : undefined;
  return {
    handoff_to: handoff.handoff_to,
    analysis: compactText(handoff.analysis || '', 200),
    instructions: compactText(handoff.instructions || '', 150),
    files_summary: files,
    steps_summary: steps
  };
}

function buildTurnMessages({ prompt, history, persona, instructions, invalidFormat = false, provider = '' }) {
  const isStrictTpm = normalizeProvider(provider) === 'groq';
  const historySlice = isStrictTpm ? history.slice(-2) : history.slice(-4);
  const discussion = historySlice.map((item) => {
    const speaker = PERSONAS[item.personaId]?.name || item.personaId;
    return `${speaker} said:\n${compactText(item.content || '', 200)}\nHandoff: ${JSON.stringify(compactHandoffForHistory(item.handoff))}`;
  });
  return [
    { role: 'user', content: `Original user task:\n${compactText(prompt || '', 500)}` },
    ...discussion.map((content) => ({ role: 'assistant', content })),
    {
      role: 'user',
      content: [
        invalidFormat ? "Invalid format. You must output JSON with 'handoff_to'." : '',
        `Current speaker: ${persona.name}`,

        `Current instructions:\n${instructions || prompt}`,
        'Return the strict JSON handoff now.'
      ].filter(Boolean).join('\n\n')
    }
  ];
}


async function runPersonaTurn({ payload, taskId, personaId, instructions, history, signal, invalidFormat = false }) {
  const persona = PERSONAS[personaId];
  const systemPrompt = buildPersonaPrompt(persona, {
    projectPath: payload.projectPath,
    ragContext: personaId === 'architect' ? payload.ragContext : '',
    learnedLessons: personaId === 'architect' ? payload.learnedLessons : '',
    fileTree: payload.projectContext?.fileTree,
    openFiles: payload.projectContext?.openFiles
  });
  const raw = await callModelWithRetry(
    {
      provider: payload.provider,
      modelId: payload.modelId,
      apiKey: payload.apiKey,
      personaId,
      temperature: payload.temperature ?? 0.25,
      maxTokens: payload.maxTokens || 4096,
      systemPrompt,
      messages: buildTurnMessages({
        prompt: payload.prompt,
        history,
        persona,
        instructions,
        invalidFormat,
        provider: payload.provider
      })
    },
    signal
  );
  const handoff = parseHandoff(raw);

  if (!handoff) {
    return { raw, handoff: null };
  }
  const content = [
    handoff.analysis,
    handoff.instructions ? `Next: ${handoff.instructions}` : ''
  ].filter(Boolean).join('\n\n');
  emitSwarm(payload, 'swarm:internal-msg', {
    taskId,
    personaId,
    content: content || compactText(raw, 4000),
    handoff,
    raw,
    createdAt: Date.now()
  });
  return { raw, handoff, content };
}

function resolveProjectPath(projectPath, filePath) {
  if (!filePath || path.isAbsolute(filePath) || !projectPath) return filePath || '';
  return path.join(projectPath, filePath);
}

function normalizeAgentStep(step = {}, index, projectPath) {
  const filePath = resolveProjectPath(projectPath, step.filePath || step.path);
  return {
    id: step.id || `swarm-step-${index + 1}-${Date.now()}`,
    title: step.title || (filePath ? `Update ${path.basename(filePath)}` : step.command ? 'Run command' : `Swarm step ${index + 1}`),
    description: step.description || step.instruction || '',
    actionType: step.actionType || (step.command ? 'terminal_run' : filePath && step.content != null ? 'file_write' : 'file_read'),
    command: step.command || '',
    filePath,
    content: step.content ?? '',
    files: step.files || (filePath ? [filePath] : []),
    status: 'pending',
    output: '',
    durationMs: 0
  };
}

function planFromHandoff(handoff, payload, taskId) {
  const explicitSteps = Array.isArray(handoff.execution_plan?.steps) ? handoff.execution_plan.steps : [];
  const fileSteps = Array.isArray(handoff.files)
    ? handoff.files.map((file) => ({
        title: file.title || `Write ${file.filePath || file.path || 'file'}`,
        description: file.description || 'Swarm-generated file change',
        actionType: 'file_write',
        filePath: file.filePath || file.path,
        content: file.content ?? file.code ?? ''
      }))
    : [];
  const steps = (explicitSteps.length ? explicitSteps : fileSteps).map((step, index) =>
    normalizeAgentStep(step, index, payload.projectPath)
  );
  if (!steps.length) {
    steps.push(
      normalizeAgentStep(
        {
          title: 'Review swarm consensus',
          description: handoff.instructions || handoff.analysis || 'Swarm completed. No executable file or command steps were returned.',
          actionType: 'file_read'
        },
        0,
        payload.projectPath
      )
    );
  }
  return {
    id: `swarm-plan-${taskId}`,
    title: handoff.execution_plan?.title || `Swarm plan: ${compactText(payload.prompt, 70)}`,
    steps,
    currentStepIndex: 0
  };
}

function approvalForConsensus({ taskId, handoff, executionPlan, payload }) {
  const summary = handoff.instructions || handoff.analysis || 'Swarm consensus is ready.';
  return {
    id: `swarm-approval-${taskId}`,
    actionType: 'swarm_consensus',
    title: 'Swarm consensus ready',
    description: [
      summary,
      '',
      `Plan steps: ${executionPlan.steps.length}`,
      'Approve to start the normal ZezenexCoderr agent approval/progress flow.'
    ].join('\n'),
    riskLevel: executionPlan.steps.some((step) => ['file_delete', 'git_push', 'git_destructive'].includes(step.actionType)) ? 'high' : 'medium',
    executionPlan,
    runOptions: {
      cwd: payload.projectPath,
      permissions: payload.permissions || {}
    },
    createdAt: Date.now()
  };
}

function codeFromConsensus(consensus = {}) {
  const direct = consensus.finalCode || consensus.final_code || '';
  if (direct) return direct;
  const fileStep = (consensus.executionPlan?.steps || []).find((step) => step.content);
  return fileStep?.content || consensus.summary || '';
}

function emitShadowCacheReady(payload, consensus) {
  const result = {
    code: codeFromConsensus(consensus),
    explanation: consensus.summary || 'Predictive swarm result is ready.',
    executionPlan: consensus.executionPlan,
    handoff: consensus.handoff,
    history: consensus.history,
    provider: consensus.provider,
    modelId: consensus.modelId,
    intent: payload.intent || {},
    filePath: payload.intent?.filePath || payload.filePath || '',
    lineNumber: payload.intent?.lineNumber || null,
    prompt: payload.prompt,
    timestamp: Date.now()
  };
  if (payload.triggerHash) {
    sendToAll('speculative:cache-ready', {
      triggerHash: payload.triggerHash,
      result,
      createdAt: Date.now()
    });
  }
  resolveShadowResult(consensus.taskId, consensus);
}

async function runSwarm(taskId, payload, controller) {
  const maxIterations = Number(payload.maxIterations || payload.max_iterations || 6);

  const history = [];
  let personaId = 'architect';
  let instructions = payload.prompt;

  try {
    payload.ragContext = await ragContextForPrompt(payload.prompt, {
      projectPath: payload.projectPath,
      codeLimit: 5,
      externalLimit: 3,
      signal: controller.signal
    });
    payload.learnedLessons = learningContextForPrompt(payload.prompt);
    if (payload.learnedLessons) {
      emitSwarm(payload, 'swarm:internal-msg', {
        taskId,
        personaId: 'architect',
        content: 'Loaded self-learning rules for the Architect prompt.',
        handoff: { handoff_to: 'architect' },
        raw: payload.learnedLessons,
        createdAt: Date.now()
      });
    }
    if (payload.ragContext) {
      emitSwarm(payload, 'swarm:internal-msg', {
        taskId,
        personaId: 'architect',
        content: 'Retrieved semantic knowledge graph context for the Architect.',
        handoff: { handoff_to: 'architect' },
        raw: payload.ragContext,
        createdAt: Date.now()
      });
    }
    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      if (controller.signal.aborted) throw new Error('Swarm halted.');

      if (iteration > 0) {
        const isStrictTpm = normalizeProvider(payload.provider) === 'groq';
        const throttleMs = isStrictTpm ? 5500 : 2500;
        await new Promise((resolve) => setTimeout(resolve, throttleMs));
      }

      const persona = PERSONAS[personaId];

      if (!persona) throw new Error(`Unknown swarm persona: ${personaId}`);
      emitSwarm(payload, 'swarm:agent-turn', {
        taskId,
        activePersonaId: personaId,
        iteration,
        maxIterations,
        modelId: payload.modelId,
        provider: normalizeProvider(payload.provider),
        createdAt: Date.now()
      });

      let turn = await runPersonaTurn({
        payload,
        taskId,
        personaId,
        instructions,
        history,
        signal: controller.signal
      });

      if (!turn.handoff) {
        emitSwarm(payload, 'swarm:internal-msg', {
          taskId,
          personaId,
          content: 'Invalid JSON received. Retrying once with strict JSON format.',
          handoff: null,
          raw: turn.raw,
          createdAt: Date.now()
        });
        turn = await runPersonaTurn({
          payload,
          taskId,
          personaId,
          instructions,
          history,
          signal: controller.signal,
          invalidFormat: true
        });
      }

      if (!turn.handoff) {
        throw new Error('Swarm could not parse a valid JSON handoff after retry.');
      }

      history.push({
        personaId,
        content: turn.content || compactText(turn.raw, 4000),
        handoff: turn.handoff,
        createdAt: Date.now()
      });



      if (turn.handoff.handoff_to === APPROVAL_NODE.id) {
        const executionPlan = planFromHandoff(turn.handoff, payload, taskId);
        await autoWritePlanFiles(executionPlan, payload.projectPath);
        const consensus = {
          taskId,
          provider: normalizeProvider(payload.provider),
          modelId: payload.modelId,
          finalCode: turn.handoff.finalCode || turn.handoff.final_code || turn.handoff.instructions || '',
          summary: turn.handoff.analysis || turn.handoff.instructions || 'Swarm consensus is ready.',
          executionPlan,
          handoff: turn.handoff,
          history,
          createdAt: Date.now()
        };
        emitSwarm(payload, 'swarm:agent-turn', {
          taskId,
          activePersonaId: APPROVAL_NODE.id,
          iteration,
          maxIterations,
          createdAt: Date.now()
        });
        if (payload.isShadowRun) {
          emitShadowCacheReady(payload, consensus);
        } else {
          sendToAll('swarm:consensus', consensus);
          sendToAll('agent:approval-pending', approvalForConsensus({ taskId, handoff: turn.handoff, executionPlan, payload }));
          notify('Swarm consensus ready', 'Files written and plan ready in Agent Run panel.', 'success');
        }
        return;
      }

      personaId = turn.handoff.handoff_to;
      instructions = turn.handoff.instructions || turn.handoff.analysis || instructions;
    }

    // Auto-finalize if valid files/code exist in history instead of abrupt halting
    const lastValidTurn = [...history].reverse().find((h) => h.handoff && (h.handoff.files?.length || h.handoff.execution_plan || h.handoff.finalCode));
    if (lastValidTurn) {
      const executionPlan = planFromHandoff(lastValidTurn.handoff, payload, taskId);
      await autoWritePlanFiles(executionPlan, payload.projectPath);
      const consensus = {
        taskId,
        provider: normalizeProvider(payload.provider),
        modelId: payload.modelId,
        finalCode: lastValidTurn.handoff.finalCode || lastValidTurn.handoff.final_code || lastValidTurn.handoff.instructions || '',
        summary: lastValidTurn.handoff.analysis || lastValidTurn.handoff.instructions || 'Swarm consensus is ready.',
        executionPlan,
        handoff: lastValidTurn.handoff,
        history,
        createdAt: Date.now()
      };
      sendToAll('swarm:consensus', consensus);
      sendToAll('agent:approval-pending', approvalForConsensus({ taskId, handoff: lastValidTurn.handoff, executionPlan, payload }));
      notify('Swarm consensus ready', 'Files written and plan ready in Agent Run panel.', 'success');
      return;
    }


    const message = 'SecOps and Coder cannot agree. Please intervene.';
    emitSwarm(payload, 'swarm:halt', { taskId, reason: 'max_iterations', message, createdAt: Date.now() });
    if (payload.isShadowRun) {
      rejectShadowResult(taskId, new Error(message));
    }
    if (!payload.isShadowRun) notify('Swarm halted', message, 'warning');

  } catch (error) {
    const message = controller.signal.aborted ? 'Swarm halted.' : error.message;
    emitSwarm(payload, controller.signal.aborted ? 'swarm:halt' : 'swarm:error', {
      taskId,
      reason: controller.signal.aborted ? 'user_halt' : 'error',
      message,
      createdAt: Date.now()
    });
    if (!payload.isShadowRun) {
      notify(controller.signal.aborted ? 'Swarm halted' : 'Swarm error', message, controller.signal.aborted ? 'warning' : 'error');
    } else {
      rejectShadowResult(taskId, new Error(message));
    }
  } finally {
    activeRuns.delete(taskId);
  }
}

export function stopAllSwarms(reason = 'App is closing.') {
  for (const [taskId, controller] of activeRuns.entries()) {
    controller.abort(reason);
    rejectShadowResult(taskId, new Error(reason));
    sendToAll('swarm:halt', { taskId, reason: 'shutdown', message: reason, createdAt: Date.now() });
  }
  activeRuns.clear();
}

export function isSwarmActive() {
  return activeRuns.size > 0;
}

export function startSwarmRun(payload = {}) {
  if (!payload.prompt?.trim()) {
    throw new Error('Swarm prompt is required.');
  }
  const taskId = payload.taskId || crypto.randomUUID();
  const controller = new AbortController();
  activeRuns.set(taskId, controller);
  runSwarm(taskId, payload, controller);
  return { ok: true, taskId };
}

export function runShadowSwarmForResult(payload = {}, options = {}) {
  const taskId = payload.taskId || crypto.randomUUID();
  const timeoutMs = Math.max(30000, Number(options.timeoutMs || payload.timeoutMs || 900000));
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      abortSwarmRun(taskId, 'Shadow swarm timed out.');
      rejectShadowResult(taskId, new Error('Shadow swarm timed out.'));
    }, timeoutMs);
    shadowResultResolvers.set(taskId, { resolve, reject, timeout });
    try {
      startSwarmRun({ ...payload, taskId, isShadowRun: true });
    } catch (error) {
      rejectShadowResult(taskId, error);
    }
  });
}

export function abortSwarmRun(taskId, reason = 'Swarm halted.') {
  if (taskId) {
    activeRuns.get(taskId)?.abort(reason);
    rejectShadowResult(taskId, new Error(reason));
    return { ok: true };
  }
  for (const [id, controller] of activeRuns.entries()) {
    controller.abort(reason);
    rejectShadowResult(id, new Error(reason));
  }
  return { ok: true };
}

export function registerSwarmHandlers() {
  ipcMain.handle('swarm:start-task', async (_event, payload = {}) => {
    return startSwarmRun(payload);
  });

  ipcMain.handle('swarm:halt', async (_event, payload = {}) => {
    if (payload.taskId) {
      abortSwarmRun(payload.taskId, 'User halted swarm.');
      return { ok: true };
    }
    stopAllSwarms('User halted all swarms.');
    return { ok: true };
  });
}
