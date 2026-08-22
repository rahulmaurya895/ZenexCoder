export function streamGemini({ apiKey, modelId, messages, attachments, temperature, maxTokens, systemPrompt, mcpTools, permissions, onToken, onProgress, onDone, onError }) {
  return window.zenexcoder.ai.stream(
    {
      provider: 'google',
      apiKey,
      modelId,
      messages,
      attachments,
      temperature,
      maxTokens,
      systemPrompt,
      mcpTools,
      permissions
    },
    { onToken, onProgress, onDone, onError }
  );
}
