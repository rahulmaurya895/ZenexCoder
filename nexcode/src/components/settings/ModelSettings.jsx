import { useSettingsStore } from '@/store/settingsStore';

export default function ModelSettings() {
  const aiSettings = useSettingsStore((state) => state.aiSettings);
  const editorSettings = useSettingsStore((state) => state.editorSettings);
  const updateAiSettings = useSettingsStore((state) => state.updateAiSettings);
  const updateEditorSettings = useSettingsStore((state) => state.updateEditorSettings);

  return (
    <>
      <div className="settings-section">
        <div className="panel-title">Model Settings</div>
        <div className="form-row">
          <label>Temperature</label>
          <input type="range" min="0" max="2" step="0.1" value={aiSettings.temperature} onChange={(event) => updateAiSettings({ temperature: Number(event.target.value) })} />
        </div>
        <div className="form-row">
          <label>Max Tokens</label>
          <input type="number" value={aiSettings.maxTokens} onChange={(event) => updateAiSettings({ maxTokens: Number(event.target.value) })} />
        </div>
        <div className="form-row">
          <label>Context Messages</label>
          <input type="number" value={aiSettings.contextMessages} onChange={(event) => updateAiSettings({ contextMessages: Number(event.target.value) })} />
        </div>
        <div className="form-row">
          <label>Streaming</label>
          <input type="checkbox" checked={aiSettings.streaming} onChange={(event) => updateAiSettings({ streaming: event.target.checked })} />
        </div>
        <div className="form-row">
          <label>System Prompt</label>
          <textarea rows={5} value={aiSettings.systemPrompt} onChange={(event) => updateAiSettings({ systemPrompt: event.target.value })} />
        </div>
      </div>
      <div className="settings-section">
        <div className="panel-title">Editor Settings</div>
        <div className="form-row">
          <label>Font Size</label>
          <input type="number" min="12" max="24" value={editorSettings.fontSize} onChange={(event) => updateEditorSettings({ fontSize: Number(event.target.value) })} />
        </div>
        <div className="form-row">
          <label>Font Family</label>
          <input value={editorSettings.fontFamily} onChange={(event) => updateEditorSettings({ fontFamily: event.target.value })} />
        </div>
        <div className="form-row">
          <label>Tab Size</label>
          <select value={editorSettings.tabSize} onChange={(event) => updateEditorSettings({ tabSize: Number(event.target.value) })}>
            <option value={2}>2 spaces</option>
            <option value={4}>4 spaces</option>
          </select>
        </div>
        <div className="form-row">
          <label>Word Wrap</label>
          <input type="checkbox" checked={editorSettings.wordWrap} onChange={(event) => updateEditorSettings({ wordWrap: event.target.checked })} />
        </div>
        <div className="form-row">
          <label>Minimap</label>
          <input type="checkbox" checked={editorSettings.minimap} onChange={(event) => updateEditorSettings({ minimap: event.target.checked })} />
        </div>
      </div>
    </>
  );
}
