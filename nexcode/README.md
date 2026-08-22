# ZezenexCoderr

ZezenexCoderr is a local-first AI developer desktop app built with Electron, React, Vite, Monaco, xterm.js, SQLite, and streaming model providers.

## Providers

- Local Ollama at `http://localhost:11434`
- OpenAI chat and vision models
- Anthropic Claude chat and vision models
- Google Gemini chat and vision models

API keys are stored through Electron IPC using `safeStorage` encryption when the platform supports it.

## Run

```bash
pnpm install
pnpm dev
```

## Build

```bash
pnpm build
pnpm dist
```

## Local Model Recommendations

- `qwen2.5-coder:7b` for coding on 8 GB RAM
- `deepseek-coder-v2:lite` for stronger coding when memory is available
- `llava:7b` for local vision
- `llama3.2:3b` for fast general chat
