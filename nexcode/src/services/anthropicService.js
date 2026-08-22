export function streamAnthropic({ apiKey, modelId, messages, attachments, temperature, maxTokens, systemPrompt, mcpTools, permissions, onToken, onProgress, onDone, onError }) {
  return window.nexcode.ai.stream(
    {
      provider: 'anthropic',
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
