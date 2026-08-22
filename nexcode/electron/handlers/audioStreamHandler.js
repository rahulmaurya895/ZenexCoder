import { ipcMain } from 'electron';
import {
  appendRealtimeAudio,
  connectRealtimeSession,
  disconnectRealtimeSession,
  getRealtimeState,
  sendRealtimeContextUpdate
} from './realtimeClient.js';

const AUDIO_FLUSH_MS = 80;
const MAX_BUFFERED_BYTES = 24000 * 2 * 0.25;

let audioBuffers = [];
let bufferedBytes = 0;
let flushTimer = null;
let handlersRegistered = false;

function clearAudioBuffer() {
  audioBuffers = [];
  bufferedBytes = 0;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}

function flushAudioBuffer() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!audioBuffers.length) return false;
  const merged = Buffer.concat(audioBuffers, bufferedBytes).toString('base64');
  clearAudioBuffer();
  return appendRealtimeAudio(merged);
}

function queuePcmChunk(payload = {}) {
  const pcmData = payload.pcmData || payload.audio || '';
  if (!pcmData) return;
  try {
    const buffer = Buffer.from(pcmData, 'base64');
    if (!buffer.length) return;
    audioBuffers.push(buffer);
    bufferedBytes += buffer.length;
    if (bufferedBytes >= MAX_BUFFERED_BYTES) {
      flushAudioBuffer();
      return;
    }
    if (!flushTimer) {
      flushTimer = setTimeout(flushAudioBuffer, AUDIO_FLUSH_MS);
    }
  } catch {
    clearAudioBuffer();
  }
}

export function registerAudioStreamHandlers() {
  if (handlersRegistered) return;
  handlersRegistered = true;

  ipcMain.handle('voice:connect', async (_event, payload = {}) => {
    clearAudioBuffer();
    return connectRealtimeSession(payload);
  });

  ipcMain.handle('voice:disconnect', async () => {
    clearAudioBuffer();
    return disconnectRealtimeSession();
  });

  ipcMain.handle('voice:get-state', async () => getRealtimeState());

  ipcMain.handle('voice:context-update', async (_event, payload = {}) => sendRealtimeContextUpdate(payload));

  ipcMain.on('voice:pcm-chunk-out', (_event, payload = {}) => {
    queuePcmChunk(payload);
  });
}

export async function disconnectAudioStream() {
  clearAudioBuffer();
  return disconnectRealtimeSession();
}
