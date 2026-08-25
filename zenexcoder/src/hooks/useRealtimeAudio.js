import { useEffect, useRef } from 'react';
import { useVoiceStore } from '@/store/voiceStore';

const INPUT_SAMPLE_RATE = 24000;
const CHUNK_MS = 90;

function clampSample(value) {
  return Math.max(-1, Math.min(1, value));
}

function downsample(input, inputRate, outputRate) {
  if (inputRate === outputRate) {
    return new Float32Array(input);
  }
  const ratio = inputRate / outputRate;
  const length = Math.floor(input.length / ratio);
  const output = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.min(Math.floor((index + 1) * ratio), input.length);
    let sum = 0;
    for (let cursor = start; cursor < end; cursor += 1) {
      sum += input[cursor];
    }
    output[index] = sum / Math.max(1, end - start);
  }
  return output;
}

function floatToPcm16(input) {
  const output = new Int16Array(input.length);
  for (let index = 0; index < input.length; index += 1) {
    const sample = clampSample(input[index]);
    output[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return output;
}

function pcm16ToFloat(input) {
  const output = new Float32Array(input.length);
  for (let index = 0; index < input.length; index += 1) {
    output[index] = input[index] / (input[index] < 0 ? 0x8000 : 0x7fff);
  }
  return output;
}

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function rmsLevel(samples) {
  if (!samples.length) return 0;
  let sum = 0;
  for (let index = 0; index < samples.length; index += 1) {
    sum += samples[index] * samples[index];
  }
  return Math.min(1, Math.sqrt(sum / samples.length) * 5);
}

export function useRealtimeAudio() {
  const connected = useVoiceStore((state) => state.connected);
  const inputDeviceId = useVoiceStore((state) => state.settings.inputDeviceId);
  const outputDeviceId = useVoiceStore((state) => state.settings.outputDeviceId);
  const applyRemoteState = useVoiceStore((state) => state.applyRemoteState);
  const addTranscriptDelta = useVoiceStore((state) => state.addTranscriptDelta);
  const addToolCall = useVoiceStore((state) => state.addToolCall);
  const setInputLevel = useVoiceStore((state) => state.setInputLevel);
  const setOutputLevel = useVoiceStore((state) => state.setOutputLevel);

  const streamRef = useRef(null);
  const inputContextRef = useRef(null);
  const processorRef = useRef(null);
  const sourceRef = useRef(null);
  const captureBufferRef = useRef([]);
  const captureFramesRef = useRef(0);
  const outputContextRef = useRef(null);
  const outputQueueTimeRef = useRef(0);
  const outputSourcesRef = useRef(new Set());

  useEffect(() => {
    if (!window.zezenexcoderr?.voice) {
      return undefined;
    }
    const disposers = [
      window.zezenexcoderr.voice.onStateChange((payload) => applyRemoteState(payload)),
      window.zezenexcoderr.voice.onTranscriptDelta((payload) => addTranscriptDelta(payload)),
      window.zezenexcoderr.voice.onToolCall((payload) => addToolCall(payload)),
      window.zezenexcoderr.voice.onPcmChunk((payload) => playIncomingAudio(payload)),
      window.zezenexcoderr.voice.onPlaybackClear(() => clearPlayback())
    ];
    window.zezenexcoderr.voice.getState().then((state) => applyRemoteState(state)).catch(() => {});
    return () => disposers.forEach((dispose) => dispose());
  }, [addToolCall, addTranscriptDelta, applyRemoteState]);

  function flushCaptureBuffer() {
    if (!captureFramesRef.current) return;
    const frames = captureFramesRef.current;
    const merged = new Int16Array(frames);
    let offset = 0;
    for (const chunk of captureBufferRef.current) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    captureBufferRef.current = [];
    captureFramesRef.current = 0;
    window.zezenexcoderr.voice.sendPcmChunk({ pcmData: bufferToBase64(merged.buffer), sampleRate: INPUT_SAMPLE_RATE });
  }

  async function stopCapture() {
    flushCaptureBuffer();
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    processorRef.current = null;
    sourceRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (inputContextRef.current && inputContextRef.current.state !== 'closed') {
      await inputContextRef.current.close().catch(() => {});
    }
    inputContextRef.current = null;
    setInputLevel(0);
  }

  async function startCapture() {
    await stopCapture();
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone capture is not available in this Chromium build.');
    }
    const audio = {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    };
    if (inputDeviceId && inputDeviceId !== 'default') {
      audio.deviceId = { exact: inputDeviceId };
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio });
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    const audioContext = new AudioContextCtor();
    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    const targetFrames = Math.floor(INPUT_SAMPLE_RATE * (CHUNK_MS / 1000));

    processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      setInputLevel(rmsLevel(input));
      if (useVoiceStore.getState().muted) {
        return;
      }
      const resampled = downsample(input, audioContext.sampleRate, INPUT_SAMPLE_RATE);
      const pcm = floatToPcm16(resampled);
      captureBufferRef.current.push(pcm);
      captureFramesRef.current += pcm.length;
      if (captureFramesRef.current >= targetFrames) {
        flushCaptureBuffer();
      }
    };

    source.connect(processor);
    processor.connect(audioContext.destination);
    await audioContext.resume().catch(() => {});
    streamRef.current = stream;
    inputContextRef.current = audioContext;
    processorRef.current = processor;
    sourceRef.current = source;
    await useVoiceStore.getState().enumerateDevices().catch(() => {});
  }

  async function getOutputContext() {
    if (outputContextRef.current && outputContextRef.current.state !== 'closed') {
      return outputContextRef.current;
    }
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    try {
      outputContextRef.current = outputDeviceId && outputDeviceId !== 'default'
        ? new AudioContextCtor({ sinkId: outputDeviceId })
        : new AudioContextCtor();
    } catch {
      outputContextRef.current = new AudioContextCtor();
    }
    await outputContextRef.current.resume().catch(() => {});
    outputQueueTimeRef.current = outputContextRef.current.currentTime;
    return outputContextRef.current;
  }

  async function playIncomingAudio(payload = {}) {
    if (!payload.pcmData) return;
    const context = await getOutputContext();
    const arrayBuffer = base64ToArrayBuffer(payload.pcmData);
    const pcm = new Int16Array(arrayBuffer);
    if (!pcm.length) return;
    const samples = pcm16ToFloat(pcm);
    const sampleRate = payload.sampleRate || INPUT_SAMPLE_RATE;
    const audioBuffer = context.createBuffer(1, samples.length, sampleRate);
    audioBuffer.copyToChannel(samples, 0);
    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(context.destination);
    const startAt = Math.max(context.currentTime + 0.01, outputQueueTimeRef.current || context.currentTime);
    outputQueueTimeRef.current = startAt + audioBuffer.duration;
    outputSourcesRef.current.add(source);
    setOutputLevel(rmsLevel(samples));
    source.onended = () => {
      outputSourcesRef.current.delete(source);
      if (!outputSourcesRef.current.size) {
        setOutputLevel(0);
      }
    };
    source.start(startAt);
  }

  function clearPlayback() {
    outputSourcesRef.current.forEach((source) => {
      try {
        source.stop(0);
      } catch {}
      source.disconnect();
    });
    outputSourcesRef.current.clear();
    if (outputContextRef.current) {
      outputQueueTimeRef.current = outputContextRef.current.currentTime;
    }
    setOutputLevel(0);
  }

  async function stopOutput() {
    clearPlayback();
    if (outputContextRef.current && outputContextRef.current.state !== 'closed') {
      await outputContextRef.current.close().catch(() => {});
    }
    outputContextRef.current = null;
  }

  useEffect(() => {
    let cancelled = false;
    if (!connected) {
      stopCapture().catch(() => {});
      stopOutput().catch(() => {});
      return undefined;
    }
    startCapture().catch((error) => {
      if (!cancelled) {
        useVoiceStore.setState({ connected: false, connectionState: 'error', error: error.message });
        window.zezenexcoderr.notify.show({ title: 'Microphone error', body: error.message, type: 'error' }).catch(() => {});
      }
    });
    return () => {
      cancelled = true;
      stopCapture().catch(() => {});
    };
  }, [connected, inputDeviceId]);

  useEffect(() => {
    stopOutput().catch(() => {});
  }, [outputDeviceId]);

  useEffect(() => () => {
    stopCapture().catch(() => {});
    stopOutput().catch(() => {});
  }, []);
}
