import { useEffect, useRef } from 'react';
import { useSpeculativeStore } from '@/store/speculativeStore';

/**
 * @param {{editor: object | null, monaco: object | null, activeFile: object | null}} props
 */
export default function GhostTextOverlay({ editor, monaco, activeFile }) {
  const activeSuggestionRef = useRef(null);

  useEffect(() => {
    if (!editor || !monaco || !activeFile) return undefined;
    const model = editor.getModel();
    if (!model) return undefined;

    editor.updateOptions({
      inlineSuggest: { enabled: true, showToolbar: 'never' },
      suggest: { preview: true }
    });

    const provider = monaco.languages.registerInlineCompletionsProvider(activeFile.language || model.getLanguageId(), {
      provideInlineCompletions(currentModel, position) {
        if (currentModel.uri.toString() !== model.uri.toString()) return { items: [] };
        const lineText = currentModel.getLineContent(position.lineNumber);
        const suggestion = useSpeculativeStore.getState().findSuggestion({
          filePath: activeFile.path,
          lineNumber: position.lineNumber,
          lineText
        });
        if (!suggestion?.code) return { items: [] };
        activeSuggestionRef.current = suggestion;
        return {
          items: [
            {
              insertText: suggestion.code,
              range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column)
            }
          ]
        };
      },
      freeInlineCompletions() {}
    });

    const contentDisposable = editor.onDidChangeModelContent((event) => {
      const suggestion = activeSuggestionRef.current;
      if (!suggestion?.triggerHash) return;
      const inserted = (event.changes || []).some((change) => suggestion.code?.startsWith(String(change.text || '').slice(0, 80)));
      if (inserted) {
        useSpeculativeStore.getState().clearEntry(suggestion.triggerHash);
        activeSuggestionRef.current = null;
      }
    });

    return () => {
      provider.dispose();
      contentDisposable.dispose();
    };
  }, [activeFile, editor, monaco]);

  return null;
}
