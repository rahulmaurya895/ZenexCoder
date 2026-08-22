import { useState } from 'react';
import { ImagePlus, Play, Upload } from 'lucide-react';
import { VISION_TASKS, openImage, readImage } from '@/services/visionService';
import { useAI } from '@/hooks/useAI';
import { useChatStore } from '@/store/chatStore';
import ImagePreview from './ImagePreview';
import ScreenCapture from './ScreenCapture';

export default function VisionPanel() {
  const [image, setImage] = useState(null);
  const [taskId, setTaskId] = useState('screenshotToCode');
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);
  const { visionAnalyze } = useAI();
  const addMessage = useChatStore((state) => state.addMessage);
  const task = VISION_TASKS.find((item) => item.id === taskId);

  async function analyze() {
    if (!image || !task) return;
    setBusy(true);
    setResult('');
    try {
      const output = await visionAnalyze({ prompt: task.prompt(), image });
      setResult(output);
      await addMessage('assistant', output, [image]);
    } finally {
      setBusy(false);
    }
  }

  async function handleDrop(event) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file?.path) {
      setImage(await readImage(file.path));
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <span className="panel-title">Vision</span>
        <select style={{ width: 180 }} value={taskId} onChange={(event) => setTaskId(event.target.value)}>
          {VISION_TASKS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
      <div className="panel-body vision-grid">
        <div
          className="drop-zone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
        >
          {image ? (
            <ImagePreview image={image} />
          ) : (
            <div>
              <Upload size={28} />
              <p>Drop a screenshot, diagram, error image, document, or handwritten note.</p>
            </div>
          )}
        </div>
        <div className="chat-input-actions">
          <button
            onClick={async () => {
              const chosen = await openImage();
              if (chosen) setImage(chosen);
            }}
          >
            <ImagePlus size={14} /> Open Image
          </button>
          <ScreenCapture onCapture={setImage} />
          <button className="primary-button" onClick={analyze} disabled={!image || busy}>
            <Play size={14} /> {busy ? 'Analyzing' : 'Analyze'}
          </button>
        </div>
        {result && (
          <div className="vision-card">
            <div className="panel-title">Result</div>
            <pre className="diff-code">{result}</pre>
          </div>
        )}
      </div>
    </section>
  );
}
