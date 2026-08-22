import { FileCode, X } from 'lucide-react';
import { useProjectStore } from '@/store/projectStore';

export default function TabManager() {
  const openFiles = useProjectStore((state) => state.openFiles);
  const activeFileId = useProjectStore((state) => state.activeFileId);
  const setActiveFile = useProjectStore((state) => state.setActiveFile);
  const closeFile = useProjectStore((state) => state.closeFile);
  const closeOthers = useProjectStore((state) => state.closeOthers);
  const closeAll = useProjectStore((state) => state.closeAll);

  return (
    <div className="tab-bar">
      {openFiles.map((file) => (
        <button
          key={file.id}
          className={`tab ${file.id === activeFileId ? 'active' : ''}`}
          onClick={() => setActiveFile(file.id)}
          onContextMenu={(event) => {
            event.preventDefault();
            if (event.shiftKey) closeAll();
            else closeOthers(file.id);
          }}
          title={`${file.path}\nRight-click closes others. Shift+right-click closes all.`}
        >
          <FileCode size={14} />
          <span className="tab-name">{file.name}</span>
          {file.dirty && <span className="dirty-dot">•</span>}
          <span
            onClick={(event) => {
              event.stopPropagation();
              closeFile(file.id);
            }}
            title="Close tab"
          >
            <X size={14} />
          </span>
        </button>
      ))}
    </div>
  );
}
