import { useMemo, useRef, useState } from 'react';
import { FilePlus2, Globe, ImagePlus, Network, Paperclip, Send, X } from 'lucide-react';
import { estimateTokens } from '@/utils/tokenCounter';
import { basename } from '@/utils/fileUtils';
import { useProjectStore } from '@/store/projectStore';
import ImagePreview from '@/components/vision/ImagePreview';
import DictationMic from '@/components/dictation/DictationMic';

/**
 * @param {{onSend: (content: string, attachments: Array<object>) => void, onSwarm?: (content: string, attachments: Array<object>) => void, swarmBusy?: boolean}} props
 */
import PromptOptimizerToggle from './PromptOptimizerToggle';

export default function ChatInput({ onSend, onSwarm, swarmBusy = false }) {
  const [value, setValue] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [autoOptimize, setAutoOptimize] = useState(false);
  const textareaRef = useRef(null);
  const openFiles = useProjectStore((state) => state.openFiles);
  const projectPath = useProjectStore((state) => state.projectPath);
  const tokenCount = useMemo(() => estimateTokens(value) + attachments.reduce((total, item) => total + estimateTokens(item.content || ''), 0), [attachments, value]);

  async function addFileAttachment() {
    const [filePath] = await window.zezenexcoderr.file.openDialog();
    if (!filePath) return;
    const result = await window.zezenexcoderr.file.read(filePath);
    setAttachments((items) => [
      ...items,
      { type: 'file', name: basename(filePath), filePath, content: result.content }
    ]);
  }

  async function addImageAttachment() {
    const image = await window.zezenexcoderr.vision.openImageDialog();
    if (image) {
      setAttachments((items) => [...items, { ...image, type: 'image' }]);
    }
  }

  async function attachBrowserDOM() {
    try {
      const state = await window.zezenexcoderr.browser.getDOM();
      if (state?.dom) {
        setAttachments((items) => [
          ...items,
          {
            type: 'file',
            name: `Browser: ${state.title || state.url || 'Web Page'}`,
            filePath: state.url,
            content: `Page Title: ${state.title}\nPage URL: ${state.url}\n\nDOM:\n${state.dom.slice(0, 3000)}`
          }
        ]);
      } else {
        await window.zezenexcoderr.browser.start();
      }
    } catch {
      await window.zezenexcoderr.browser.start();
    }
  }

  function expandMentions(text) {
    let next = text;
    for (const file of openFiles) {
      if (next.includes(`@${file.name}`)) {
        next = next.replaceAll(`@${file.name}`, `\n\nFile: ${file.path}\n\`\`\`${file.language}\n${file.content}\n\`\`\``);
      }
    }
    return next;
  }

  async function submit() {
    const rawContent = expandMentions(value).trim();
    if (!rawContent && !attachments.length) return;

    let finalContent = rawContent;
    if (autoOptimize && rawContent && window.zezenexcoderr?.prompt) {
      const res = await window.zezenexcoderr.prompt.optimize(rawContent, { projectPath });
      if (res?.ok) {
        finalContent = res.optimizedPrompt;
      }
    }

    const fileContext = attachments
      .filter((item) => item.type === 'file')
      .map((item) => `\n\nAttached file: ${item.filePath}\n\`\`\`\n${item.content}\n\`\`\``)
      .join('');
    onSend(`${finalContent}${fileContext}`, attachments.filter((item) => item.type === 'image'));
    setValue('');
    setAttachments([]);
  }

  async function swarmSubmit() {
    const rawContent = expandMentions(value).trim() || (attachments.length ? 'Analyze the attached context.' : '');
    if ((!rawContent && !attachments.length) || !onSwarm || swarmBusy) return;

    let finalContent = rawContent;
    if (autoOptimize && rawContent && window.zezenexcoderr?.prompt) {
      const res = await window.zezenexcoderr.prompt.optimize(rawContent, { projectPath });
      if (res?.ok) {
        finalContent = res.optimizedPrompt;
      }
    }

    const fileContext = attachments
      .filter((item) => item.type === 'file')
      .map((item) => `\n\nAttached file: ${item.filePath}\n\`\`\`\n${item.content}\n\`\`\``)
      .join('');
    onSwarm(`${finalContent}${fileContext}`, attachments.filter((item) => item.type === 'image'));
    setValue('');
    setAttachments([]);
  }

  async function handlePaste(event) {
    const files = Array.from(event.clipboardData?.files || []);
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        const base64 = await file.arrayBuffer().then((buffer) => {
          let binary = '';
          const bytes = new Uint8Array(buffer);
          bytes.forEach((byte) => {
            binary += String.fromCharCode(byte);
          });
          return btoa(binary);
        });
        setAttachments((items) => [
          ...items,
          {
            type: 'image',
            name: file.name || 'pasted-image.png',
            mimeType: file.type,
            base64,
            dataUrl: `data:${file.type};base64,${base64}`
          }
        ]);
      }
    }
  }

  return (
    <div className="chat-input">
      <div className="attachment-list">
        {attachments.map((item, index) => (
          <span className="attachment-pill" key={`${item.name}-${index}`}>
            {item.type === 'image' ? <ImagePlus size={14} /> : <Paperclip size={14} />}
            {item.name}
            <button className="icon-button" style={{ height: 20, width: 20, minWidth: 20 }} onClick={() => setAttachments((items) => items.filter((_, itemIndex) => itemIndex !== index))}>
              <X size={12} />
            </button>
          </span>
        ))}
      </div>
      {attachments.some((item) => item.type === 'image') && (
        <ImagePreview image={attachments.find((item) => item.type === 'image')} />
      )}
      <textarea
        ref={textareaRef}
        rows={4}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onPaste={handlePaste}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
        placeholder="Ask ZenexCoder. Use @filename for open files."
      />
      <div className="chat-input-actions">
        <button className="icon-button" onClick={addFileAttachment} title="Attach file">
          <FilePlus2 size={16} />
        </button>
        <button className="icon-button" onClick={addImageAttachment} title="Attach image">
          <ImagePlus size={16} />
        </button>
        <button className="icon-button" onClick={attachBrowserDOM} title="Attach active Browser DOM / Launch Chrome">
          <Globe size={16} />
        </button>
        <DictationMic onTranscript={(text) => setValue((current) => (current ? `${current} ${text}` : text))} />
        <PromptOptimizerToggle enabled={autoOptimize} onChange={setAutoOptimize} />
        <span style={{ color: 'var(--text-secondary)' }}>~{tokenCount} tokens</span>
        <div className="top-bar-spacer" />
        {onSwarm && (
          <button
            className="secondary-button"
            style={{ borderRadius: 8 }}
            onClick={swarmSubmit}
            disabled={swarmBusy || (!value.trim() && !attachments.length)}
            title="Execute prompt with Multi-Agent Autonomous Swarm"
          >
            <Network size={14} /> Swarm
          </button>
        )}
        <button className="primary-button" style={{ borderRadius: 8 }} onClick={submit} disabled={!value.trim() && !attachments.length}>
          <Send size={14} /> Send
        </button>
      </div>
    </div>
  );
}
