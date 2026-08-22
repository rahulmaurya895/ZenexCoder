import { BrowserWindow } from 'electron';
import crypto from 'node:crypto';
import WebSocket from 'ws';
import { PERSONAS } from '../../src/utils/swarmPersonas.js';
import { startSwarmRun } from './swarmHandler.js';

const DEFAULT_MODEL = 'gpt-realtime-2';
const DEFAULT_VOICE = 'marin';
const INPUT_SAMPLE_RATE = 24000;
const STATE_DISCONNECTED = {
  connected: false,
  connectionState: 'disconnected',
  provider: 'openai',
  model: DEFAULT_MODEL,
  voice: DEFAULT_VOICE,
  error: ''
};

let socket = null;
let sessionOptions = {};
let realtimeState = { ...STATE_DISCONNECTED };
let latestEditorContext = { filePath: '', content: '', updatedAt: 0 };
let lastAssistantAudio = { itemId: '', contentIndex: 0, startedAt: 0 };
let sessionUpdateSent = false;

function sendToAll(channel, payload) {
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, payload);
    }
  });
}

function updateState(connectionState, patch = {}) {
  realtimeState = {
    ...realtimeState,
    ...patch,
    connectionState,
    connected: !['disconnected', 'error'].includes(connectionState)
  };
  sendToAll('voice:state-change', realtimeState);
  return realtimeState;
}

function sendNotice(title, body, type = 'info') {
  sendToAll('notify:show', {
    id: `voice-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title,
    body,
    message: body,
    type,
    timestamp: Date.now()
  });
}

function compactText(value = '', limit = 12000) {
  const text = String(value || '');
  return text.length > limit ? `${text.slice(0, limit)}\n... [trimmed for realtime voice context]` : text;
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function realtimeTools() {
  const personaTools = Object.values(PERSONAS).map((persona) => ({
    type: 'function',
    name: `swarm_${persona.id}`,
    description: `Send the current voice request to NexCode ${persona.name}. Use this for code tasks that need the ${persona.name} persona.`,
    parameters: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'The concrete background task to run.' },
        filePath: { type: 'string', description: 'Current file path if relevant.' },
        codeContext: { type: 'string', description: 'Relevant code context.' },
        projectPath: { type: 'string', description: 'Project folder path if known.' }
      },
      required: ['task']
    }
  }));

  return [
    ...personaTools,
    {
      type: 'function',
      name: 'run_swarm_agent',
      description: 'Run a NexCode multi-agent swarm. Choose persona architect, coder, qa, or secops when the user asks to delegate work.',
      parameters: {
        type: 'object',
        properties: {
          persona: {
            type: 'string',
            enum: Object.keys(PERSONAS),
            description: 'Preferred starting persona.'
          },
          task: { type: 'string', description: 'The concrete task the swarm should work on.' },
          filePath: { type: 'string', description: 'Current file path if relevant.' },
          codeContext: { type: 'string', description: 'Relevant code context.' },
          projectPath: { type: 'string', description: 'Project folder path if known.' }
        },
        required: ['task']
      }
    }
  ];
}

function buildInstructions(extra = '') {
  return [
    'You are NexCode realtime coding voice assistant.',
    'Speak briefly and naturally while the user is coding.',
    'Use the current editor context silently when the user says things like this line, this file, here, or change it.',
    'If the user asks for implementation, tests, security review, bug fixing, or deeper analysis, call an appropriate NexCode Swarm function.',
    'Do not claim a file was changed unless a tool or the app actually changed it.',
    extra
  ].filter(Boolean).join(' ');
}

function buildOpenAiUrl(options = {}) {
  if (options.endpoint?.trim()) {
    return options.endpoint.trim();
  }
  const model = encodeURIComponent(options.model || DEFAULT_MODEL);
  return `wss://api.openai.com/v1/realtime?model=${model}`;
}

function websocketHeaders(options = {}) {
  const headers = {};
  if (options.apiKey) {
    headers.Authorization = `Bearer ${options.apiKey}`;
  }
  if (options.safetyIdentifier) {
    headers['OpenAI-Safety-Identifier'] = options.safetyIdentifier;
  }
  return headers;
}

function canSend() {
  return socket?.readyState === WebSocket.OPEN;
}

function sendRealtimeEvent(event) {
  if (!canSend()) {
    return false;
  }
  const payload = {
    event_id: `voice-${crypto.randomUUID()}`,
    ...event
  };
  socket.send(JSON.stringify(payload));
  return true;
}

function sendSessionUpdate() {
  if (sessionUpdateSent) return;
  sessionUpdateSent = true;
  const model = sessionOptions.model || DEFAULT_MODEL;
  const voice = sessionOptions.voice || DEFAULT_VOICE;
  sendRealtimeEvent({
    type: 'session.update',
    session: {
      type: 'realtime',
      model,
      output_modalities: ['audio'],
      audio: {
        input: {
          format: {
            type: 'audio/pcm',
            rate: INPUT_SAMPLE_RATE
          },
          turn_detection: {
            type: sessionOptions.turnDetection || 'semantic_vad',
            interrupt_response: true,
            create_response: true
          }
        },
        output: {
          format: {
            type: 'audio/pcm'
          },
          voice
        }
      },
      tools: realtimeTools(),
      tool_choice: 'auto',
      instructions: buildInstructions(sessionOptions.instructions)
    }
  });
}

function emitPlaybackClear(event = {}) {
  sendToAll('voice:playback-clear', {
    reason: event.type || 'interrupt',
    itemId: lastAssistantAudio.itemId,
    contentIndex: lastAssistantAudio.contentIndex,
    createdAt: Date.now()
  });
}

function audioEndMsFromStart() {
  if (!lastAssistantAudio.startedAt) return 0;
  return Math.max(0, Date.now() - lastAssistantAudio.startedAt);
}

function truncateUnplayedAudio() {
  if (!lastAssistantAudio.itemId) return;
  sendRealtimeEvent({
    type: 'conversation.item.truncate',
    item_id: lastAssistantAudio.itemId,
    content_index: lastAssistantAudio.contentIndex || 0,
    audio_end_ms: audioEndMsFromStart()
  });
}

function cancelActiveResponse() {
  if (!['thinking', 'speaking'].includes(realtimeState.connectionState)) return;
  sendRealtimeEvent({ type: 'response.cancel' });
}

function extractAudioDelta(event = {}) {
  if (!['response.output_audio.delta', 'response.audio.delta'].includes(event.type)) {
    return '';
  }
  return event.delta || event.audio || '';
}

function emitTranscript(event = {}) {
  const delta = event.delta || event.transcript || event.text || '';
  if (!delta) return;
  sendToAll('voice:transcript-delta', {
    role: event.type?.includes('input') ? 'user' : 'assistant',
    text: delta,
    createdAt: Date.now()
  });
}

function extractFunctionCalls(event = {}) {
  const calls = [];
  if (event.type === 'response.function_call_arguments.done' && event.name) {
    calls.push({
      name: event.name,
      call_id: event.call_id,
      arguments: event.arguments || '{}'
    });
  }
  const output = event.response?.output || [];
  for (const item of output) {
    if (item?.type === 'function_call' && item.name) {
      calls.push(item);
    }
  }
  if (event.item?.type === 'function_call' && event.item.name) {
    calls.push(event.item);
  }
  return calls;
}

function personaFromCall(name = '', args = {}) {
  if (args.persona && PERSONAS[args.persona]) {
    return args.persona;
  }
  const match = /^swarm_(.+)$/.exec(name);
  if (match && PERSONAS[match[1]]) {
    return match[1];
  }
  return 'architect';
}

async function handleFunctionCall(call) {
  const args = parseJson(call.arguments || call.args, {});
  const personaId = personaFromCall(call.name, args);
  const persona = PERSONAS[personaId] || PERSONAS.architect;
  const task = args.task || args.prompt || args.instructions || 'Review the current editor context from the realtime voice session.';
  const filePath = args.filePath || latestEditorContext.filePath || '';
  const codeContext = compactText(args.codeContext || latestEditorContext.content || '', 8000);
  const projectPath = args.projectPath || sessionOptions.projectPath || '';
  const prompt = [
    `Voice requested ${persona.name} background work.`,
    `Task:\n${task}`,
    filePath ? `Current file:\n${filePath}` : '',
    codeContext ? `Current code context:\n${codeContext}` : ''
  ].filter(Boolean).join('\n\n');

  sendToAll('voice:tool-call', {
    name: call.name,
    personaId,
    task,
    filePath,
    createdAt: Date.now()
  });

  let output;
  try {
    const result = startSwarmRun({
      prompt,
      projectPath,
      provider: sessionOptions.swarmProvider || 'ollama',
      modelId: sessionOptions.swarmModelId,
      maxIterations: 4
    });
    output = {
      ok: true,
      taskId: result.taskId,
      personaId,
      message: `Started NexCode ${persona.name} swarm task in the background.`
    };
    sendNotice('Voice swarm started', `${persona.name} is working on: ${compactText(task, 120)}`, 'info');
  } catch (error) {
    output = { ok: false, message: error.message };
    sendNotice('Voice swarm failed', error.message, 'error');
  }

  if (call.call_id || call.callId) {
    sendRealtimeEvent({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: call.call_id || call.callId,
        output: JSON.stringify(output)
      }
    });
    sendRealtimeEvent({ type: 'response.create' });
  }
}

function handleServerEvent(event = {}) {
  const type = event.type || '';
  if (type === 'session.created') {
    sendSessionUpdate();
    updateState('connecting', { error: '' });
    return;
  }
  if (type === 'session.updated') {
    updateState('listening', { error: '' });
    return;
  }
  if (type === 'input_audio_buffer.speech_started') {
    emitPlaybackClear(event);
    cancelActiveResponse();
    truncateUnplayedAudio();
    updateState('user_speaking');
    return;
  }
  if (type === 'input_audio_buffer.speech_stopped') {
    updateState('thinking');
    return;
  }
  if (type === 'response.created') {
    updateState('thinking');
    return;
  }
  if (['response.output_text.delta', 'response.output_audio_transcript.delta', 'response.audio_transcript.delta'].includes(type)) {
    emitTranscript(event);
    return;
  }
  const audioDelta = extractAudioDelta(event);
  if (audioDelta) {
    lastAssistantAudio = {
      itemId: event.item_id || event.itemId || lastAssistantAudio.itemId,
      contentIndex: event.content_index ?? event.contentIndex ?? lastAssistantAudio.contentIndex ?? 0,
      startedAt: lastAssistantAudio.startedAt || Date.now()
    };
    updateState('speaking');
    sendToAll('voice:pcm-chunk-in', {
      pcmData: audioDelta,
      itemId: lastAssistantAudio.itemId,
      sampleRate: INPUT_SAMPLE_RATE,
      createdAt: Date.now()
    });
    return;
  }
  if (['response.output_audio.done', 'response.audio.done'].includes(type)) {
    updateState('listening');
    lastAssistantAudio.startedAt = 0;
    return;
  }
  if (type === 'response.cancelled' || (type === 'response.done' && event.response?.status === 'cancelled')) {
    emitPlaybackClear(event);
    updateState('listening');
    return;
  }
  if (type === 'response.done') {
    const calls = extractFunctionCalls(event);
    calls.forEach((call) => {
      handleFunctionCall(call).catch((error) => sendNotice('Voice tool error', error.message, 'error'));
    });
    if (!calls.length) {
      updateState('listening');
    }
    return;
  }
  const directCalls = extractFunctionCalls(event);
  directCalls.forEach((call) => {
    handleFunctionCall(call).catch((error) => sendNotice('Voice tool error', error.message, 'error'));
  });
  if (type === 'error' || type === 'invalid_request_error') {
    const message = event.error?.message || event.message || 'Realtime voice session error.';
    updateState('error', { error: message });
    sendNotice('Realtime voice error', message, 'error');
  }
}

export function getRealtimeState() {
  return realtimeState;
}

export async function connectRealtimeSession(options = {}) {
  await disconnectRealtimeSession();
  const provider = options.provider || 'web-speech';
  const endpoint = options.endpoint?.trim() || '';

  // If set to web-speech or local mode, or no OpenAI key present, return local free voice mode state
  if (provider === 'web-speech' || provider === 'local-speech' || (!options.apiKey && !endpoint)) {
    sessionOptions = {
      ...options,
      provider: 'web-speech',
      model: 'web-speech-api',
      voice: 'native'
    };
    return updateState('listening', {
      provider: 'web-speech',
      model: 'Free Web Speech API',
      voice: 'native',
      error: ''
    });
  }

  if (provider === 'openai' && !options.apiKey) {
    // Graceful fallback to free web-speech mode instead of throwing error
    sessionOptions = {
      ...options,
      provider: 'web-speech',
      model: 'web-speech-api',
      voice: 'native'
    };
    return updateState('listening', {
      provider: 'web-speech',
      model: 'Free Web Speech API (Fallback)',
      voice: 'native',
      error: ''
    });
  }
  if (provider !== 'openai' && !endpoint) {
    throw new Error('Set a compatible local realtime WebSocket endpoint first.');
  }

  sessionOptions = {
    ...options,
    provider,
    model: options.model || DEFAULT_MODEL,
    voice: options.voice || DEFAULT_VOICE
  };
  sessionUpdateSent = false;
  const url = buildOpenAiUrl(sessionOptions);
  const headers = websocketHeaders(sessionOptions);
  updateState('connecting', {
    provider,
    model: sessionOptions.model,
    voice: sessionOptions.voice,
    error: ''
  });

  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket?.terminate();
      const error = new Error('Realtime voice connection timed out.');
      updateState('error', { error: error.message });
      reject(error);
    }, 15000);

    socket = new WebSocket(url, { headers });
    socket.on('open', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      sendSessionUpdate();
      const state = updateState('listening', { error: '' });
      resolve(state);
    });
    socket.on('message', (message) => {
      try {
        const event = JSON.parse(message.toString());
        handleServerEvent(event);
      } catch (error) {
        sendNotice('Realtime parse error', error.message, 'error');
      }
    });
    socket.on('error', (error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        updateState('error', { error: error.message });
        reject(error);
        return;
      }
      updateState('error', { error: error.message });
    });
    socket.on('close', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
      }
      realtimeState = { ...STATE_DISCONNECTED };
      sendToAll('voice:state-change', realtimeState);
    });
  });
}

export function appendRealtimeAudio(pcmData) {
  if (!pcmData || !canSend()) {
    return false;
  }
  return sendRealtimeEvent({
    type: 'input_audio_buffer.append',
    audio: pcmData
  });
}

export function sendRealtimeContextUpdate({ filePath = '', content = '' } = {}) {
  latestEditorContext = {
    filePath,
    content,
    updatedAt: Date.now()
  };
  if (!canSend()) {
    return { ok: false, reason: 'not_connected' };
  }
  const contextText = [
    `User is currently looking at file ${filePath || 'unknown'}:`,
    '',
    compactText(content)
  ].join('\n');
  const sent = sendRealtimeEvent({
    type: 'conversation.item.create',
    item: {
      type: 'message',
      role: 'system',
      content: [
        {
          type: 'input_text',
          text: contextText
        }
      ]
    }
  });
  return { ok: sent };
}

export async function disconnectRealtimeSession() {
  const existing = socket;
  socket = null;
  sessionUpdateSent = false;
  lastAssistantAudio = { itemId: '', contentIndex: 0, startedAt: 0 };
  if (existing) {
    existing.removeAllListeners();
    if (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING) {
      existing.close(1000, 'NexCode voice disconnected');
    } else {
      existing.terminate();
    }
  }
  realtimeState = { ...STATE_DISCONNECTED };
  sendToAll('voice:state-change', realtimeState);
  return realtimeState;
}
