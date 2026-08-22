import { useCallback, useEffect, useRef, useState } from 'react';

export function useDictation({ language = 'en-US', onFinalTranscript } = {}) {
  const recognitionRef = useRef(null);
  const accumulatedRef = useRef('');
  const [supported, setSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setSupported(Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));
  }, []);

  const stopListening = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {}
  }, []);

  const startListening = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      const message = 'Voice input is not available in this Chromium build.';
      setError(message);
      window.nexcode?.notify?.show?.({ title: 'Dictation unavailable', body: message, type: 'warning' }).catch(() => {});
      return false;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = language || 'en-US';
      accumulatedRef.current = '';
      setTranscript('');
      setError('');

      recognition.onstart = () => setIsListening(true);
      recognition.onerror = (event) => {
        const message = event?.error ? `Dictation error: ${event.error}` : 'Dictation failed.';
        setError(message);
        window.nexcode?.notify?.show?.({ title: 'Dictation error', body: message, type: 'error' }).catch(() => {});
      };
      recognition.onresult = (event) => {
        let interim = '';
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          const text = result?.[0]?.transcript || '';
          if (result.isFinal) {
            accumulatedRef.current = `${accumulatedRef.current} ${text}`.trim();
          } else {
            interim = `${interim} ${text}`.trim();
          }
        }
        setTranscript(`${accumulatedRef.current} ${interim}`.trim());
      };
      recognition.onend = () => {
        setIsListening(false);
        const finalTranscript = accumulatedRef.current.trim();
        if (finalTranscript) {
          onFinalTranscript?.(finalTranscript);
          setTranscript('');
          accumulatedRef.current = '';
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
      return true;
    } catch (err) {
      const message = err?.message || 'Unable to start dictation.';
      setError(message);
      setIsListening(false);
      window.nexcode?.notify?.show?.({ title: 'Dictation error', body: message, type: 'error' }).catch(() => {});
      return false;
    }
  }, [language, onFinalTranscript]);

  useEffect(() => () => stopListening(), [stopListening]);

  return { supported, isListening, transcript, error, startListening, stopListening };
}
