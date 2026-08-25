export function streamOpenAI({ apiKey, modelId, messages, attachments, temperature, maxTokens, mcpTools, permissions, onToken, onProgress, onDone, onError }) {
  return window.zezenexcoderr.ai.stream(
    {
      provider: 'openai',
      apiKey,
      modelId,
      messages,
      attachments,
      temperature,
      maxTokens,
      mcpTools,
      permissions
    },
    { onToken, onProgress, onDone, onError }
  );
}
