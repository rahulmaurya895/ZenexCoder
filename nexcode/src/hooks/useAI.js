import { useCallback } from 'react';
import { useAppStore } from '@/store/appStore';
import { useSettingsStore } from '@/store/settingsStore';
import { usePermissionsStore } from '@/store/permissionsStore';
import { useProjectStore } from '@/store/projectStore';
import { useAgentStore } from '@/store/agentStore';
import { SYSTEM_PROMPTS, USER_PROMPTS } from '@/utils/promptTemplates';
import { firstCodeBlock } from '@/utils/codeParser';
import { detectLanguage, testFilePath } from '@/utils/fileUtils';

function modelKey(provider) {
  return provider === 'google' ? 'google' : provider;
}

export function useAI() {
  const activeModel = useAppStore((state) => state.activeModel);
  const setStreaming = useAppStore((state) => state.setStreaming);
  const setResponseMetric = useAppStore((state) => state.setResponseMetric);
  const setNotice = useAppStore((state) => state.setNotice);
  const { apiKeys, aiSettings } = useSettingsStore();
  const permissionMode = usePermissionsStore((state) => state.mode);
  const projectRules = usePermissionsStore((state) => state.projectRules);
  const showSystemNotifications = usePermissionsStore((state) => state.showSystemNotifications);
  const projectPath = useProjectStore((state) => state.projectPath);
  const sessionAllows = useAgentStore((state) => state.sessionAllows);

  const streamText = useCallback(
    ({ prompt, systemPrompt = SYSTEM_PROMPTS.coding, attachments = [], taskModel = activeModel, onToken }) =>
      new Promise((resolve, reject) => {
        let output = '';
        const started = performance.now();
        const request = window.nexcode.ai.stream(
          {
            provider: taskModel.provider,
            modelId: taskModel.modelId,
            apiKey: apiKeys[modelKey(taskModel.provider)],
            temperature: aiSettings.temperature,
            maxTokens: aiSettings.maxTokens,
            systemPrompt,
            attachments,
            permissions: {
              mode: permissionMode,
              projectRules: projectPath ? projectRules[projectPath] || {} : {},
              sessionAllows,
              showSystemNotifications
            },
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: prompt }
            ]
          },
          {
            onToken: ({ token }) => {
              output += token;
              onToken?.(token, output);
            },
            onProgress: (progress) => progress?.message && setNotice(progress.message),
            onDone: () => {
              setStreaming(false, null);
              setResponseMetric(Math.round(performance.now() - started));
              resolve(output);
            },
            onError: (error) => {
              setStreaming(false, null);
              reject(new Error(error.message));
            }
          }
        );
        setStreaming(true, request.abort);
      }),
    [activeModel, aiSettings.maxTokens, aiSettings.temperature, apiKeys, permissionMode, projectPath, projectRules, sessionAllows, setNotice, setResponseMetric, setStreaming, showSystemNotifications]
  );

  const explainCode = useCallback((code, language) => streamText({ prompt: USER_PROMPTS.explainCode(code, language) }), [streamText]);
  const refactorCode = useCallback((code, language) => streamText({ prompt: USER_PROMPTS.refactorCode(code, language) }), [streamText]);
  const fixBugs = useCallback((code, language, error) => streamText({ prompt: USER_PROMPTS.fixBugs(code, language, error) }), [streamText]);
  const addDocs = useCallback((code, language) => streamText({ prompt: USER_PROMPTS.addDocs(code, language) }), [streamText]);
  const reviewCode = useCallback((code, language) => streamText({ prompt: USER_PROMPTS.codeReview(code, language) }), [streamText]);
  const translateCode = useCallback((code, fromLang, toLang) => streamText({ prompt: USER_PROMPTS.translateCode(code, fromLang, toLang) }), [streamText]);
  const generateRegex = useCallback((desc) => streamText({ prompt: USER_PROMPTS.generateRegex(desc), systemPrompt: SYSTEM_PROMPTS.general }), [streamText]);
  const generateCode = useCallback((desc, lang) => streamText({ prompt: USER_PROMPTS.generateCode(desc, lang) }), [streamText]);

  const completeCode = useCallback(
    ({ before, after, language, onToken }) =>
      streamText({
        prompt: USER_PROMPTS.completeCode(before, after, language),
        onToken
      }),
    [streamText]
  );

  const generateTests = useCallback(
    async (file, writeNewFile) => {
      const language = file.language || detectLanguage(file.path);
      const markdown = await streamText({ prompt: USER_PROMPTS.generateTests(file.content, language) });
      const block = firstCodeBlock(markdown);
      const testPath = testFilePath(file.path);
      await writeNewFile(testPath, block?.code || markdown);
      return testPath;
    },
    [streamText]
  );

  const visionAnalyze = useCallback(
    ({ prompt, image, taskModel }) =>
      streamText({
        prompt,
        attachments: [image],
        systemPrompt: SYSTEM_PROMPTS.vision,
        taskModel: taskModel || activeModel
      }),
    [activeModel, streamText]
  );

  return {
    streamText,
    explainCode,
    refactorCode,
    fixBugs,
    addDocs,
    reviewCode,
    translateCode,
    generateRegex,
    generateCode,
    completeCode,
    generateTests,
    visionAnalyze
  };
}
