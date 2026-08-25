import { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from 'xterm';
import { Play, Square } from 'lucide-react';
import { useProjectStore } from '@/store/projectStore';
import ShellSelector from './ShellSelector';

export default function Terminal() {
  const hostRef = useRef(null);
  const termRef = useRef(null);
  const terminalIdRef = useRef(null);
  const [terminalId, setTerminalId] = useState(null);
  const [command, setCommand] = useState('');
  const [shellVersion, setShellVersion] = useState(0);
  const projectPath = useProjectStore((state) => state.projectPath);
  const handleShellChanged = useCallback(() => setShellVersion((version) => version + 1), []);

  useEffect(() => {
    let disposed = false;
    let createdTerminalId = null;
    if (!hostRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      fontFamily: 'JetBrains Mono, Consolas, monospace',
      fontSize: 12,
      theme: { background: '#050505' }
    });
    let opened = false;
    const mountFrame = window.requestAnimationFrame(() => {
      if (disposed || !hostRef.current) return;
      try {
        term.open(hostRef.current);
        opened = true;
      } catch (error) {
        console.warn('Terminal viewport mount failed:', error);
      }
    });


    termRef.current = term;

    const cols = Math.max(20, term.cols || 80);
    const rows = Math.max(5, term.rows || 24);

    window.zezenexcoderr.terminal
      .create({ cwd: projectPath || undefined, cols, rows })
      .then((session) => {
        if (disposed) {
          window.zezenexcoderr.terminal.kill(session.terminalId);
          return;
        }
        createdTerminalId = session.terminalId;
        terminalIdRef.current = session.terminalId;
        setTerminalId(session.terminalId);
      })
      .catch((error) => term.writeln(`Terminal error: ${error.message}`));

    const dataDispose = window.zezenexcoderr.terminal.onData((payload) => {
      if (payload.terminalId === terminalIdRef.current) {
        term.write(payload.data);
      }
    });
    const exitDispose = window.zezenexcoderr.terminal.onExit((payload) => {
      if (payload.terminalId === terminalIdRef.current) {
        term.writeln(`\r\nProcess exited with ${payload.exitCode}`);
      }
    });
    const inputDispose = term.onData((data) => {
      if (terminalIdRef.current) {
        window.zezenexcoderr.terminal.write(terminalIdRef.current, data);
      }
    });
    const resize = () => {
      if (disposed || !opened || !term.element) return;
      if (terminalIdRef.current) {
        window.zezenexcoderr.terminal.resize(terminalIdRef.current, Math.max(20, term.cols || 80), Math.max(5, term.rows || 24));
      }
    };
    window.addEventListener('resize', resize);


    return () => {
      disposed = true;
      window.cancelAnimationFrame(mountFrame);
      window.removeEventListener('resize', resize);
      dataDispose();
      exitDispose();
      inputDispose.dispose();
      const idToKill = createdTerminalId || terminalIdRef.current;
      if (idToKill) window.zezenexcoderr.terminal.kill(idToKill);
      terminalIdRef.current = null;
      term.dispose();
    };
  }, [projectPath, shellVersion]);

  function runCommand() {
    if (!command.trim()) return;
    termRef.current?.writeln(`\r\n> ${command}\r\n`);
    window.zezenexcoderr.terminal.run(
      { command, cwd: projectPath || undefined },
      {
        onOutput: (payload) => termRef.current?.write(payload.data.replace(/\n/g, '\r\n')),
        onExit: (payload) => termRef.current?.writeln(`\r\n[exit ${payload.code}]\r\n`)
      }
    );
    setCommand('');
  }

  return (
    <section className="panel terminal-pane">
      <div className="terminal-toolbar">
        <input
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && runCommand()}
          placeholder="AI commands appear here for approval, or type your own command"
        />
        <div className="chat-input-actions">
          <ShellSelector onShellChanged={handleShellChanged} />
          <button className="primary-button" onClick={runCommand}>
            <Play size={14} /> Run
          </button>
          <button className="danger-button" onClick={() => terminalId && window.zezenexcoderr.terminal.kill(terminalId)}>
            <Square size={14} /> Kill
          </button>
        </div>
      </div>
      <div className="terminal-host" ref={hostRef} />
    </section>
  );
}
