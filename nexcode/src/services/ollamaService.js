export const RECOMMENDED_MODELS = [
  {
    name: 'Qwen 2.5 Coder 7B',
    id: 'qwen2.5-coder:7b',
    size: '4.7 GB',
    ram: '6 GB',
    badge: 'RECOMMENDED',
    strength: 'Best coding model for 8GB RAM - Python, JS, Go, Rust',
    command: 'ollama pull qwen2.5-coder:7b'
  },
  {
    name: 'DeepSeek Coder V2 Lite',
    id: 'deepseek-coder-v2:lite',
    size: '8.9 GB',
    ram: '8 GB',
    badge: 'POWER',
    strength: 'Advanced code generation, slightly better than Qwen on complex tasks',
    warning: 'Might be slow on 8GB RAM. Recommended only if no other apps are running.',
    command: 'ollama pull deepseek-coder-v2:lite'
  },
  {
    name: 'LLaVA 7B',
    id: 'llava:7b',
    size: '4.7 GB',
    ram: '6 GB',
    badge: 'VISION',
    strength: 'Analyze images, screenshots, diagrams locally',
    command: 'ollama pull llava:7b'
  },
  {
    name: 'Llama 3.2 3B',
    id: 'llama3.2:3b',
    size: '2.0 GB',
    ram: '4 GB',
    badge: 'FAST',
    strength: 'Quick responses, general questions, fastest on your hardware',
    command: 'ollama pull llama3.2:3b'
  }
];

export const ollamaService = {
  checkOllamaInstalled: () => window.nexcode.ollama.check(),
  checkOllamaRunning: async () => {
    const result = await window.nexcode.ollama.check();
    return { running: result.running, version: result.version };
  },
  startOllama: () => window.nexcode.ollama.start(),
  stopOllama: () => window.nexcode.ollama.stop(),
  listModels: () => window.nexcode.ollama.models(),
  pullModel: (modelName, onProgress, onDone, onError) =>
    window.nexcode.ollama.pull(modelName, { onProgress, onDone, onError }),
  deleteModel: (modelName) => window.nexcode.ollama.deleteModel(modelName),
  runPrompt: (modelName, prompt, onToken, options = {}) =>
    window.nexcode.ollama.runPrompt({ modelName, prompt, options }, { onToken }),
  runChat: (modelName, messages, onToken, options = {}) =>
    window.nexcode.ollama.runChat({ modelName, messages, options }, { onToken }),
  getRunningModels: () => window.nexcode.ollama.ps(),
  loadModel: (modelName) => window.nexcode.ollama.loadModel(modelName)
};
