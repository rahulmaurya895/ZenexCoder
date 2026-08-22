import { useMemo } from 'react';
import { useChatStore } from '@/store/chatStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useAppStore } from '@/store/appStore';
import { estimateTokens, getModelContextWindow } from '@/utils/tokenCounter';

export function useTokenUsage() {
  const messages = useChatStore((state) => state.messages);
  const aiSettings = useSettingsStore((state) => state.aiSettings);
  const activeModel = useAppStore((state) => state.activeModel);

  return useMemo(() => {
    const contextMessages = messages.slice(-(aiSettings.contextMessages || 12));
    const systemTokens = estimateTokens(aiSettings.systemPrompt || '');
    const historyTokens = contextMessages.reduce((total, message) => total + estimateTokens(message.content || ''), 0);
    const attachmentTokens = contextMessages.reduce(
      (total, message) =>
        total + (message.attachments || []).reduce((sum, attachment) => sum + estimateTokens(attachment.content || attachment.name || '') + (attachment.type === 'image' ? 1000 : 0), 0),
      0
    );
    const total = systemTokens + historyTokens + attachmentTokens;
    const max = getModelContextWindow(activeModel.modelId);
    const ratio = max ? total / max : 0;
    return {
      total,
      max,
      ratio,
      systemTokens,
      historyTokens,
      attachmentTokens,
      status: ratio > 0.9 ? 'danger' : ratio > 0.7 ? 'warning' : 'ok'
    };
  }, [activeModel.modelId, aiSettings.contextMessages, aiSettings.systemPrompt, messages]);
}
