import { Clipboard, Download, FileInput, Upload, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useApprovalAction } from '@/hooks/useApprovalAction';
import { parseDotEnv, serializeDotEnv } from '@/utils/envParser';

function ImportPreview({ vars, existingKeys, onConfirm, onClose }) {
  const [checked, setChecked] = useState(() => Object.fromEntries(vars.map((item) => [item.key, true])));
  const selected = vars.filter((item) => checked[item.key]);

  return (
    <div className="env-modal-backdrop">
      <div className="env-import-modal">
        <div className="panel-header">
          <span className="panel-title">Import variables</span>
          <div className="top-bar-spacer" />
          <button className="icon-button" onClick={onClose} title="Close import preview">
            <X size={14} />
          </button>
        </div>
        <p>These variables will be imported. Uncheck any to skip.</p>
        <div className="env-import-list">
          {vars.map((item) => (
            <label key={item.key} className="env-import-row">
              <input type="checkbox" checked={Boolean(checked[item.key])} onChange={(event) => setChecked((state) => ({ ...state, [item.key]: event.target.checked }))} />
              <code>{item.key}</code>
              {existingKeys.has(item.key) && <span className="overwrite-badge">Overwrite</span>}
            </label>
          ))}
        </div>
        <div className="chat-input-actions">
          <button className="primary-button" onClick={() => onConfirm(selected)} disabled={!selected.length}>
            Import {selected.length}
          </button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default function EnvImportExport({ env, projectPath, store }) {
  const [preview, setPreview] = useState([]);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [rawText, setRawText] = useState('');
  const { runWithApproval } = useApprovalAction();
  const existingKeys = useMemo(() => new Set((env.vars || []).map((item) => item.key)), [env.vars]);
  const exportable = (env.vars || []).filter((item) => item.enabled !== false && !item.masked);
  const maskedCount = (env.vars || []).filter((item) => item.enabled !== false && item.masked).length;

  async function importFile() {
    const [filePath] = await window.nexcode.file.openDialog({
      filters: [{ name: 'Environment files', extensions: ['env', 'local', '*'] }]
    });
    if (!filePath) return;
    const raw = await window.nexcode.env.readDotFile(filePath);
    setPreview(parseDotEnv(raw));
  }

  function previewPaste() {
    setPreview(parseDotEnv(rawText));
    setPasteOpen(false);
    setRawText('');
  }

  async function confirmImport(vars) {
    await store.importVars(projectPath, env.id, vars);
    setPreview([]);
  }

  async function exportFile() {
    const defaultPath = `${projectPath}${projectPath.includes('\\') ? '\\' : '/'}${env.type === 'development' ? '.env' : `.env.${env.name}`}`;
    const target = window.prompt('Export .env file path', defaultPath);
    if (!target) return;
    const content = serializeDotEnv(env.vars || []);
    const result = await runWithApproval(
      {
        actionType: 'file_write',
        title: 'Export env to .env file',
        description: `Export env to .env file\n${target}`
      },
      () => window.nexcode.env.writeDotFile(target, content)
    );
    if (!result) return;
    await window.nexcode.notify.show({
      title: '.env exported',
      body: `${target}${maskedCount ? ` (${maskedCount} masked excluded)` : ''}`
    });
  }

  async function copyEnvText() {
    await navigator.clipboard.writeText(serializeDotEnv(env.vars || []));
    await window.nexcode.notify.show({
      title: '.env copied',
      body: maskedCount ? `${maskedCount} masked variables excluded.` : 'Environment text copied.'
    });
  }

  return (
    <div className="env-import-export">
      {preview.length > 0 && (
        <ImportPreview vars={preview} existingKeys={existingKeys} onConfirm={confirmImport} onClose={() => setPreview([])} />
      )}
      <div className="chat-input-actions">
        <button onClick={importFile}>
          <FileInput size={14} /> Import from .env file
        </button>
        <button onClick={() => setPasteOpen((value) => !value)}>
          <Clipboard size={14} /> Paste .env text
        </button>
        <button onClick={exportFile} disabled={!exportable.length}>
          <Upload size={14} /> Export to .env file
        </button>
        <button onClick={copyEnvText} disabled={!exportable.length}>
          <Download size={14} /> Copy as .env text
        </button>
      </div>
      {maskedCount > 0 && <div className="muted-text">{maskedCount} masked variables excluded from export and clipboard copy.</div>}
      {pasteOpen && (
        <div className="env-paste-box">
          <textarea rows={6} value={rawText} onChange={(event) => setRawText(event.target.value)} placeholder="KEY=value" />
          <div className="chat-input-actions">
            <button className="primary-button" onClick={previewPaste}>Preview import</button>
            <button onClick={() => setPasteOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
