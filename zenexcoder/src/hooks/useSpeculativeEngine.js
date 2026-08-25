import { useEffect, useRef } from 'react';
import { useAppStore } from '@/store/appStore';
import { useProjectStore } from '@/store/projectStore';
import { useSettingsStore } from '@/store/settingsStore';
import { speculativeHash, useSpeculativeStore } from '@/store/speculativeStore';

let globalListenersReady = false;
let globalDisposers = [];
let terminalBuffer = '';

function flattenTree(nodes = [], depth = 0, state = { count: 0 }) {
  if (!Array.isArray(nodes) || state.count > 120) return [];
  return nodes.flatMap((node) => {
    if (state.count > 120) return [];
    state.count += 1;
    return [
      `${'  '.repeat(depth)}${node.type === 'folder' ? 'dir' : 'file'} ${node.name}`,
      ...flattenTree(node.children || [], depth + 1, state)
    ];
  });
}

function openFileContext(openFiles = []) {
  return openFiles
    .slice(0, 4)
    .map((file) => [
      `File: ${file.path}`,
      '```',
      String(file.content || '').slice(0, 2400),
      '```'
    ].join('\n'))
    .join('\n\n');
}

function providerApiKey(activeModel, settings) {
  const providerKey = activeModel.provider === 'google' ? 'google' : activeModel.provider;
  return settings.apiKeys?.[providerKey] || '';
}

function buildPrompt(intent = {}) {
  if (intent.intentType === 'error_fix') {
    return [
      'Fix this terminal error. Identify the likely file and prepare a safe patch plan.',
      `Active file: ${intent.filePath || 'unknown'}`,
      'Terminal output:',
      intent.context
    ].join('\n\n');
  }
  if (intent.intentType === 'todo_completion') {
    return [
      'Complete this TODO with production-ready code. Keep the answer focused on the current file and line.',
      `File: ${intent.filePath}`,
      `Line ${intent.lineNumber}: ${intent.context}`,
      intent.fileContent ? `Current file:\n\`\`\`\n${intent.fileContent.slice(0, 6000)}\n\`\`\`` : ''
    ].filter(Boolean).join('\n\n');
  }
  if (intent.intentType === 'selection_action') {
    return [
      'The user selected code and paused. Predict the most useful improvement or fix.',
      `File: ${intent.filePath}`,
      `Selection:\n\`\`\`\n${intent.context}\n\`\`\``
    ].join('\n\n');
  }
  return [
    'The user pasted a large block and paused. Analyze it and prepare the most likely helpful completion or fix.',
    `File: ${intent.filePath}`,
    `Pasted/context:\n\`\`\`\n${intent.context}\n\`\`\``
  ].join('\n\n');
}

async function triggerShadowRun(intent = {}) {
  const speculative = useSpeculativeStore.getState();
  await speculative.loadSettings();
  const specSettings = speculative.settings;
  if (!specSettings.enabled) return;

  const activeModel = useAppStore.getState().activeModel;
  const settings = useSettingsStore.getState();
  const apiKey = providerApiKey(activeModel, settings);
  if (activeModel.provider !== 'ollama' && !apiKey) return;

  const prompt = buildPrompt(intent);
  const triggerHash = speculativeHash([
    intent.intentType,
    intent.filePath,
    intent.lineNumber || '',
    intent.context || ''
  ].join('\n'));
  const projectState = useProjectStore.getState();
  const payload = {
    enabled: specSettings.enabled,
    triggerHash,
    prompt,
    intent,
    provider: activeModel.provider,
    modelId: activeModel.modelId,
    apiKey,
    temperature: Math.min(settings.aiSettings.temperature ?? 0.2, 0.3),
    maxTokens: Math.min(settings.aiSettings.maxTokens || 2048, 2048),
    maxIterations: 3,
    maxCpuPercent: specSettings.maxCpuPercent,
    maxMemoryPercent: specSettings.maxMemoryPercent,
    projectPath: projectState.projectPath,
    projectContext: {
      fileTree: flattenTree(projectState.fileTree).join('\n'),
      openFiles: openFileContext(projectState.openFiles)
    }
  };
  speculative.markShadow({ triggerHash, intent, startedAt: Date.now() });
  const result = await window.zezenexcoderr.speculative.trigger(payload).catch((error) => ({ ok: false, reason: error.message }));
  if (!result?.ok) {
    useSpeculativeStore.setState({ activeShadow: null });
  }
}

function ensureGlobalListeners() {
  if (globalListenersReady) return;
  globalListenersReady = true;
  useSpeculativeStore.getState().loadSettings().catch(() => {});
  if (!window.zezenexcoderr?.speculative || !window.zezenexcoderr?.terminal || !window.zezenexcoderr?.git || !window.zezenexcoderr?.file) {
    return;
  }
  globalDisposers = [
    window.zezenexcoderr.speculative.onCacheReady((payload) => useSpeculativeStore.getState().applyCacheReady(payload)),
    window.zezenexcoderr.terminal.onData((payload) => {
      const data = payload.data || '';
      terminalBuffer = `${terminalBuffer}${data}`.slice(-6000);
      if (!/(Error:|Exception|Traceback|Unhandled|failed|stack)/i.test(terminalBuffer)) return;
      const context = terminalBuffer.slice(-2500);
      const activeFile = useProjectStore.getState().getActiveFile?.();
      window.clearTimeout(ensureGlobalListeners.terminalTimer);
      ensureGlobalListeners.terminalTimer = window.setTimeout(() => {
        triggerShadowRun({
          intentType: 'error_fix',
          context,
          filePath: activeFile?.path || '',
          lineNumber: null
        });
      }, Math.max(2000, useSpeculativeStore.getState().settings.idleDelayMs || 3000));
    }),
    window.zezenexcoderr.git.onStatusChanged(() => useSpeculativeStore.getState().clearCache('Git state changed.')),
    window.zezenexcoderr.file.onSaved(() => useSpeculativeStore.getState().clearCache('File saved.'))
  ];
}

/**
 * @param {{editor?: object | null, monaco?: object | null, activeFile?: object | null}} params
 */
export function useSpeculativeEngine(params = {}) {
  const { editor = null, monaco = null, activeFile = null } = params;
  const todoTimer = useRef(null);
  const selectionTimer = useRef(null);
  const pasteTimer = useRef(null);

  useEffect(() => {
    ensureGlobalListeners();
    return () => {};
  }, []);

  useEffect(() => {
    if (!editor || !monaco || !activeFile) return undefined;
    const model = editor.getModel();
    if (!model) return undefined;

    function abortForUserEdit() {
      window.zezenexcoderr.speculative.abort({ reason: 'User resumed typing.' }).catch(() => {});
      useSpeculativeStore.setState({ activeShadow: null });
    }

    function scheduleTodoCheck(delay = Math.max(2000, useSpeculativeStore.getState().settings.idleDelayMs || 3000)) {
      window.clearTimeout(todoTimer.current);
      todoTimer.current = window.setTimeout(() => {
        const position = editor.getPosition();
        if (!position) return;
        const lineText = model.getLineContent(position.lineNumber);
        if (!/(TODO:|FIXME:)/i.test(lineText)) return;
        triggerShadowRun({
          intentType: 'todo_completion',
          context: lineText.trim(),
          filePath: activeFile.path,
          lineNumber: position.lineNumber,
          fileContent: model.getValue()
        });
      }, delay);
    }

    const changeDisposable = editor.onDidChangeModelContent((event) => {
      abortForUserEdit();
      scheduleTodoCheck();
      const pasted = (event.changes || []).find((change) => String(change.text || '').length > 400);
      if (pasted) {
        window.clearTimeout(pasteTimer.current);
        pasteTimer.current = window.setTimeout(() => {
          const position = editor.getPosition();
          triggerShadowRun({
            intentType: 'large_paste',
            context: pasted.text.slice(0, 3000),
            filePath: activeFile.path,
            lineNumber: position?.lineNumber || null
          });
        }, Math.max(2500, useSpeculativeStore.getState().settings.idleDelayMs || 3000));
      }
    });

    const selectionDisposable = editor.onDidChangeCursorSelection((event) => {
      window.clearTimeout(selectionTimer.current);
      const text = model.getValueInRange(event.selection || editor.getSelection());
      if (!text || text.length < 80) return;
      selectionTimer.current = window.setTimeout(() => {
        triggerShadowRun({
          intentType: 'selection_action',
          context: text.slice(0, 3000),
          filePath: activeFile.path,
          lineNumber: event.selection?.startLineNumber || null
        });
      }, Math.max(3000, useSpeculativeStore.getState().settings.idleDelayMs || 3000));
    });

    scheduleTodoCheck(Math.max(2200, useSpeculativeStore.getState().settings.idleDelayMs || 3000));

    return () => {
      changeDisposable.dispose();
      selectionDisposable.dispose();
      window.clearTimeout(todoTimer.current);
      window.clearTimeout(selectionTimer.current);
      window.clearTimeout(pasteTimer.current);
    };
  }, [activeFile, editor, monaco]);
}
