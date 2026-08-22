import { useState } from 'react';
import { ChevronDown, ChevronRight, File, Folder, FolderOpen, MoreHorizontal } from 'lucide-react';
import { useProjectStore } from '@/store/projectStore';
import { useAI } from '@/hooks/useAI';
import { useChatStore } from '@/store/chatStore';
import { detectLanguage } from '@/utils/fileUtils';

function TreeNode({ node, depth = 0 }) {
  const [open, setOpen] = useState(depth < 1);
  const [menu, setMenu] = useState(null);
  const openFile = useProjectStore((state) => state.openFile);
  const refreshTree = useProjectStore((state) => state.refreshTree);
  const writeNewFile = useProjectStore((state) => state.writeNewFile);
  const addMessage = useChatStore((state) => state.addMessage);
  const { explainCode, reviewCode, generateTests } = useAI();
  const isFolder = node.type === 'folder';

  async function readNodeFile() {
    const result = await window.zenexcoder.file.read(node.path);
    return result.content;
  }

  async function runAiAction(action) {
    const content = await readNodeFile();
    const language = detectLanguage(node.path);
    await addMessage('user', `${action} ${node.name}`);
    if (action === 'Explain') {
      await addMessage('assistant', await explainCode(content, language));
    }
    if (action === 'Review') {
      await addMessage('assistant', await reviewCode(content, language));
    }
    if (action === 'Tests') {
      await generateTests({ path: node.path, content, language }, writeNewFile);
      await addMessage('assistant', `Generated tests for ${node.name}.`);
    }
  }

  return (
    <div>
      <div
        className="tree-row"
        draggable={!isFolder}
        onDragStart={(event) => event.dataTransfer.setData('text/plain', node.path)}
        onClick={() => (isFolder ? setOpen(!open) : openFile(node.path))}
        onContextMenu={(event) => {
          event.preventDefault();
          setMenu({ x: event.clientX, y: event.clientY });
        }}
        style={{ paddingLeft: 6 + depth * 8 }}
      >
        {isFolder ? open ? <ChevronDown size={14} /> : <ChevronRight size={14} /> : <span style={{ width: 14 }} />}
        {isFolder ? open ? <FolderOpen size={14} /> : <Folder size={14} /> : <File size={14} />}
        <span className="tab-name">{node.name}</span>
        <MoreHorizontal size={12} style={{ marginLeft: 'auto' }} />
      </div>
      {isFolder && open && (
        <div className="tree-children">
          {node.children?.map((child) => (
            <TreeNode key={child.path} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
      {menu && (
        <div className="context-menu" style={{ left: menu.x, top: menu.y }} onMouseLeave={() => setMenu(null)}>
          {!isFolder && <button onClick={() => openFile(node.path)}>Open</button>}
          <button
            onClick={async () => {
              const target = window.prompt('New path', node.path);
              if (target) {
                await window.zenexcoder.file.rename(node.path, target);
                await refreshTree();
              }
            }}
          >
            Rename
          </button>
          <button
            onClick={async () => {
              if (window.confirm(`Delete ${node.name}?`)) {
                await window.zenexcoder.file.delete(node.path);
                await refreshTree();
              }
            }}
          >
            Delete
          </button>
          <button onClick={() => navigator.clipboard.writeText(node.path)}>Copy Path</button>
          {!isFolder && <button onClick={() => runAiAction('Explain')}>AI: Explain This File</button>}
          {!isFolder && <button onClick={() => runAiAction('Tests')}>AI: Generate Tests</button>}
          {!isFolder && <button onClick={() => runAiAction('Review')}>AI: Review Code</button>}
        </div>
      )}
    </div>
  );
}

export default function FileTree() {
  const projectPath = useProjectStore((state) => state.projectPath);
  const fileTree = useProjectStore((state) => state.fileTree);
  const openProject = useProjectStore((state) => state.openProject);

  return (
    <section className="panel">
      <div className="panel-header">
        <span className="panel-title">Files</span>
        <button className="icon-button" onClick={() => openProject()} title="Open folder">
          <FolderOpen size={14} />
        </button>
      </div>
      <div className="panel-body file-tree">
        {!projectPath ? (
          <div className="empty-state">
            <div className="empty-state-inner">
              <div>No project open</div>
              <button className="primary-button" onClick={() => openProject()}>
                Open a Folder
              </button>
            </div>
          </div>
        ) : (
          fileTree.map((node) => <TreeNode key={node.path} node={node} />)
        )}
      </div>
    </section>
  );
}
