import { useEffect, useMemo, useRef, useState } from 'react';
import Editor, { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import { Bug, FileText, Languages, MessageSquareText, Save, ScanSearch, Sparkles, TestTube2, Wand2 } from 'lucide-react';
import { useProjectStore } from '@/store/projectStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useChatStore } from '@/store/chatStore';
import { useVoiceStore } from '@/store/voiceStore';
import { useAI } from '@/hooks/useAI';
import { useSpeculativeEngine } from '@/hooks/useSpeculativeEngine';
import { firstCodeBlock } from '@/utils/codeParser';
import { detectLanguage } from '@/utils/fileUtils';
import DiffViewer from './DiffViewer';
import GhostTextOverlay from './GhostTextOverlay';
import TabManager from './TabManager';

self.MonacoEnvironment = {
  getWorker(_workerId, label) {
    if (label === 'json') return new jsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker();
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    return new editorWorker();
  }
};

loader.config({ monaco });

export default function CodeEditor() {
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const voiceContextTimerRef = useRef(null);
  const [editorApi, setEditorApi] = useState({ editor: null, monaco: null });
  const [diff, setDiff] = useState(null);
  const [targetLang, setTargetLang] = useState('typescript');
  const activeFileId = useProjectStore((state) => state.activeFileId);
  const activeFile = useProjectStore((state) => state.getActiveFile());
  const updateFileContent = useProjectStore((state) => state.updateFileContent);
  const saveFile = useProjectStore((state) => state.saveFile);
  const writeNewFile = useProjectStore((state) => state.writeNewFile);
  const openVirtualFile = useProjectStore((state) => state.openVirtualFile);
  const editorSettings = useSettingsStore((state) => state.editorSettings);
  const addMessage = useChatStore((state) => state.addMessage);
  const activeSessionId = useChatStore((state) => state.activeSessionId);
  const sendVoiceContextUpdate = useVoiceStore((state) => state.sendContextUpdate);
  const {
    completeCode,
    explainCode,
    refactorCode,
    fixBugs,
    generateTests,
    addDocs,
    translateCode,
    reviewCode
  } = useAI();

  const selectedText = () => {
    const editor = editorRef.current;
    if (!editor) return '';
    const selection = editor.getSelection();
    return editor.getModel()?.getValueInRange(selection) || '';
  };

  const codeForAction = () => selectedText() || activeFile?.content || '';
  const language = activeFile?.language || detectLanguage(activeFile?.path);
  useSpeculativeEngine({ editor: editorApi.editor, monaco: editorApi.monaco, activeFile });

  const options = useMemo(
    () => ({
      fontSize: editorSettings.fontSize,
      fontFamily: editorSettings.fontFamily,
      tabSize: editorSettings.tabSize,
      minimap: { enabled: editorSettings.minimap },
      wordWrap: editorSettings.wordWrap ? 'on' : 'off',
      bracketPairColorization: { enabled: true },
      automaticLayout: true,
      scrollBeyondLastLine: false,
      renderWhitespace: 'selection'
    }),
    [editorSettings]
  );

  useEffect(() => {
    const save = () => activeFileId && saveFile(activeFileId);
    const disposers = [
      window.nexcode.app.onMenu('menu:save-file', save),
      window.nexcode.app.onMenu('menu:ai-complete', () => handleComplete()),
      window.nexcode.app.onMenu('menu:ai-explain', () => handleExplain()),
      window.nexcode.app.onMenu('menu:ai-fix', () => handleFix()),
      window.nexcode.app.onMenu('menu:ai-refactor', () => handleRefactor()),
      window.nexcode.app.onMenu('menu:ai-tests', () => handleTests())
    ];
    return () => disposers.forEach((dispose) => dispose());
  });

  useEffect(() => () => {
    if (voiceContextTimerRef.current) {
      clearTimeout(voiceContextTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!activeFile) return undefined;
    if (voiceContextTimerRef.current) {
      clearTimeout(voiceContextTimerRef.current);
    }
    voiceContextTimerRef.current = window.setTimeout(() => {
      sendVoiceContextUpdate({ filePath: activeFile.path, content: activeFile.content || '' });
    }, 500);
    return () => {
      if (voiceContextTimerRef.current) {
        clearTimeout(voiceContextTimerRef.current);
      }
    };
  }, [activeFile?.path, sendVoiceContextUpdate]);

  function handleEditorChange(value) {
    const content = value || '';
    updateFileContent(activeFile.id, content);
    if (voiceContextTimerRef.current) {
      clearTimeout(voiceContextTimerRef.current);
    }
    voiceContextTimerRef.current = window.setTimeout(() => {
      sendVoiceContextUpdate({ filePath: activeFile.path, content });
    }, 1000);
  }

  async function handleComplete() {
    const editor = editorRef.current;
    const model = editor?.getModel();
    const position = editor?.getPosition();
    if (!editor || !model || !position) return;
    const before = model.getValueInRange({
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: position.lineNumber,
      endColumn: position.column
    });
    const after = model.getValueInRange({
      startLineNumber: position.lineNumber,
      startColumn: position.column,
      endLineNumber: model.getLineCount(),
      endColumn: model.getLineMaxColumn(model.getLineCount())
    });
    await completeCode({
      before,
      after,
      language,
      onToken: (token) => editor.trigger('nexcode', 'type', { text: token })
    });
  }

  async function handleExplain() {
    const code = codeForAction();
    if (!code) return;
    await addMessage('user', `Explain ${activeFile?.name || 'selected code'}`);
    await addMessage('assistant', await explainCode(code, language));
  }

  async function handleRefactor() {
    const code = codeForAction();
    if (!code) return;
    const result = await refactorCode(code, language);
    const block = firstCodeBlock(result);
    setDiff({ original: code, updated: block?.code || result });
    await addMessage('assistant', result);
  }

  async function handleFix() {
    const code = codeForAction();
    if (!code) return;
    const result = await fixBugs(code, language);
    const block = firstCodeBlock(result);
    setDiff({ original: code, updated: block?.code || result });
    await addMessage('assistant', result);
  }

  async function handleDocs() {
    const code = codeForAction();
    if (!code || !activeFile) return;
    const result = await addDocs(code, language);
    const block = firstCodeBlock(result);
    const updated = block?.code || result;
    await window.nexcode.review.add({
      sessionId: activeSessionId,
      filePath: activeFile.path,
      beforeContent: activeFile.content,
      afterContent: updated,
      explanation: 'AI documentation update'
    }).catch(() => {});
    updateFileContent(activeFile.id, updated);
  }

  async function handleTranslate() {
    const code = codeForAction();
    if (!code) return;
    const result = await translateCode(code, language, targetLang);
    const block = firstCodeBlock(result);
    openVirtualFile({
      name: `${activeFile?.name || 'translated'}.${targetLang}.txt`,
      language: targetLang,
      content: block?.code || result
    });
  }

  async function handleReview() {
    const code = codeForAction();
    if (!code) return;
    await addMessage('user', `Review ${activeFile?.name || 'selected code'}`);
    await addMessage('assistant', await reviewCode(code, language));
  }

  async function handleTests() {
    if (!activeFile) return;
    const path = await generateTests(activeFile, writeNewFile);
    const created = await window.nexcode.file.read(path).catch(() => ({ content: '' }));
    await window.nexcode.review.add({
      sessionId: activeSessionId,
      filePath: path,
      beforeContent: '',
      afterContent: created.content || '',
      explanation: `Generated tests for ${activeFile.name}`
    }).catch(() => {});
    await addMessage('assistant', `Generated tests at ${path}`);
  }

  async function applyDiff() {
    if (!activeFile || !diff) return;
    await window.nexcode.review.add({
      sessionId: activeSessionId,
      filePath: activeFile.path,
      beforeContent: activeFile.content,
      afterContent: diff.updated,
      explanation: 'AI diff applied in editor'
    }).catch(() => {});
    updateFileContent(activeFile.id, diff.updated);
    setDiff(null);
  }

  function handleEditorMount(editor, monacoInstance) {
    editorRef.current = editor;
    monacoRef.current = monacoInstance;
    setEditorApi({ editor, monaco: monacoInstance });
    editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.Space, handleComplete);
    editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyMod.Shift | monacoInstance.KeyCode.KeyE, handleExplain);
    editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyMod.Shift | monacoInstance.KeyCode.KeyF, handleFix);
    editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyMod.Shift | monacoInstance.KeyCode.KeyR, handleRefactor);
    editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyMod.Shift | monacoInstance.KeyCode.KeyT, handleTests);
    editor.onContextMenu(() => {});
  }

  if (!activeFile) {
    return (
      <section className="editor-shell">
        <TabManager />
        <div className="editor-toolbar" />
        <div className="empty-state">
          <div className="empty-state-inner">
            <h2>Open a file to start coding</h2>
            <p>Use the file tree or open a folder. AI actions will use your selected model.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="editor-shell">
      <TabManager />
      <div className="editor-toolbar">
        <button onClick={() => saveFile(activeFile.id)} disabled={activeFile.virtual}>
          <Save size={14} /> Save
        </button>
        <button onClick={handleComplete}>
          <Sparkles size={14} /> Complete
        </button>
        <button onClick={handleExplain}>
          <MessageSquareText size={14} /> Explain
        </button>
        <button onClick={handleRefactor}>
          <Wand2 size={14} /> Refactor
        </button>
        <button onClick={handleFix}>
          <Bug size={14} /> Scan for Bugs
        </button>
        <button onClick={handleTests}>
          <TestTube2 size={14} /> Generate Tests
        </button>
        <button onClick={handleDocs}>
          <FileText size={14} /> Add Docs
        </button>
        <select style={{ width: 130 }} value={targetLang} onChange={(event) => setTargetLang(event.target.value)}>
          <option value="typescript">TypeScript</option>
          <option value="python">Python</option>
          <option value="go">Go</option>
          <option value="rust">Rust</option>
          <option value="java">Java</option>
        </select>
        <button onClick={handleTranslate}>
          <Languages size={14} /> Translate
        </button>
        <button onClick={handleReview}>
          <ScanSearch size={14} /> AI Code Review
        </button>
      </div>
      <div className="monaco-host">
        <GhostTextOverlay editor={editorApi.editor} monaco={editorApi.monaco} activeFile={activeFile} />
        <Editor
          path={activeFile.path}
          value={activeFile.content}
          language={activeFile.language}
          theme={document.documentElement.dataset.theme === 'light' ? 'light' : 'vs-dark'}
          options={options}
          onMount={handleEditorMount}
          onChange={handleEditorChange}
        />
      </div>
      {diff && <DiffViewer original={diff.original} updated={diff.updated} onApply={applyDiff} onReject={() => setDiff(null)} />}
    </section>
  );
}
