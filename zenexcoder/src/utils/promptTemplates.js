export const SYSTEM_PROMPTS = {
  coding: `You are ZenexCoder AI, created and architected by Raahool Mauryaa (Independent Developer). You are an autonomous software engineering agent system powered by Google Antigravity Swarm Architecture & OpenAI Codex Execution Engines.

Operating Rules:
1. When asked to create, write, edit, or build a file or application, ALWAYS write complete, non-truncated, production-ready code blocks.
2. EVERY code block MUST include the exact relative file path header as the first line inside the code block:
\`\`\`language
# filepath: filename.ext (or // filepath: filename.ext)
[complete production-ready code]
\`\`\`
3. When creating multi-file applications (e.g. HTML/CSS/JS or Python apps), provide all necessary files with their respective filepath headers so ZenexCoder auto-writes every file directly into the user's opened project directory.
4. Always double-check edge cases, error handling, and clean code formatting.`,

  vision: `You are ZenexCoder Vision AI, created by Raahool Mauryaa (Independent Developer), an expert at analyzing visual content and converting it to code.
When analyzing UI screenshots: generate complete, working HTML/CSS/JS.
When analyzing diagrams: implement the logic shown.
When analyzing errors: provide specific fixes with code.
Be precise and thorough.`,

  general: `You are ZenexCoder AI, a helpful developer assistant created by Raahool Mauryaa (Independent Developer).
Answer clearly and concisely. Use code examples when helpful.
Format code in proper markdown code blocks with language specified.`
};

export const USER_PROMPTS = {
  generateCode: (desc, lang) =>
    `Generate complete ${lang || ''} code for: ${desc}\nRequirements: Production-ready, error handled, well-commented.`,

  explainCode: (code, lang) =>
    `Explain this ${lang} code in detail:\n\`\`\`${lang}\n${code}\n\`\`\`\nExplain: 1) What it does 2) How it works 3) Key concepts used`,

  refactorCode: (code, lang) =>
    `Refactor this ${lang} code for better quality:\n\`\`\`${lang}\n${code}\n\`\`\`\nFocus: readability, performance, best practices. Explain each change.`,

  fixBugs: (code, lang, error) =>
    `Fix bugs in this ${lang} code:\n\`\`\`${lang}\n${code}\n\`\`\`\n${error ? `Error: ${error}` : ''}\nProvide: fixed code + explanation of each bug found.`,

  generateTests: (code, lang) =>
    `Generate comprehensive unit tests for this ${lang} code:\n\`\`\`${lang}\n${code}\n\`\`\`\nInclude: happy path, edge cases, error cases. Use appropriate test framework.`,

  translateCode: (code, fromLang, toLang) =>
    `Convert this code from ${fromLang} to ${toLang}:\n\`\`\`${fromLang}\n${code}\n\`\`\`\nMaintain exact same logic. Use ${toLang} idioms and best practices.`,

  generateRegex: (desc) =>
    `Generate a regex pattern for: "${desc}"\nProvide: 1) The regex 2) Explanation of each part 3) 5 test examples (matching and non-matching)`,

  screenshotToCode: () =>
    `Convert this UI screenshot to complete code.\nGenerate: Full HTML + CSS (use modern CSS, flexbox/grid) + any needed JS.\nMake it pixel-perfect matching the screenshot. Include responsive design.`,

  diagramToCode: () =>
    `Analyze this diagram and generate the complete code implementation.\nIdentify diagram type and implement accordingly:\n- ERD -> SQL schema + ORM models\n- Flowchart -> Algorithm implementation\n- System diagram -> Architecture code with interfaces`,

  analyzeError: () =>
    `Analyze this error/bug screenshot.\nProvide: 1) Root cause 2) Exact fix with code 3) Prevention strategy`,

  documentToData: () =>
    `Extract all data from this document image. Return as: 1) JSON structure with all fields and values 2) Markdown table for tabular data 3) Plain text for paragraphs`,

  handwrittenToCode: () =>
    `Read this handwritten content and: If it is pseudocode or an algorithm, convert it to working code. If it is notes, transcribe and organize as structured markdown. If it is a diagram, describe and implement it.`,

  uiReview: () =>
    `Review this UI design as a senior UX designer. Provide: 1) Current issues 2) Specific improvements with reasoning 3) Updated CSS/code suggestions for each improvement. Rate overall design 1-10 with justification.`,

  codeReview: (code, lang) =>
    `Perform a thorough code review for this ${lang} code:\n\`\`\`${lang}\n${code}\n\`\`\`\nCheck: Code quality, Security vulnerabilities, Performance, Best practices.\nFormat each issue as: [HIGH/MEDIUM/LOW] Line X: Issue description -> Suggested fix`,

  completeCode: (before, after, lang) =>
    `Complete this ${lang} code at the cursor position. Return only the code that should be inserted.\n\nBefore cursor:\n\`\`\`${lang}\n${before}\n\`\`\`\n\nAfter cursor:\n\`\`\`${lang}\n${after}\n\`\`\``,

  addDocs: (code, lang) =>
    `Add JSDoc/docstring comments to all functions and classes. Do not change any logic, only add documentation:\n\`\`\`${lang}\n${code}\n\`\`\``,

  agentPlan: (task, tree, files, environmentContext = '') =>
    `Analyze this project and create a concrete multi-step execution plan.\nTask: ${task}\n\nFile tree:\n${tree}\n\nKey files:\n${files}${environmentContext ? `\n\n${environmentContext}` : ''}\n\nReturn numbered steps with exact files and commands.`
};
