import { Mic, MicOff } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useDictation } from '@/hooks/useDictation';

export default function DictationMic({ onTranscript }) {
  const [language, setLanguage] = useState('en-US');

  useEffect(() => {
    window.nexcode.store
      .get('dictation:settings', { language: 'en-US' })
      .then((settings) => setLanguage(settings.language || 'en-US'))
      .catch(() => {});
  }, []);

  const appendTranscript = useCallback((text) => {
    onTranscript?.(text);
  }, [onTranscript]);

  const dictation = useDictation({ language, onFinalTranscript: appendTranscript });

  return (
    <button
      className={`icon-button dictation-mic ${dictation.isListening ? 'listening' : ''}`}
      disabled={!dictation.supported}
      onClick={() => (dictation.isListening ? dictation.stopListening() : dictation.startListening())}
      title={dictation.supported ? dictation.transcript || 'Dictate prompt' : 'Dictation is not available'}
    >
      {dictation.isListening ? <Mic size={14} /> : <MicOff size={14} />}
    </button>
  );
}

