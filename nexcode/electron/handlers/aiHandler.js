import { BrowserWindow, ipcMain } from 'electron';
import crypto from 'node:crypto';
import { requestBrowserActionApproval, requestComputerActionApproval, requestMcpToolApproval } from './agentHandler.js';
import { mcpCallTool, mcpConnectedToolEntries } from './mcpHandler.js';
import {
  browserClick,
  browserExecuteWebAiChat,
  browserGetDOM,
  browserGetScreenshot,
  browserGetState,
  browserNavigate,
  browserType
} from './browserHandler.js';
import {
  computerAllowsUnattended,
  computerGetScreen,
  computerGetStatus,
  computerIsEnabled,
  computerKeyboardKeys,
  computerKeyboardType,
  computerMouseAction
} from './computerHandler.js';
import { ClusterOffloadError, isClusterOllamaEnabled, streamOllamaChatViaCluster } from './websocketClient.js';
import { formatForAnthropic, formatForGemini, formatForOpenAI, namespacedMcpToolName } from '../../src/utils/mcpToolMapper.js';
import { initAuditLogHandler, appendAuditLog } from './auditLogHandler.js';
import { enforcePolicies } from './policyEnforcer.js';
import { getOllamaHost } from './ollamaHandler.js';

const controllers = new Map();
const MAX_MCP_TOOL_ROUNDS = 5;

export function abortAllAiStreams(reason = 'Generation aborted.') {
  for (const controller of controllers.values()) {
    controller.abort(reason);
  }
  controllers.clear();
}

const DEFAULT_MODELS = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-sonnet-latest',
  google: 'gemini-3.6-flash',
  groq: 'llama-3.3-70b-versatile',
  ollama: 'llama3.2:3b'
};

const BROWSER_TOOLS = [
  {
    name: 'browser_execute_web_ai',
    description: 'Send a coding prompt to Google Gemini Web (or ChatGPT Web) in the stealth managed browser, wait for the live streaming response to finish on screen, and extract the generated code and text.',
    schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Web AI URL, default https://gemini.google.com/app' },
        prompt: { type: 'string', description: 'The prompt/request to send to Gemini Web or ChatGPT Web.' }
      },
      required: ['prompt']
    }
  },
  {
    name: 'browser_navigate',
    description: 'Open a URL in ZenexCoder managed Chromium and wait for page DOM to load. Note: For Google Gemini AI, use "https://gemini.google.com/app" (do NOT use gemini.com which is a crypto exchange).',
    schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Absolute URL or domain to open. For Google Gemini, use https://gemini.google.com/app.' }
      },
      required: ['url']
    }
  },
  {
    name: 'browser_click',
    description: 'Click an element in the managed browser. Use an id from browser_read_page or a CSS selector.',
    schema: {
      type: 'object',
      properties: {
        element_id_or_selector: { type: 'string', description: 'Element id from browser_read_page, DOM id, or CSS selector.' }
      },
      required: ['element_id_or_selector']
    }
  },
  {
    name: 'browser_type',
    description: 'Fill text into an input, textarea, or editable element in the managed browser.',
    schema: {
      type: 'object',
      properties: {
        element_id_or_selector: { type: 'string', description: 'Element id from browser_read_page, DOM id, or CSS selector.' },
        text: { type: 'string', description: 'Text to enter.' }
      },
      required: ['element_id_or_selector', 'text']
    }
  },
  {
    name: 'browser_read_page',
    description: 'Read the current page as a compact list of visible text, links, buttons, inputs, and selectors.',
    schema: {
      type: 'object',
      properties: {}
    }
  }
];

const BROWSER_TOOL_NAMES = new Set(BROWSER_TOOLS.map((tool) => tool.name));
const BROWSER_OPENAI_TOOLS = BROWSER_TOOLS.map((tool) => ({
  type: 'function',
  function: {
    name: tool.name,
    description: tool.description,
    parameters: tool.schema
  }
}));
const BROWSER_ANTHROPIC_TOOLS = BROWSER_TOOLS.map((tool) => ({
  name: tool.name,
  description: tool.description,
  input_schema: tool.schema
}));
const BROWSER_GEMINI_TOOLS = BROWSER_TOOLS.map((tool) => ({
  name: tool.name,
  description: tool.description,
  parameters: tool.schema
}));

const COMPUTER_TOOLS = [
  {
    name: 'computer_screenshot',
    description: 'Take a compressed screenshot of the primary display and return base64 JPEG plus screen dimensions.',
    schema: { type: 'object', properties: {} }
  },
  {
    name: 'computer_mouse_action',
    description: 'Move or click the host OS mouse at exact screen coordinates.',
    schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['move', 'click', 'double_click'] },
        x: { type: 'number' },
        y: { type: 'number' },
        button: { type: 'string', enum: ['left', 'right', 'middle'] }
      },
      required: ['action']
    }
  },
  {
    name: 'computer_keyboard_type',
    description: 'Type text into the currently focused desktop application.',
    schema: {
      type: 'object',
      properties: {
        text: { type: 'string' }
      },
      required: ['text']
    }
  },
  {
    name: 'computer_keyboard_shortcut',
    description: 'Press a keyboard shortcut such as ["Control","C"] or ["Alt","Tab"].',
    schema: {
      type: 'object',
      properties: {
        keys: { type: 'array', items: { type: 'string' } }
      },
      required: ['keys']
    }
  }
];

const COMPUTER_TOOL_NAMES = new Set(COMPUTER_TOOLS.map((tool) => tool.name));
const COMPUTER_OPENAI_TOOLS = COMPUTER_TOOLS.map((tool) => ({
  type: 'function',
  function: {
    name: tool.name,
    description: tool.description,
    parameters: tool.schema
  }
}));
const COMPUTER_ANTHROPIC_TOOLS = COMPUTER_TOOLS.map((tool) => ({
  name: tool.name,
  description: tool.description,
  input_schema: tool.schema
}));
const COMPUTER_GEMINI_TOOLS = COMPUTER_TOOLS.map((tool) => ({
  name: tool.name,
  description: tool.description,
  parameters: tool.schema
}));

function emit(event, type, requestId, payload) {
  event.sender.send(`ai:stream:${type}:${requestId}`, payload);
}

function sendToAll(channel, payload) {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(channel, payload);
  });
}

function providerName(provider) {
  return provider || 'ollama';
}

function messageContentText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (!part || typeof part !== 'object') return '';
        if (typeof part.text === 'string') return part.text;
        if (typeof part.content === 'string') return part.content;
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  if (content && typeof content === 'object') {
    if (typeof content.text === 'string') return content.text;
    if (typeof content.content === 'string') return content.content;
  }
  return '';
}

function toOpenAiMessages(messages = [], attachments = []) {
  const safeMessages = messages.map((message) => ({
    ...message,
    content: messageContentText(message.content)
  }));
  if (!attachments.length) {
    return safeMessages;
  }
  const last = safeMessages[safeMessages.length - 1] || { role: 'user', content: '' };
  const attachmentSummary = attachments
    .filter((item) => item.name || item.filePath)
    .map((item) => item.name || item.filePath)
    .slice(0, 4)
    .join(', ');
  const suffix = attachmentSummary ? `\n\nAttachments: ${attachmentSummary}` : '\n\nAttachments included.';
  return [...safeMessages.slice(0, -1), { ...last, content: `${last.content || ''}${suffix}` }];
}

function toAnthropicMessages(messages = [], attachments = []) {
  const mapped = messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: messageContentText(message.content)
    }));
  if (attachments.length && mapped.length) {
    const last = mapped[mapped.length - 1];
    last.content = [
      ...attachments
        .filter((item) => item.base64)
        .map((item) => ({
          type: 'image',
          source: {
            type: 'base64',
            media_type: item.mimeType || 'image/png',
            data: item.base64
          }
        })),
      { type: 'text', text: typeof last.content === 'string' ? last.content : '' }
    ];
  }
  return mapped;
}

function toGeminiContents(messages = [], attachments = []) {
  const contents = messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: messageContentText(message.content) }]
    }));
  if (attachments.length && contents.length) {
    contents[contents.length - 1].parts.push(
      ...attachments
        .filter((item) => item.base64)
        .map((item) => ({
          inlineData: {
            mimeType: item.mimeType || 'image/png',
            data: item.base64
          }
        }))
    );
  }
  return contents;
}

function toolSystemContext(mcpToolCount = 0, includeBrowser = false, includeComputer = false) {
  const sections = [
    [
      'OPERATIONAL DIRECTIVE & INTENT ROUTING:',
      '1. Conversational Queries: For greetings ("hi", "hello", "hey"), explanations, general questions, or coding help that does NOT explicitly ask to visit a website or control the desktop, DO NOT call any tools. Reply directly with clear, markdown-formatted text.',
      '2. Fast Web Search: When looking up syntax errors, API documentation, or code examples, ALWAYS use "web_search_fast" first instead of heavy browser navigation.',
      '3. Agent Roles: You act as a multi-role software engineer (Architect, Developer, QA, SecOps). Always structure your coding responses with: Plan -> File Changes -> Verification.',
      '4. Execution Safety: When creating files or writing code, specify exact relative file paths in project directory.'
    ].join('\n')
  ];
  if (mcpToolCount) {
    sections.push([
      'You have access to external tools via the Model Context Protocol (MCP).',
      'Tool names are prefixed with their server ID. Use them when necessary.',
      'Before a tool executes, ZenexCoder may ask the user for approval.'
    ].join(' '));
  }
  if (includeBrowser) {
    sections.push([
      'You have access to a web browser.',
      "Use 'browser_navigate' to open URLs ONLY when the user explicitly asks to visit a web page or search the web.",
      'Always read the page before interacting.'
    ].join(' '));
  }
  if (includeComputer) {
    sections.push([
      'You have full desktop access through explicit Computer Use tools.',
      "Use 'computer_screenshot' to view the screen and find exact coordinates.",
      'Move the mouse to those coordinates, then click. Type carefully. If you lose track, take another screenshot.'
    ].join(' '));
  }
  return sections.join('\n\n');
}

function appendSystemContext(systemPrompt = '', mcpToolCount = 0, includeBrowser = false, includeComputer = false) {
  const context = toolSystemContext(mcpToolCount, includeBrowser, includeComputer);
  return context ? `${systemPrompt || ''}\n\n${context}`.trim() : systemPrompt;
}

function appendOpenAiSystemContext(messages = [], mcpToolCount = 0, includeBrowser = false, includeComputer = false) {
  const context = toolSystemContext(mcpToolCount, includeBrowser, includeComputer);
  if (!context) return messages;
  const next = [...messages];
  const index = next.findIndex((message) => message.role === 'system');
  if (index === -1) {
    return [{ role: 'system', content: context }, ...next];
  }
  next[index] = {
    ...next[index],
    content: `${next[index].content || ''}\n\n${context}`.trim()
  };
  return next;
}

function groupedConnectedMcpTools() {
  const grouped = new Map();
  const registry = new Map();
  for (const entry of mcpConnectedToolEntries()) {
    const list = grouped.get(entry.serverId) || [];
    list.push(entry.tool);
    grouped.set(entry.serverId, list);
    registry.set(namespacedMcpToolName(entry.serverId, entry.tool.name), entry);
  }
  const groups = [...grouped.entries()];
  return {
    registry,
    count: [...registry.keys()].length,
    openai: groups.flatMap(([serverId, tools]) => formatForOpenAI(tools, serverId)),
    anthropic: groups.flatMap(([serverId, tools]) => formatForAnthropic(tools, serverId)),
    gemini: groups.flatMap(([serverId, tools]) => formatForGemini(tools, serverId))
  };
}

function parseArgs(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function stringifyToolResult(result) {
  if (!result) return '';
  if (Array.isArray(result.content)) {
    const text = result.content
      .map((item) => {
        if (item.type === 'text') return item.text || '';
        if (item.type === 'image') return `[image:${item.mimeType || 'unknown'}]`;
        if (item.type === 'audio') return `[audio:${item.mimeType || 'unknown'}]`;
        if (item.type === 'resource') return JSON.stringify(item.resource || item);
        return JSON.stringify(item);
      })
      .filter(Boolean)
      .join('\n');
    if (text) return text;
  }
  return JSON.stringify(result, null, 2);
}

function snippet(value, limit = 2400) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return text.length > limit ? `${text.slice(0, limit)}\n...` : text;
}

function createMcpProgress(requestId) {
  const runId = `tools-${requestId}`;
  let steps = [];

  function publish(runState = 'running') {
    const currentStepIndex = Math.max(0, steps.findIndex((step) => step.status === 'running'));
    sendToAll('agent:run-update', {
      runId,
      runState,
      plan: {
        id: runId,
        title: 'Agent Tool Calls',
        steps,
        currentStepIndex: currentStepIndex === -1 ? 0 : currentStepIndex
      }
    });
  }

  function add(entry, args) {
    const step = {
      id: crypto.randomUUID(),
      title: `Calling tool: ${entry.tool.name} on ${entry.serverName}`,
      description: `MCP tool ${entry.tool.name}`,
      actionType: 'mcp_tool_call',
      status: 'pending',
      command: '',
      filePath: '',
      files: [],
      output: '',
      durationMs: 0,
      mcp: {
        serverId: entry.serverId,
        serverName: entry.serverName,
        toolName: entry.tool.name,
        args
      }
    };
    steps = [...steps, step];
    publish();
    return step;
  }

  function addBrowser(toolName, args, state = {}) {
    const actionType = ['browser_click', 'browser_type'].includes(toolName) ? 'browser_interact' : 'browser_read';
    const step = {
      id: crypto.randomUUID(),
      title: `Browser: ${toolName.replace('browser_', '').replaceAll('_', ' ')}`,
      description: state.url || 'Managed browser action',
      actionType,
      status: 'pending',
      command: '',
      filePath: '',
      files: [],
      output: '',
      durationMs: 0,
      browser: {
        toolName,
        url: state.url || '',
        title: state.title || '',
        args
      }
    };
    steps = [...steps, step];
    publish();
    return step;
  }

  function addComputer(toolName, args) {
    const actionType = toolName === 'computer_screenshot' ? 'computer_screenshot' : 'computer_interact';
    const step = {
      id: crypto.randomUUID(),
      title: `Computer: ${toolName.replace('computer_', '').replaceAll('_', ' ')}`,
      description: actionType === 'computer_screenshot' ? 'Capture primary display' : 'Mouse/keyboard control',
      actionType,
      status: 'pending',
      command: '',
      filePath: '',
      files: [],
      output: '',
      durationMs: 0,
      computer: {
        toolName,
        args
      }
    };
    steps = [...steps, step];
    publish();
    return step;
  }

  function update(stepId, patch) {
    let updated = null;
    steps = steps.map((step) => {
      if (step.id !== stepId) return step;
      updated = {
        ...step,
        ...patch,
        mcp: step.mcp || patch.mcp ? { ...(step.mcp || {}), ...(patch.mcp || {}) } : undefined,
        browser: step.browser || patch.browser ? { ...(step.browser || {}), ...(patch.browser || {}) } : undefined,
        computer: step.computer || patch.computer ? { ...(step.computer || {}), ...(patch.computer || {}) } : undefined
      };
      return updated;
    });
    if (updated) {
      sendToAll('agent:step-update', { runId, step: updated });
      publish();
    }
    return updated;
  }

  function complete() {
    if (steps.length) publish('completed');
  }

  return { runId, add, addBrowser, addComputer, update, complete };
}

async function executeMcpToolCall({ event, requestId, payload, registry, toolCall, progress }) {
  const entry = registry.get(toolCall.name);
  if (!entry) {
    return {
      resultText: `Tool ${toolCall.name} is not a connected MCP tool.`,
      result: { isError: true, content: [{ type: 'text', text: `Tool ${toolCall.name} is not connected.` }] },
      isError: true
    };
  }

  const args = parseArgs(toolCall.arguments ?? toolCall.args);
  const step = progress.add(entry, args);
  const started = Date.now();
  emit(event, 'progress', requestId, {
    type: 'mcp_tool',
    phase: 'start',
    message: `Calling MCP tool ${entry.tool.name} on ${entry.serverName}`
  });
  const approval = await requestMcpToolApproval({
    runId: progress.runId,
    stepId: step.id,
    serverId: entry.serverId,
    serverName: entry.serverName,
    toolName: entry.tool.name,
    args,
    permissions: payload.permissions || {}
  });

  if (approval.decision === 'deny') {
    const denied = 'User denied execution.';
    emit(event, 'progress', requestId, {
      type: 'mcp_tool',
      phase: 'denied',
      message: `MCP tool ${entry.tool.name} denied by user.`
    });
    progress.update(step.id, {
      status: 'failed',
      output: denied,
      durationMs: Date.now() - started
    });
    return {
      resultText: denied,
      result: { isError: true, content: [{ type: 'text', text: denied }] },
      isError: true
    };
  }

  const finalArgs = approval.args || args;
  progress.update(step.id, {
    status: 'running',
    mcp: { args: finalArgs },
    output: `Arguments:\n${JSON.stringify(finalArgs, null, 2)}`
  });

  try {
    const result = await mcpCallTool(entry.serverId, entry.tool.name, finalArgs);
    const resultText = stringifyToolResult(result);
    emit(event, 'progress', requestId, {
      type: 'mcp_tool',
      phase: result?.isError ? 'error' : 'done',
      message: `MCP tool ${entry.tool.name} ${result?.isError ? 'returned an error' : 'completed'}.`
    });
    progress.update(step.id, {
      status: result?.isError ? 'failed' : 'done',
      output: `Arguments:\n${JSON.stringify(finalArgs, null, 2)}\n\nResult:\n${snippet(resultText)}`,
      durationMs: Date.now() - started
    });
    return { resultText, result, isError: Boolean(result?.isError) };
  } catch (error) {
    const resultText = `MCP tool failed: ${error.message}`;
    emit(event, 'progress', requestId, {
      type: 'mcp_tool',
      phase: 'error',
      message: resultText
    });
    progress.update(step.id, {
      status: 'failed',
      output: `Arguments:\n${JSON.stringify(finalArgs, null, 2)}\n\nResult:\n${resultText}`,
      durationMs: Date.now() - started
    });
    return {
      resultText,
      result: { isError: true, content: [{ type: 'text', text: resultText }] },
      isError: true
    };
  }
}

function browserActionType(toolName) {
  return ['browser_click', 'browser_type'].includes(toolName) ? 'browser_interact' : 'browser_read';
}

function browserResultText(toolName, result = {}) {
  const lines = [
    `Browser tool: ${toolName}`,
    `URL: ${result.url || ''}`,
    `Title: ${result.title || ''}`
  ];
  if (result.dom) {
    lines.push('', snippet(result.dom, 9000));
  }
  return lines.join('\n').trim();
}

async function executeBrowserToolCall({ event, requestId, payload, toolCall, progress }) {
  const toolName = toolCall.name;
  const args = parseArgs(toolCall.arguments ?? toolCall.args);
  const beforeState = await browserGetState().catch(() => ({}));
  const step = progress.addBrowser(toolName, args, beforeState);
  const started = Date.now();
  const actionType = browserActionType(toolName);
  emit(event, 'progress', requestId, {
    type: 'browser_tool',
    phase: 'start',
    message: `Using browser tool ${toolName}`
  });

  let finalArgs = args;
  if (actionType === 'browser_interact') {
    const screenshot = await browserGetScreenshot().catch(() => '');
    const approval = await requestBrowserActionApproval({
      runId: progress.runId,
      stepId: step.id,
      actionType,
      toolName,
      args,
      url: beforeState.url,
      titleText: beforeState.title,
      screenshot,
      permissions: payload.permissions || {}
    });
    if (approval.decision === 'deny') {
      const denied = 'User denied browser action.';
      emit(event, 'progress', requestId, {
        type: 'browser_tool',
        phase: 'denied',
        message: denied
      });
      progress.update(step.id, {
        status: 'failed',
        output: denied,
        durationMs: Date.now() - started
      });
      return {
        resultText: denied,
        result: { isError: true, content: [{ type: 'text', text: denied }] },
        isError: true
      };
    }
    finalArgs = approval.args || args;
  }

  progress.update(step.id, {
    status: 'running',
    browser: { args: finalArgs },
    output: `Arguments:\n${JSON.stringify(finalArgs, null, 2)}`
  });

  try {
    let result;
    if (toolName === 'browser_execute_web_ai') {
      result = await browserExecuteWebAiChat(finalArgs);
    } else if (toolName === 'browser_navigate') {
      result = await browserNavigate(finalArgs.url);
    } else if (toolName === 'browser_click') {
      result = await browserClick(finalArgs.element_id_or_selector || finalArgs.selector);
    } else if (toolName === 'browser_type') {
      result = await browserType(finalArgs.element_id_or_selector || finalArgs.selector, finalArgs.text || '');
    } else if (toolName === 'browser_read_page') {
      const dom = await browserGetDOM();
      const state = await browserGetState().catch(() => ({}));
      result = { ...state, dom };
    } else {
      throw new Error(`Unknown browser tool "${toolName}".`);
    }
    const resultText = browserResultText(toolName, result);
    emit(event, 'progress', requestId, {
      type: 'browser_tool',
      phase: 'done',
      message: `Browser tool ${toolName} completed.`
    });
    progress.update(step.id, {
      status: 'done',
      output: `Arguments:\n${JSON.stringify(finalArgs, null, 2)}\n\nResult:\n${snippet(resultText)}`,
      durationMs: Date.now() - started,
      browser: {
        url: result.url || beforeState.url || '',
        title: result.title || beforeState.title || ''
      }
    });
    return { resultText, result, isError: false };
  } catch (error) {
    const resultText = `Browser tool failed: ${error.message}`;
    emit(event, 'progress', requestId, {
      type: 'browser_tool',
      phase: 'error',
      message: resultText
    });
    progress.update(step.id, {
      status: 'failed',
      output: `Arguments:\n${JSON.stringify(finalArgs, null, 2)}\n\nResult:\n${resultText}`,
      durationMs: Date.now() - started
    });
    return {
      resultText,
      result: { isError: true, content: [{ type: 'text', text: resultText }] },
      isError: true
    };
  }
}

function computerActionType(toolName) {
  return toolName === 'computer_screenshot' ? 'computer_screenshot' : 'computer_interact';
}

function computerResultText(toolName, result = {}) {
  if (toolName === 'computer_screenshot') {
    return JSON.stringify({
      width: result.width,
      height: result.height,
      imageWidth: result.imageWidth,
      imageHeight: result.imageHeight,
      mimeType: 'image/jpeg',
      base64: result.base64
    });
  }
  return JSON.stringify(result, null, 2);
}

async function executeComputerToolCall({ event, requestId, payload, toolCall, progress }) {
  const toolName = toolCall.name;
  const args = parseArgs(toolCall.arguments ?? toolCall.args);
  const step = progress.addComputer(toolName, args);
  const started = Date.now();
  const actionType = computerActionType(toolName);
  emit(event, 'progress', requestId, {
    type: 'computer_tool',
    phase: 'start',
    message: `Using computer tool ${toolName}`
  });

  const status = computerGetStatus();
  if (!status.enabled) {
    const disabled = 'Computer Use is disabled. Enable it in the Computer Use panel first.';
    progress.update(step.id, { status: 'failed', output: disabled, durationMs: Date.now() - started });
    return { resultText: disabled, result: { isError: true }, isError: true };
  }

  const approval = await requestComputerActionApproval({
    runId: progress.runId,
    stepId: step.id,
    actionType,
    toolName,
    args,
    allowUnattended: computerAllowsUnattended(),
    permissions: payload.permissions || {}
  });
  if (approval.decision === 'deny') {
    const denied = 'User denied computer action.';
    emit(event, 'progress', requestId, { type: 'computer_tool', phase: 'denied', message: denied });
    progress.update(step.id, { status: 'failed', output: denied, durationMs: Date.now() - started });
    return { resultText: denied, result: { isError: true }, isError: true };
  }

  const finalArgs = approval.args || args;
  progress.update(step.id, {
    status: 'running',
    computer: { args: finalArgs },
    output: `Arguments:\n${JSON.stringify(finalArgs, null, 2)}`
  });

  try {
    let result;
    if (toolName === 'computer_screenshot') {
      result = await computerGetScreen();
    } else if (toolName === 'computer_mouse_action') {
      result = await computerMouseAction(finalArgs);
    } else if (toolName === 'computer_keyboard_type') {
      result = await computerKeyboardType(finalArgs.text || '');
    } else if (toolName === 'computer_keyboard_shortcut') {
      result = await computerKeyboardKeys(finalArgs.keys || []);
    } else {
      throw new Error(`Unknown computer tool "${toolName}".`);
    }
    const resultText = computerResultText(toolName, result);
    emit(event, 'progress', requestId, {
      type: 'computer_tool',
      phase: 'done',
      message: `Computer tool ${toolName} completed.`
    });
    progress.update(step.id, {
      status: 'done',
      output: `Arguments:\n${JSON.stringify(finalArgs, null, 2)}\n\nResult:\n${snippet(resultText)}`,
      durationMs: Date.now() - started
    });
    return { resultText, result, isError: false };
  } catch (error) {
    const resultText = `Computer tool failed: ${error.message}`;
    emit(event, 'progress', requestId, { type: 'computer_tool', phase: 'error', message: resultText });
    progress.update(step.id, {
      status: 'failed',
      output: `Arguments:\n${JSON.stringify(finalArgs, null, 2)}\n\nResult:\n${resultText}`,
      durationMs: Date.now() - started
    });
    return { resultText, result: { isError: true }, isError: true };
  }
}

async function executeAgentToolCall({ event, requestId, payload, registry, toolCall, progress }) {
  if (BROWSER_TOOL_NAMES.has(toolCall.name)) {
    return executeBrowserToolCall({ event, requestId, payload, toolCall, progress });
  }
  if (COMPUTER_TOOL_NAMES.has(toolCall.name)) {
    return executeComputerToolCall({ event, requestId, payload, toolCall, progress });
  }
  return executeMcpToolCall({ event, requestId, payload, registry, toolCall, progress });
}

async function parseSse(response, onEvent, signal) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    if (signal?.aborted) {
      throw new Error('Generation aborted.');
    }
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() || '';
    for (const rawEvent of events) {
      const dataLines = rawEvent
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim());
      for (const data of dataLines) {
        if (!data || data === '[DONE]') {
          continue;
        }
        onEvent(JSON.parse(data), rawEvent);
      }
    }
  }
}

async function parseJsonLines(response, onJson, signal) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    if (signal?.aborted) {
      throw new Error('Generation aborted.');
    }
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (line.trim()) {
        onJson(JSON.parse(line));
      }
    }
  }
}

async function streamOpenAiCompatible(event, requestId, payload, signal, config) {
  if (!payload.apiKey) {
    throw new Error(config.missingKeyMessage);
  }
  const mcp = groupedConnectedMcpTools();
  const progress = createMcpProgress(requestId);
  const computerEnabled = computerIsEnabled();
  const openAiTools = [...BROWSER_OPENAI_TOOLS, ...(computerEnabled ? COMPUTER_OPENAI_TOOLS : []), ...mcp.openai];
  let messages = appendOpenAiSystemContext(toOpenAiMessages(payload.messages, payload.attachments), mcp.count, true, computerEnabled);

  for (let round = 0; round <= MAX_MCP_TOOL_ROUNDS; round += 1) {
    const response = await fetch(config.endpoint, {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${payload.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: payload.modelId || config.defaultModel,
        messages,
        temperature: payload.temperature ?? 0.7,
        [config.maxTokensKey]: payload.maxTokens || 4096,
        stream: true,
        ...(openAiTools.length ? { tools: openAiTools, tool_choice: 'auto' } : {})
      })
    });
    if (!response.ok) {
      throw new Error((await response.text()) || `${config.name} request failed with ${response.status}`);
    }

    let assistantContent = '';
    const toolCallsByIndex = new Map();
    await parseSse(response, (data) => {
      for (const choice of data.choices || []) {
        const delta = choice.delta || {};
        const token = delta.content || '';
        if (token) {
          assistantContent += token;
          emit(event, 'token', requestId, { token });
        }
        for (const part of delta.tool_calls || []) {
          const index = part.index ?? toolCallsByIndex.size;
          const existing = toolCallsByIndex.get(index) || {
            id: part.id || `tool-${index}-${Date.now()}`,
            type: 'function',
            function: { name: '', arguments: '' }
          };
          existing.id = part.id || existing.id;
          existing.type = part.type || existing.type || 'function';
          existing.function.name += part.function?.name || '';
          existing.function.arguments += part.function?.arguments || '';
          toolCallsByIndex.set(index, existing);
        }
      }
    }, signal);

    const toolCalls = [...toolCallsByIndex.values()].filter((call) => call.function?.name);
    if (!toolCalls.length) {
      progress.complete();
      return;
    }
    if (round === MAX_MCP_TOOL_ROUNDS) {
      emit(event, 'token', requestId, { token: '\n\nTool call limit reached.' });
      progress.complete();
      return;
    }

    messages.push({
      role: 'assistant',
      content: assistantContent || null,
      tool_calls: toolCalls
    });

    for (const call of toolCalls) {
      const execution = await executeAgentToolCall({
        event,
        requestId,
        payload,
        registry: mcp.registry,
        toolCall: {
          id: call.id,
          name: call.function.name,
          arguments: call.function.arguments
        },
        progress
      });
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: execution.resultText
      });
    }
  }
}

async function streamOpenAI(event, requestId, payload, signal) {
  await streamOpenAiCompatible(event, requestId, payload, signal, {
    name: 'OpenAI',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    defaultModel: DEFAULT_MODELS.openai,
    maxTokensKey: 'max_tokens',
    missingKeyMessage: 'Add your OpenAI API key in Settings.'
  });
}

async function streamGroq(event, requestId, payload, signal) {
  await streamOpenAiCompatible(event, requestId, payload, signal, {
    name: 'Groq',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    defaultModel: DEFAULT_MODELS.groq,
    maxTokensKey: 'max_completion_tokens',
    missingKeyMessage: 'Add your Groq API key in Settings.'
  });
}

async function streamAnthropic(event, requestId, payload, signal) {
  if (!payload.apiKey) {
    throw new Error('Add your Anthropic API key in Settings.');
  }
  const mcp = groupedConnectedMcpTools();
  const computerEnabled = computerIsEnabled();
  const progress = createMcpProgress(requestId);
  const systemMessage = appendSystemContext(
    payload.messages?.find((message) => message.role === 'system')?.content || payload.systemPrompt || '',
    mcp.count,
    true,
    computerEnabled
  );
  let messages = toAnthropicMessages(payload.messages, payload.attachments);
  const anthropicTools = [...BROWSER_ANTHROPIC_TOOLS, ...(computerEnabled ? COMPUTER_ANTHROPIC_TOOLS : []), ...mcp.anthropic];

  for (let round = 0; round <= MAX_MCP_TOOL_ROUNDS; round += 1) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal,
      headers: {
        'x-api-key': payload.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: payload.modelId || DEFAULT_MODELS.anthropic,
        system: systemMessage,
        messages,
        max_tokens: payload.maxTokens || 4096,
        temperature: payload.temperature ?? 0.7,
        stream: true,
        ...(anthropicTools.length ? { tools: anthropicTools } : {})
      })
    });
    if (!response.ok) {
      throw new Error((await response.text()) || `Anthropic request failed with ${response.status}`);
    }

    const blocks = new Map();
    await parseSse(response, (data) => {
      if (data.type === 'content_block_start') {
        const block = data.content_block || {};
        blocks.set(data.index, {
          ...block,
          text: block.text || '',
          inputJson: ''
        });
      }
      if (data.type === 'content_block_delta') {
        const block = blocks.get(data.index) || { type: 'text', text: '', inputJson: '' };
        if (data.delta?.type === 'text_delta') {
          const token = data.delta.text || '';
          block.text = `${block.text || ''}${token}`;
          if (token) emit(event, 'token', requestId, { token });
        }
        if (data.delta?.type === 'input_json_delta') {
          block.inputJson = `${block.inputJson || ''}${data.delta.partial_json || ''}`;
        }
        blocks.set(data.index, block);
      }
    }, signal);

    const sortedBlocks = [...blocks.entries()].sort(([a], [b]) => a - b).map(([, block]) => block);
    const toolUses = sortedBlocks.filter((block) => block.type === 'tool_use' && block.name);
    if (!toolUses.length) {
      progress.complete();
      return;
    }
    if (round === MAX_MCP_TOOL_ROUNDS) {
      emit(event, 'token', requestId, { token: '\n\nTool call limit reached.' });
      progress.complete();
      return;
    }

    messages.push({
      role: 'assistant',
      content: sortedBlocks.map((block) => {
        if (block.type === 'tool_use') {
          return {
            type: 'tool_use',
            id: block.id,
            name: block.name,
            input: parseArgs(block.inputJson || block.input)
          };
        }
        return { type: 'text', text: block.text || '' };
      }).filter((block) => block.type !== 'text' || block.text)
    });

    const toolResults = [];
    for (const toolUse of toolUses) {
      const execution = await executeAgentToolCall({
        event,
        requestId,
        payload,
        registry: mcp.registry,
        toolCall: {
          id: toolUse.id,
          name: toolUse.name,
          args: parseArgs(toolUse.inputJson || toolUse.input)
        },
        progress
      });
      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: execution.resultText,
        is_error: execution.isError
      });
    }
    messages.push({ role: 'user', content: toolResults });
  }
}

async function streamGemini(event, requestId, payload, signal) {
  if (!payload.apiKey) {
    throw new Error('Add your Google API key in Settings.');
  }
  const mcp = groupedConnectedMcpTools();
  const computerEnabled = computerIsEnabled();
  const progress = createMcpProgress(requestId);
  const model = payload.modelId || DEFAULT_MODELS.google;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(payload.apiKey)}`;
  let contents = toGeminiContents(payload.messages, payload.attachments);
  const systemText = appendSystemContext(payload.systemPrompt || payload.messages?.find((message) => message.role === 'system')?.content || '', mcp.count, true, computerEnabled);
  const geminiTools = [...BROWSER_GEMINI_TOOLS, ...(computerEnabled ? COMPUTER_GEMINI_TOOLS : []), ...mcp.gemini];

  for (let round = 0; round <= MAX_MCP_TOOL_ROUNDS; round += 1) {
    const response = await fetch(endpoint, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: payload.temperature ?? 0.7,
          maxOutputTokens: payload.maxTokens || 4096
        },
        systemInstruction: systemText ? { parts: [{ text: systemText }] } : undefined,
        ...(geminiTools.length ? { tools: [{ functionDeclarations: geminiTools }] } : {})
      })
    });
    if (!response.ok) {
      throw new Error((await response.text()) || `Gemini request failed with ${response.status}`);
    }

    const functionCalls = [];
    await parseSse(response, (data) => {
      for (const candidate of data.candidates || []) {
        for (const part of candidate.content?.parts || []) {
          if (part.text) {
            emit(event, 'token', requestId, { token: part.text });
          }
          if (part.functionCall?.name) {
            functionCalls.push({
              name: part.functionCall.name,
              args: part.functionCall.args || {}
            });
          }
        }
      }
    }, signal);

    if (!functionCalls.length) {
      progress.complete();
      return;
    }
    if (round === MAX_MCP_TOOL_ROUNDS) {
      emit(event, 'token', requestId, { token: '\n\nTool call limit reached.' });
      progress.complete();
      return;
    }

    contents.push({
      role: 'model',
      parts: functionCalls.map((call) => ({ functionCall: { name: call.name, args: call.args || {} } }))
    });

    const responseParts = [];
    for (const call of functionCalls) {
      const execution = await executeAgentToolCall({
        event,
        requestId,
        payload,
        registry: mcp.registry,
        toolCall: {
          name: call.name,
          args: call.args || {}
        },
        progress
      });
      responseParts.push({
        functionResponse: {
          name: call.name,
          response: execution.isError ? { error: execution.resultText } : { result: execution.resultText }
        }
      });
    }
    contents.push({ role: 'user', parts: responseParts });
  }
}

async function streamOllama(event, requestId, payload, signal) {
  const mcp = groupedConnectedMcpTools();
  const messages = appendOpenAiSystemContext(payload.messages || [], mcp.count, false);
  const body = {
    model: payload.modelId || DEFAULT_MODELS.ollama,
    messages,
    stream: true,
    options: {
      temperature: payload.temperature ?? 0.7,
      num_predict: payload.maxTokens || 4096
    }
  };
  if (isClusterOllamaEnabled(payload.clusterTask || {})) {
    try {
      emit(event, 'progress', requestId, { message: 'Routing Ollama generation to cluster worker.', type: 'cluster' });
      await streamOllamaChatViaCluster({
        body,
        signal,
        taskContext: payload.clusterTask || {},
        onJson: (data) => {
          const token = data.message?.content || data.response || '';
          if (token) {
            emit(event, 'token', requestId, { token });
          }
        }
      });
      return;
    } catch (error) {
      if (error instanceof ClusterOffloadError || error.code === 'CLUSTER_OFFLOAD_DROPPED') {
        emit(event, 'progress', requestId, {
          message: 'Cluster worker dropped. Falling back to local Ollama.',
          type: 'cluster'
        });
      } else {
        throw error;
      }
    }
  }
  const ollamaHost = getOllamaHost();
  let response;
  try {
    response = await fetch(`${ollamaHost}/api/chat`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new Error(`Ollama service is unreachable at ${ollamaHost} (${err.message || 'fetch failed'}). Please start Ollama or check host configuration.`);
  }

  if (!response.ok) {
    throw new Error((await response.text()) || `Ollama request failed with ${response.status}`);
  }
  await parseJsonLines(response, (data) => {
    const token = data.message?.content || data.response || '';
    if (token) {
      emit(event, 'token', requestId, { token });
    }
  }, signal);
}

async function withRetries(fn, onRetry) {
  const waits = [0, 500, 1500];
  let lastError;
  for (let index = 0; index < waits.length; index += 1) {
    if (waits[index]) {
      onRetry?.(index, waits[index]);
      await new Promise((resolve) => setTimeout(resolve, waits[index]));
    }
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const errMsg = String(error.message || '').toLowerCase();
      if (errMsg.includes('429') || errMsg.includes('rate limit') || errMsg.includes('quota') || errMsg.includes('api key')) {
        break;
      }
    }
  }
  throw lastError;
}

async function executeWithFallback(event, requestId, payload, controller) {
  const providersToTry = [];
  const primary = providerName(payload.provider);
  providersToTry.push({ name: primary, apiKey: payload.apiKey, modelId: payload.modelId });

  const fallbackOrder = ['google', 'groq', 'openai', 'anthropic', 'ollama'].filter((p) => p !== primary);
  for (const p of fallbackOrder) {
    const key = payload.apiKeys?.[p] || (p === primary ? payload.apiKey : '');
    if (p === 'ollama' || key) {
      providersToTry.push({ name: p, apiKey: key, modelId: DEFAULT_MODELS[p] });
    }
  }

  let lastError = null;
  for (let i = 0; i < providersToTry.length; i += 1) {
    const item = providersToTry[i];
    try {
      const activePayload = { ...payload, provider: item.name, apiKey: item.apiKey, modelId: item.modelId || payload.modelId };
      if (item.name === 'google') await streamGemini(event, requestId, activePayload, controller.signal);
      else if (item.name === 'groq') await streamGroq(event, requestId, activePayload, controller.signal);
      else if (item.name === 'openai') await streamOpenAI(event, requestId, activePayload, controller.signal);
      else if (item.name === 'anthropic') await streamAnthropic(event, requestId, activePayload, controller.signal);
      else await streamOllama(event, requestId, activePayload, controller.signal);
      return; // Success!
    } catch (err) {
      lastError = err;
      if (controller.signal?.aborted) {
        throw err;
      }

      const hasMoreProviders = i < providersToTry.length - 1;
      if (hasMoreProviders) {
        const nextProvider = providersToTry[i + 1].name;
        emit(event, 'progress', requestId, {
          message: `Provider ${item.name} failed (${err.message || 'connection error'}). Retrying with fallback (${nextProvider})...`
        });
        console.warn(`[LLM Router Fallback] ${item.name} failed: ${err.message}. Retrying with ${nextProvider}...`);
        continue;
      }
    }
  }

  const finalMsg = lastError?.message || 'Connection failed to all configured AI providers.';
  throw new Error(`AI Stream Error: ${finalMsg}`);
}

export function registerAiHandlers() {
  initAuditLogHandler();
  ipcMain.handle('ai:stream', async (event, payload = {}) => {
    const requestId = payload.requestId;
    const controller = new AbortController();
    controllers.set(requestId, controller);
    const provider = providerName(payload.provider);
    try {
      const policy = enforcePolicies([payload.systemPrompt, ...(payload.messages || []).map((message) => message?.content || '')].join('\n'));
      if (!policy.ok) {
        await appendAuditLog({
          agent_id: requestId,
          action: 'policy_block',
          file_path: '',
          diff: policy.message,
          approval_status: 'blocked'
        });
        throw new Error(policy.message);
      }
      await appendAuditLog({
        agent_id: requestId,
        action: 'ai_stream_start',
        file_path: '',
        diff: JSON.stringify({ provider, modelId: payload.modelId || '' }),
        approval_status: 'pending'
      });
      await executeWithFallback(event, requestId, payload, controller);
      emit(event, 'done', requestId, { ok: true, provider });
      await appendAuditLog({
        agent_id: requestId,
        action: 'ai_stream_done',
        file_path: '',
        diff: '',
        approval_status: 'approved'
      }).catch(() => {});
    } catch (error) {
      emit(event, 'error', requestId, { message: error.message, provider });
      await appendAuditLog({
        agent_id: requestId,
        action: 'ai_stream_error',
        file_path: '',
        diff: error.message,
        approval_status: 'failed'
      }).catch(() => {});
      throw error;
    } finally {
      controllers.delete(requestId);
    }
  });

  ipcMain.handle('ai:stream:abort', async (_event, requestId) => {
    controllers.get(requestId)?.abort();
    return { ok: true };
  });

  ipcMain.handle('ai:abort-all', async (_event, reason = 'AI control terminated.') => {
    abortAllAiStreams(reason);
    return { ok: true };
  });

  ipcMain.handle('ai:test-provider', async (_event, payload = {}) => {
    try {
      if (payload.provider === 'ollama') {
        const response = await fetch('http://localhost:11434/api/version');
        return { ok: response.ok, message: response.ok ? 'Ollama connection works.' : 'Ollama is not responding.' };
      }
      if (!payload.apiKey) {
        return { ok: false, message: `Missing ${payload.provider} API key.` };
      }
      if (payload.provider === 'groq') {
        const response = await fetch('https://api.groq.com/openai/v1/models', {
          headers: { Authorization: `Bearer ${payload.apiKey}` }
        });
        return {
          ok: response.ok,
          message: response.ok ? 'Groq API key works.' : (await response.text()) || `Groq validation failed with ${response.status}.`
        };
      }
      if (payload.provider === 'google') {
        const url = new URL('https://generativelanguage.googleapis.com/v1beta/models');
        url.searchParams.set('key', payload.apiKey);
        const response = await fetch(url);
        return {
          ok: response.ok,
          message: response.ok ? 'Google Gemini API key works.' : (await response.text()) || `Google Gemini validation failed with ${response.status}.`
        };
      }
      return { ok: true, message: 'API key saved. Full validation happens on first request.' };
    } catch (error) {
      return { ok: false, message: error.message };
    }
  });
}


