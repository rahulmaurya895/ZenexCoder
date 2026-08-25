import { createPortal } from 'react-dom';
import { Loader2, Mic, MicOff, PhoneOff, Settings } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useVoiceStore } from '@/store/voiceStore';
import AudioVisualizer from './AudioVisualizer';

const labels = {
  disconnected: 'Voice',
  connecting: 'Connecting',
  listening: 'Listening',
  user_speaking: 'User speaking',
  thinking: 'Thinking',
  speaking: 'Speaking',
  error: 'Error'
};

export default function VoiceOrbOverlay() {
  const connected = useVoiceStore((state) => state.connected);
  const connectionState = useVoiceStore((state) => state.connectionState);
  const loading = useVoiceStore((state) => state.loading);
  const muted = useVoiceStore((state) => state.muted);
  const inputLevel = useVoiceStore((state) => state.inputLevel);
  const outputLevel = useVoiceStore((state) => state.outputLevel);
  const error = useVoiceStore((state) => state.error);
  const loadSettings = useVoiceStore((state) => state.loadSettings);
  const connect = useVoiceStore((state) => state.connect);
  const disconnect = useVoiceStore((state) => state.disconnect);
  const toggleMuted = useVoiceStore((state) => state.toggleMuted);

  useEffect(() => {
    loadSettings().catch(() => {});
  }, [loadSettings]);

  const level = useMemo(() => Math.max(inputLevel, outputLevel), [inputLevel, outputLevel]);
  const mode = connected ? connectionState : 'disconnected';
  const label = error || labels[mode] || 'Voice';

  const body = (
    <div className={`voice-orb-layer ${connected ? 'connected' : 'disconnected'} ${mode}`}>
      {!connected ? (
        <button
          className="voice-orb-mini"
          title={error || 'Start realtime voice'}
          onClick={() => connect().catch(() => {})}
          disabled={loading}
        >
          {loading ? <Loader2 className="spin" size={16} /> : <Mic size={16} />}
        </button>
      ) : (
        <div className="voice-orb-panel">
          <button
            className={`voice-orb ${mode}`}
            style={{ '--voice-level': String(1 + level * 0.22) }}
            title={label}
            onClick={toggleMuted}
          >
            {muted ? <MicOff size={22} /> : <Mic size={22} />}
          </button>
          <div className="voice-orb-readout">
            <span>{label}</span>
            <AudioVisualizer inputLevel={inputLevel} outputLevel={outputLevel} mode={mode} />
          </div>
          <div className="voice-orb-actions">
            <button className="icon-button" title={muted ? 'Unmute microphone' : 'Mute microphone'} onClick={toggleMuted}>
              {muted ? <MicOff size={14} /> : <Mic size={14} />}
            </button>
            <button className="icon-button" title="Open voice settings" onClick={() => window.dispatchEvent(new CustomEvent('zezenexcoderr:open-settings'))}>
              <Settings size={14} />
            </button>
            <button className="icon-button danger-button" title="Disconnect voice" onClick={disconnect}>
              <PhoneOff size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(body, document.body);
}
