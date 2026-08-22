import { Download, GitCommit, Plus, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useChatStore } from '@/store/chatStore';
import { useProjectStore } from '@/store/projectStore';
import { useAI } from '@/hooks/useAI';
import { BUILT_IN_PLUGINS } from './pluginRegistry';
import PluginCard from './PluginCard';

export default function PluginsPanel() {
  const [enabled, setEnabled] = useState({});
  const [customPlugins, setCustomPlugins] = useState([]);
  const [form, setForm] = useState({ name: '', trigger: '', prompt: '' });
  const [snippets, setSnippets] = useState([]);
  const [commitMessage, setCommitMessage] = useState('');
  const addMessage = useChatStore((state) => state.addMessage);
  const messages = useChatStore((state) => state.messages);
  const sessions = useChatStore((state) => state.sessions);
  const activeSessionId = useChatStore((state) => state.activeSessionId);
  const projectPath = useProjectStore((state) => state.projectPath);
  const openVirtualFile = useProjectStore((state) => state.openVirtualFile);
  const { streamText } = useAI();

  useEffect(() => {
    window.zenexcoder.store.get('plugins', { enabled: {}, customPlugins: [] }).then((saved) => {
      setEnabled(saved.enabled || {});
      setCustomPlugins(saved.customPlugins || []);
    });
    window.zenexcoder.db.listSnippets().then(setSnippets).catch(() => {});
  }, []);

  async function persist(nextEnabled = enabled, nextCustom = customPlugins) {
    await window.zenexcoder.store.set('plugins', { enabled: nextEnabled, customPlugins: nextCustom });
  }

  async function toggle(id) {
    const next = { ...enabled, [id]: !enabled[id] };
    setEnabled(next);
    await persist(next);
  }

  async function addCustom() {
    if (!form.name.trim()) return;
    const next = [...customPlugins, { id: `custom-${Date.now()}`, ...form }];
    setCustomPlugins(next);
    setForm({ name: '', trigger: '', prompt: '' });
    await persist(enabled, next);
  }

  async function generateCommitMessage() {
    let diff = '';
    const runner = window.zenexcoder.terminal.run(
      { command: 'git', args: ['diff', '--staged'], shell: false, cwd: projectPath || undefined },
      {
        onOutput: (payload) => {
          diff += payload.data;
        },
        onExit: async () => {
          const message = await streamText({ prompt: `Generate one conventional commit message for this staged diff:\n\n${diff || 'No staged diff found.'}` });
          const cleaned = message.trim().split('\n')[0].replace(/^["']|["']$/g, '');
          setCommitMessage(cleaned);
          await addMessage('assistant', cleaned);
          runner.dispose();
        }
      }
    );
  }

  async function commitStagedChanges() {
    if (!commitMessage.trim()) return;
    let output = '';
    const runner = window.zenexcoder.terminal.run(
      { command: 'git', args: ['commit', '-m', commitMessage.trim()], shell: false, cwd: projectPath || undefined },
      {
        onOutput: (payload) => {
          output += payload.data;
        },
        onExit: async (payload) => {
          await addMessage('assistant', `git commit exited with ${payload.code}\n\n\`\`\`text\n${output}\n\`\`\``);
          runner.dispose();
        }
      }
    );
  }

  async function exportPdf() {
    const session = sessions.find((item) => item.id === activeSessionId);
    await window.zenexcoder.export.chatPdf({
      title: session?.title || 'ZezenexCoderr Chat',
      messages
    });
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <span className="panel-title">Plugins</span>
      </div>
      <div className="panel-body settings-grid">
        {BUILT_IN_PLUGINS.map((plugin) => (
          <PluginCard key={plugin.id} plugin={plugin} enabled={enabled[plugin.id] !== false} onToggle={() => toggle(plugin.id)}>
            {plugin.id === 'markdown-exporter' && (
              <button onClick={exportPdf}>
                <Download size={14} /> Export chat as PDF
              </button>
            )}
            {plugin.id === 'snippet-library' && (
              <div className="snippet-list">
                {snippets.slice(0, 8).map((snippet) => (
                  <button
                    key={snippet.id}
                    onClick={() =>
                      openVirtualFile({
                        name: `snippet-${snippet.id}.${snippet.language || 'txt'}`,
                        language: snippet.language || 'plaintext',
                        content: snippet.outputCode || ''
                      })
                    }
                  >
                    Insert {snippet.type} - {snippet.language || 'text'}
                  </button>
                ))}
              </div>
            )}
            {plugin.id === 'commit-message-generator' && (
              <div className="plugin-action-stack">
                <button onClick={generateCommitMessage}>
                  <GitCommit size={14} /> Generate Commit Message
                </button>
                <input value={commitMessage} onChange={(event) => setCommitMessage(event.target.value)} placeholder="Commit message" />
                <button onClick={commitStagedChanges} disabled={!commitMessage.trim()}>
                  <GitCommit size={14} /> Use Message & Commit
                </button>
              </div>
            )}
          </PluginCard>
        ))}
        <div className="settings-section">
          <div className="panel-title">Add Custom Prompt Plugin</div>
          <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Plugin name" />
          <input value={form.trigger} onChange={(event) => setForm({ ...form, trigger: event.target.value })} placeholder="Trigger phrase" />
          <textarea rows={4} value={form.prompt} onChange={(event) => setForm({ ...form, prompt: event.target.value })} placeholder="Prompt template" />
          <button className="primary-button" onClick={addCustom}>
            <Plus size={14} /> Add Plugin
          </button>
          {customPlugins.map((plugin) => (
            <div className="attachment-pill" key={plugin.id}>
              <Save size={14} /> {plugin.name} ({plugin.trigger})
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
