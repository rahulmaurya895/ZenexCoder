import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { BookMarked, Copy, FilePlus2, Play } from 'lucide-react';
import { looksLikeCommand } from '@/utils/codeParser';
import { useProjectStore } from '@/store/projectStore';
import { useChatStore } from '@/store/chatStore';
import { predictiveCacheMarker } from '@/store/speculativeStore';
import ReviewButton from '@/components/review/ReviewButton';

function extractTextContent(node) {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractTextContent).join('');
  if (node && typeof node === 'object') {
    if (node.props?.children) return extractTextContent(node.props.children);
    if (Array.isArray(node.children)) return node.children.map(extractTextContent).join('');
  }
  return '';
}

function languageFromClass(className = '') {
  return className.replace('language-', '').replace('hljs', '').trim() || 'plaintext';
}

/**
 * @param {{message: {role: string, content: string, id?: string}, highlight?: boolean}} props
 */
export default function MessageBubble({ message, highlight = false }) {
  const [pluginState, setPluginState] = useState({ enabled: {} });
  const openVirtualFile = useProjectStore((state) => state.openVirtualFile);
  const projectPath = useProjectStore((state) => state.projectPath);
  const loadFiles = useProjectStore((state) => state.loadFiles);
  const addMessage = useChatStore((state) => state.addMessage);
  const snippetEnabled = pluginState.enabled?.['snippet-library'] !== false;
  const servedFromCache = String(message.content || '').startsWith(predictiveCacheMarker);
  const displayContent = servedFromCache ? String(message.content || '').replace(predictiveCacheMarker, '').trimStart() : message.content || '';
  const hasCodeBlock = /```/.test(displayContent || '');
  const run = message.run || (message.attachments || []).find((attachment) => attachment?.type === 'run-status');
  const activity = run?.activity || [];

  useEffect(() => {
    window.zenexcoder.store.get('plugins', { enabled: {} }).then(setPluginState).catch(() => {});
  }, []);

  async function saveFileToProject(code, language) {
    const ext = language === 'python' ? 'py' : language === 'javascript' ? 'js' : language === 'typescript' ? 'ts' : language === 'html' ? 'html' : language === 'css' ? 'css' : 'txt';
    const defaultName = language === 'python' ? 'calculator.py' : `app.${ext}`;
    const fileName = window.prompt(`Enter file name to save in project (${projectPath || 'virtual editor'}):`, defaultName);
    if (!fileName || !fileName.trim()) return;
    const cleanName = fileName.trim();
    if (projectPath) {
      const fullPath = `${projectPath}/${cleanName}`;
      await window.zenexcoder.file.write(fullPath, code);
      await loadFiles(projectPath);
      await addMessage('system', `Saved file ${cleanName} to project folder: ${projectPath}`);
    } else {
      await openVirtualFile({ name: cleanName, content: code, language });
      await addMessage('system', `Opened ${cleanName} in editor.`);
    }
  }

  async function runCommand(command) {
    if (!window.confirm(`Run command?\n\n${command}`)) {
      return;
    }
    let output = '';
    const runner = window.zenexcoder.terminal.run(
      { command },
      {
        onOutput: (payload) => {
          output += payload.data;
        },
        onExit: async (payload) => {
          await addMessage('assistant', `Command exited with ${payload.code}\n\n\`\`\`text\n${output}\n\`\`\``);
          runner.dispose();
        }
      }
    );
  }

  async function saveSnippet(code, language) {
    await window.zenexcoder.db.addSnippet({
      type: 'message-code',
      inputCode: message.content || '',
      outputCode: code,
      language,
      modelUsed: message.modelId || ''
    });
    await addMessage('system', `Saved ${language || 'text'} snippet to the snippet library.`);
  }

  const roleLabel = message.role === 'assistant' ? 'Assistant' : message.role === 'system' ? 'System' : 'You';

  const hasXmlMetaPrompt = typeof message.content === 'string' && message.content.includes('<objective>');

  return (
    <div className={`message ${message.role} ${highlight ? 'highlight' : ''}`}>
      <div className="message-header flex-between">
        <span>{roleLabel}</span>
        {hasXmlMetaPrompt && (
          <span className="text-xs text-accent font-semibold flex-align gap-1">
            ✨ Auto-Optimized XML Prompt
          </span>
        )}
      </div>
      {servedFromCache && <div className="predictive-cache-badge">Served from Predictive Cache</div>}

      {hasXmlMetaPrompt && (
        <details className="meta-prompt-accordion my-2 p-2 rounded border-purple-subtle bg-purple-subtle text-xs">
          <summary className="cursor-pointer font-bold text-accent">
            View Structured XML Meta-Prompt (&lt;800ms CoT Expansion)
          </summary>
          <pre className="font-mono text-xs mt-2 p-2 bg-black-50 rounded overflow-x-auto text-subtle">
            {message.content}
          </pre>
        </details>
      )}

      <div className="message-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          code({ inline, className, children }) {
            const rawCode = extractTextContent(children);
            const code = rawCode.replace(/\n$/, '');
            const language = languageFromClass(className);
            if (inline) {
              return <code className="inline-code">{children}</code>;
            }
            return (
              <div className="code-block">
                <div className="code-block-header">
                  <span>{language}</span>
                  <div className="code-block-actions">
                    <button className="icon-button" onClick={() => saveFileToProject(code, language)} title="Save file to project folder">
                      <FilePlus2 size={14} /> Save File
                    </button>
                    <button className="icon-button" onClick={() => navigator.clipboard.writeText(code)} title="Copy code">
                      <Copy size={14} />
                    </button>
                    {snippetEnabled && (
                      <button className="icon-button" onClick={() => saveSnippet(code, language)} title="Save snippet">
                        <BookMarked size={14} />
                      </button>
                    )}
                    {looksLikeCommand(code) && (
                      <button className="icon-button" onClick={() => runCommand(code)} title="Run in terminal">
                        <Play size={14} />
                      </button>
                    )}
                  </div>
                </div>
                <pre>
                  <code className={className}>{children}</code>
                </pre>
              </div>
            );
          }
        }}
      >

        {displayContent || (message.id === 'streaming' ? 'Thinking...' : '')}
      </ReactMarkdown>
      </div>
      {run && (
        <details className={`run-status ${run.failed ? 'failed' : ''}`} open={message.id === 'streaming'}>
          <summary>{message.id === 'streaming' ? `Working: ${run.status || 'Starting...'}` : `${run.failed ? 'Stopped' : 'Completed'}${run.duration ? ` in ${run.duration}` : ''}`}</summary>
          <div className="run-status-meta">
            {run.modelId && <span>{run.provider ? `${run.provider} · ` : ''}{run.modelId}</span>}
            {activity.length > 0 && <span>{activity.length} step{activity.length === 1 ? '' : 's'}</span>}
          </div>
          {activity.length > 0 && <ol className="run-status-activity">{activity.map((item, index) => <li key={`${item.message}-${index}`}>{item.message}</li>)}</ol>}
        </details>
      )}
      {message.role === 'assistant' && message.id !== 'streaming' && hasCodeBlock && <ReviewButton sourceId={message.id} />}
      {message.id === 'streaming' && <span className="streaming-cursor" />}
    </div>
  );
}
