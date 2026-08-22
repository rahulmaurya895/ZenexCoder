# 🚀 ZezenexCoderr - AI-Powered Developer Environment

ZezenexCoderr is a production-grade, local-first, AI-native desktop IDE built with **Electron**, **React**, **Vite**, and **Tailwind CSS**. It combines multi-provider AI streaming (OpenAI, Anthropic, Google Gemini, Ollama), integrated terminal command execution, visual screen analysis, vector search, and local MCP tool integrations into a unified environment.

---

## ⚡ Quick Start Guide

### Prerequisites
- **Node.js**: v18.x or higher (v24 supported)
- **Windows / macOS / Linux**
- **Ollama** (optional, for 100% offline local AI generation)

### Launching the Application

Simply run the batch launcher from the project root:

```powershell
.\run_app.bat
```

Or manually:

```powershell
cd zenexcoder
npm run dev
```

---

## 🛠️ Key Capabilities & Features

### 1. Multi-Provider AI Streaming Engine
- **Supported Providers**: OpenAI (`gpt-4o-mini`), Anthropic (`claude-3-5-sonnet`), Google Gemini (`gemini-2.0-flash`), Ollama (`llama3.2:3b`, `qwen2.5-coder:7b`).
- Real-time token streaming over Electron IPC (`ai:stream`).
- Global safety controls & emergency stream cancellation (`Ctrl+Shift+K`).

### 2. Integrated Terminal & Command Runner
- Built-in terminal engine with streaming output forwarding.
- Full shell detection (PowerShell, Command Prompt, Bash, Zsh).

### 3. One-Click Ollama Setup & Detection
- Automatic detection of local Ollama binary & service availability on app boot.
- One-click **Install Wizard** component (`InstallWizard.jsx`) with platform-native silent installer download.
- Model card downloads with speed, ETA, and progress bar (`ollama:pull`).

### 4. Vision & Screenshot Analysis
- Primary display screenshot capture via Electron `desktopCapturer` / vision IPC.
- Pass error screenshots, UI mockups, or diagrams directly to multimodal AI models (`llava:7b`, Gemini, GPT-4o).

---

## 🧪 Testing & Verification

Run the automated backend test suite:

```powershell
cd zenexcoder
npx electron test/aiServiceTest.js
```

### Test Results Summary:
- ✅ **File System I/O**: Passed
- ✅ **Ollama Binary Detector & Status Check**: Passed
- ✅ **Provider Environment & Key Handlers**: Passed

---

## 📂 Project Structure

```
zenexCoder/
├── run_app.bat                   # Instant Windows dev launcher
└── zenexcoder/                      # Primary Application Package
    ├── electron/
    │   ├── main.js               # Electron main process & IPC router
    │   ├── preload.js            # Secure contextBridge IPC exposure
    │   ├── electron.vite.config.js # Electron-Vite entry config
    │   └── handlers/             # 39 IPC handler modules
    │       ├── aiHandler.js      # Multi-provider streaming engine
    │       ├── ollamaHandler.js  # Ollama detector, service & installer
    │       ├── terminalHandler.js# Terminal execution engine
    │       └── fileHandler.js    # File tree & I/O operations
    ├── src/                      # React Renderer Frontend
    │   ├── components/           # UI components (chat, editor, ollama, vision)
    │   ├── hooks/                # Custom React state hooks (useOllama, useAI)
    │   └── store/                # Zustand stores
    └── test/
        └── aiServiceTest.js      # Automated backend test suite
```
