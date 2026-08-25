import { Eye, Code, Save, RefreshCw, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useProjectStore } from '@/store/projectStore';

export default function VisualPreviewPanel({ htmlOrJsxCode = '', onClose, onApplyToProject }) {
  const [activeTab, setActiveTab] = useState('preview');
  const projectPath = useProjectStore((state) => state.projectPath);

  const iframeSrcDoc = useMemo(() => {
    let cleanCode = String(htmlOrJsxCode || '').trim();
    // Strip markdown code fences
    cleanCode = cleanCode.replace(/^```(?:\w+)?\n?/, '').replace(/\n?```$/, '');

    // Inject Tailwind CDN & React fallback script if raw HTML/JSX snippet
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' https://cdn.tailwindcss.com; script-src 'unsafe-inline' https://cdn.tailwindcss.com; img-src data: blob:; font-src https://cdn.tailwindcss.com;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background-color: #0f172a; color: #f8fafc; font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; padding: 1rem; }
  </style>
</head>
<body>
  <div id="root">
    ${cleanCode}
  </div>
</body>
</html>`;
  }, [htmlOrJsxCode]);

  return (
    <div className="visual-preview-panel border-l border-subtle flex flex-col h-full bg-slate-950 text-slate-100">
      {/* Header */}
      <div className="flex-between p-3 border-b border-slate-800 bg-slate-900">
        <div className="flex-align gap-2 font-bold text-xs text-emerald-400">
          <Eye size={16} /> Vision-to-Code Live Preview
        </div>
        <div className="flex-align gap-2">
          <div className="flex bg-slate-800 p-1 rounded gap-1">
            <button
              className={`px-2 py-1 text-xs rounded ${activeTab === 'preview' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400'}`}
              onClick={() => setActiveTab('preview')}
            >
              <Eye size={12} className="inline mr-1" /> Visual
            </button>
            <button
              className={`px-2 py-1 text-xs rounded ${activeTab === 'code' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400'}`}
              onClick={() => setActiveTab('code')}
            >
              <Code size={12} className="inline mr-1" /> Code
            </button>
          </div>
          {onClose && (
            <button className="text-slate-400 hover:text-white" onClick={onClose}>
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden relative">
        {activeTab === 'preview' ? (
          <iframe
            className="w-full h-full border-0 bg-slate-900"
            title="Generated UI Live Preview"
            srcDoc={iframeSrcDoc}
            sandbox="allow-scripts"
          />
        ) : (
          <textarea
            className="w-full h-full p-4 font-mono text-xs bg-slate-900 text-slate-200 border-0 resize-none focus:outline-none"
            value={htmlOrJsxCode}
            readOnly
          />
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-slate-800 bg-slate-900 flex-between">
        <span className="text-xs text-slate-400">Tailwind CSS & React Component</span>
        <button
          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded flex-align gap-1"
          onClick={() => onApplyToProject?.(htmlOrJsxCode)}
        >
          <Save size={13} /> Save Component to Workspace
        </button>
      </div>
    </div>
  );
}
