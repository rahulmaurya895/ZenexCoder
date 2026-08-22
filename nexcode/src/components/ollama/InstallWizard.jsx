import { useState } from 'react';
import { CheckCircle2, Download, Monitor } from 'lucide-react';
import { useOllama } from '@/hooks/useOllama';

/**
 * @param {{onDone?: () => void}} props
 */
export default function InstallWizard({ onDone }) {
  const [step, setStep] = useState(1);
  const [log, setLog] = useState([]);
  const [progress, setProgress] = useState(0);
  const [hardware, setHardware] = useState(null);
  const { refresh, installOllama } = useOllama();

  async function detect() {
    const status = await refresh();
    setHardware(status.hardware);
    setStep(2);
  }

  function install() {
    installOllama({
      onProgress: (payload) => {
        setProgress(payload.percent || progress);
        if (payload.message) setLog((items) => [...items, payload.message]);
      },
      onDone: async (payload) => {
        setLog((items) => [...items, `Ollama ${payload.version || ''} running successfully`]);
        setStep(3);
        await refresh();
        onDone?.();
      },
      onError: (error) => setLog((items) => [...items, `Error: ${error.message}`])
    });
  }

  return (
    <div className="wizard">
      <div className="panel-title">Install Ollama</div>
      {step === 1 && (
        <>
          <Monitor size={28} />
          <div>Detecting your system...</div>
          {hardware && <div>{hardware.platform} {hardware.arch} | {hardware.cpus} | {hardware.totalRamGb}GB RAM</div>}
          <button className="primary-button" onClick={detect}>Detect System</button>
        </>
      )}
      {step === 2 && (
        <>
          <Download size={28} />
          <div>Installing Ollama</div>
          <div className="progress" style={{ '--progress': `${progress}%` }}>
            <span />
          </div>
          <button className="primary-button" onClick={install}>Download and Install</button>
          <pre className="diff-code" style={{ maxHeight: 160 }}>{log.join('\n')}</pre>
        </>
      )}
      {step === 3 && (
        <>
          <CheckCircle2 size={28} />
          <div>Setup Complete</div>
          <pre className="diff-code" style={{ maxHeight: 160 }}>{log.join('\n')}</pre>
        </>
      )}
    </div>
  );
}
