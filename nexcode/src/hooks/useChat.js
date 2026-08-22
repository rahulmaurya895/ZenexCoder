import { useCallback } from 'react';
import { useAppStore } from '@/store/appStore';
import { useChatStore } from '@/store/chatStore';
import { useSettingsStore } from '@/store/settingsStore';
import { usePermissionsStore } from '@/store/permissionsStore';
import { useProjectStore } from '@/store/projectStore';
import { useAgentStore } from '@/store/agentStore';
import { useSpeculativeStore } from '@/store/speculativeStore';
import { extractCodeBlocks } from '@/utils/codeParser';
import { SYSTEM_PROMPTS } from '@/utils/promptTemplates';
import { trimMessagesToBudget } from '@/utils/tokenCounter';


function formatAiErrorMessage(raw) {
  const text = typeof raw === 'string' ? raw : raw?.message || 'Unknown error';
  const trimmed = String(text).trim();
  try {
    const parsed = JSON.parse(trimmed);
    const nested = parsed?.error?.message || parsed?.message || parsed?.error;
    if (nested) {
      return formatAiErrorMessage(nested);
    }
  } catch {}
  if (/RESOURCE_EXHAUSTED|429|quota|rate limit/i.test(trimmed)) {
    return 'API Quota Exceeded (429 Rate Limit).\n\n💡 How to resolve:\n• 1. Switch to "Gemini 3.6 Flash", "Gemini 3.5 Flash Lite", or "Groq Llama 3.3" from the top bar dropdown.\n• 2. Wait 10 seconds for automatic rate limit token bucket reset.\n• 3. Check your API key quota settings.';
  }
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|unreachable/i.test(trimmed)) {
    return 'Network / Provider Connection Failed.\n\n💡 How to resolve:\n• 1. Check your internet connection.\n• 2. Verify your API keys in Settings.\n• 3. If using local Ollama, ensure local Ollama service is running (`ollama serve`).';
  }
  if (/messages\[\d+\]\.content must be a string/i.test(trimmed)) {
    return 'This model expects plain text messages. Switch to a text-only model or remove the current attachment format.';
  }
  if (/gemini-1\.5-flash.*not found|not supported for generateContent/i.test(trimmed)) {
    return 'This Gemini model is not available. Switch to Gemini 2.0 Flash or another supported model.';
  }
  if (/chrome-headless-shell|playwright.*install|Executable doesn\'t exist/i.test(trimmed)) {
    return 'Browser tools are not ready yet. Playwright browsers are missing on this machine.';
  }
  return trimmed.length > 300 ? `${trimmed.slice(0, 300)}...` : trimmed;
}


function formatRunDuration(startedAt) {
  const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
  const minutes = Math.floor(seconds / 60);
  return minutes ? String(minutes) + 'm ' + String(seconds % 60) + 's' : String(seconds) + 's';
}

export function useChat() {
  const chat = useChatStore();
  const activeModel = useAppStore((state) => state.activeModel);
  const setStreaming = useAppStore((state) => state.setStreaming);
  const setNotice = useAppStore((state) => state.setNotice);
  const settings = useSettingsStore();
  const permissionMode = usePermissionsStore((state) => state.mode);
  const projectRules = usePermissionsStore((state) => state.projectRules);
  const showSystemNotifications = usePermissionsStore((state) => state.showSystemNotifications);
  const projectPath = useProjectStore((state) => state.projectPath);
  const sessionAllows = useAgentStore((state) => state.sessionAllows);

  const sendMessage = useCallback(
    async (content, attachments = []) => {
      const cached = useSpeculativeStore.getState().findPromptMatch(content);
      if (cached && !attachments.length) {
        await chat.addMessage('user', content, attachments, activeModel.modelId);
        await chat.addMessage('assistant', useSpeculativeStore.getState().formatCachedResponse(cached.result), [], activeModel.modelId);
        useSpeculativeStore.getState().clearEntry(cached.triggerHash);
        return;
      }
      const pluginState = await window.zenexcoder.store.get('plugins', { customPlugins: [], enabled: {} }).catch(() => ({ customPlugins: [], enabled: {} }));
      const customPlugin = (pluginState.customPlugins || []).find(
        (plugin) =>
          plugin.trigger &&
          pluginState.enabled?.[plugin.id] !== false &&
          content.trim().toLowerCase().startsWith(plugin.trigger.toLowerCase())
      );
      const finalContent = customPlugin
        ? `${customPlugin.prompt}\n\nUser input:\n${content}`
        : content;
      const userMessage = await chat.addMessage('user', finalContent, attachments, activeModel.modelId);
      const startedAt = Date.now();
      const activity = [{ message: 'Preparing request', type: 'request' }];
      chat.startStreamingMessage({ startedAt, status: 'Preparing request...', activity, provider: activeModel.provider, modelId: activeModel.modelId });
      let output = '';
      const context = trimMessagesToBudget(
        [...chat.messages, userMessage].slice(-(settings.aiSettings.contextMessages || 12)),
        (settings.aiSettings.contextMessages || 12) * 1200
      );
      if (context.trimmed) {
        setNotice('Old messages removed to fit context window');
      }
      const providerKey = activeModel.provider === 'google' ? 'google' : activeModel.provider;
      const request = window.zenexcoder.ai.stream(
        {
          provider: activeModel.provider,
          modelId: activeModel.modelId,
          apiKey: settings.apiKeys[providerKey],
          temperature: settings.aiSettings.temperature,
          maxTokens: settings.aiSettings.maxTokens,
          systemPrompt: settings.aiSettings.systemPrompt || SYSTEM_PROMPTS.coding,
          attachments,
          permissions: {
            mode: permissionMode,
            projectRules: projectPath ? projectRules[projectPath] || {} : {},
            sessionAllows,
            showSystemNotifications
          },
          messages: [
            { role: 'system', content: settings.aiSettings.systemPrompt || SYSTEM_PROMPTS.coding },
            ...context.messages.map((message) => ({ role: message.role, content: message.content }))
          ]
        },
        {
          onToken: ({ token }) => {
            output += token;
            chat.replaceStreamingMessage(output);
            chat.updateStreamingRun({ status: 'Writing response...' });
          },
          onProgress: (progress) => {
            if (!progress?.message) return;
            setNotice(progress.message);
            const nextActivity = [...activity, { message: progress.message, type: progress.type || 'progress' }].slice(-12);
            activity.splice(0, activity.length, ...nextActivity);
            chat.updateStreamingRun({ status: progress.message, activity: nextActivity });
            if (['mcp_tool', 'browser_tool', 'computer_tool'].includes(progress.type)) {
              output += `\n\n> ${progress.message}\n`;
              chat.replaceStreamingMessage(output);
            }
          },
          onDone: async () => {
            setStreaming(false, null);
            await chat.finishStreamingMessage(output, activeModel.modelId, { startedAt, duration: formatRunDuration(startedAt), status: 'Completed', activity, provider: activeModel.provider, modelId: activeModel.modelId });
            
            // Resolve target save folder: projectPath or Desktop/444 if mentioned
            let targetFolder = projectPath;
            if (!targetFolder && /444|desktop/i.test(finalContent)) {
              targetFolder = 'C:/Users/rahul/Desktop/444';
            }
            
            if (targetFolder && output) {
              const blocks = extractCodeBlocks(output);
              for (const block of blocks) {
                let fileName = block.filePath;
                if (!fileName && /create|save|bna|make|write|build|calculator|task/i.test(finalContent)) {
                  const ext = block.language === 'python' ? 'py' : block.language === 'javascript' ? 'js' : block.language === 'typescript' ? 'ts' : block.language === 'html' ? 'html' : 'txt';
                  fileName = block.language === 'python' ? 'calculator.py' : `app.${ext}`;
                }
                if (fileName && block.code) {
                  const cleanName = fileName.replace(/^[/\\]+/, '').trim();
                  const targetPath = `${targetFolder}/${cleanName}`;
                  try {
                    await window.zenexcoder.file.write(targetPath, block.code);
                    if (projectPath) {
                      await useProjectStore.getState().loadFiles(projectPath);
                    }
                    await chat.addMessage('system', `📁 Auto-created file "${cleanName}" in folder:\n${targetPath}`);
                  } catch (e) {
                    console.warn('Auto file save error:', e);
                  }
                }
              }
            }
          },
          onError: async (error) => {
            setStreaming(false, null);
            const formatted = formatAiErrorMessage(error.message);
            await chat.finishStreamingMessage(`Warning: ${formatted}`, activeModel.modelId, { startedAt, duration: formatRunDuration(startedAt), status: 'Stopped with an error', activity: [...activity, { message: formatted, type: 'error' }].slice(-12), provider: activeModel.provider, modelId: activeModel.modelId, failed: true });
          }
        }
      );
      setStreaming(true, request.abort);
    },
    [activeModel, chat, permissionMode, projectPath, projectRules, sessionAllows, setNotice, setStreaming, settings.aiSettings, settings.apiKeys, showSystemNotifications]
  );

  return { ...chat, sendMessage };
}
