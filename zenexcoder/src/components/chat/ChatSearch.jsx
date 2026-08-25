import { File, MessageSquare, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useChatStore } from '@/store/chatStore';
import { useProjectStore } from '@/store/projectStore';

function flattenFiles(nodes = []) {
  return nodes.flatMap((node) => (node.type === 'file' ? [node] : flattenFiles(node.children || [])));
}

/**
 * @param {{open: boolean, onClose: () => void}} props
 */
export default function ChatSearch({ open, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ chats: [], messages: [], files: [] });
  const inputRef = useRef(null);
  const loadMessages = useChatStore((state) => state.loadMessages);
  const setHighlightMessageId = useChatStore((state) => state.setHighlightMessageId);
  const fileTree = useProjectStore((state) => state.fileTree);
  const openFile = useProjectStore((state) => state.openFile);
  const files = useMemo(() => flattenFiles(fileTree), [fileTree]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !query.trim()) {
      setResults({ chats: [], messages: [], files: [] });
      return;
    }
    const timer = setTimeout(async () => {
      const backend = await window.zezenexcoderr.search.query({ query }).catch(() => ({ chats: [], messages: [], files: [] }));
      const fileMatches = files
        .filter((file) => file.name.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 20);
      setResults({ ...backend, files: fileMatches });
    }, 180);
    return () => clearTimeout(timer);
  }, [files, open, query]);

  if (!open) return null;

  return (
    <div className="search-overlay">
      <div className="search-modal">
        <div className="panel-header">
          <Search size={16} />
          <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search chats, messages, files" />
          <button className="icon-button" onClick={onClose}>
            <X size={14} />
          </button>
        </div>
        <div className="search-results">
          <div className="panel-title">Chats</div>
          {results.chats.map((chat) => (
            <button key={chat.id} onClick={() => { loadMessages(chat.id); onClose(); }}>
              <MessageSquare size={14} /> {chat.title}
            </button>
          ))}
          <div className="panel-title">Messages</div>
          {results.messages.map((message) => (
            <button key={message.id} onClick={() => { loadMessages(message.sessionId).then(() => setHighlightMessageId(message.id)); onClose(); }}>
              <MessageSquare size={14} /> {message.snippet || message.content.slice(0, 120)}
            </button>
          ))}
          <div className="panel-title">Files</div>
          {results.files.map((file) => (
            <button key={file.path} onClick={() => { openFile(file.path); onClose(); }}>
              <File size={14} /> {file.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
