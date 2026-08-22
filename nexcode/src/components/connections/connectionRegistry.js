export const CONNECTION_REGISTRY = [
  {
    id: 'extensions',
    name: 'Extensions',
    description: 'Connect external tool servers via Model Context Protocol.',
    icon: 'Server',
    status: 'available',
    settingsRoute: 'extensions'
  },
  {
    id: 'browser',
    name: 'Browser Integration',
    description: 'Allow the AI to browse the web, read docs, and test UIs.',
    icon: 'Globe',
    status: 'available',
    settingsRoute: 'browser'
  },
  {
    id: 'computer_use',
    name: 'Computer Use',
    description: 'Grant the AI control over your mouse, keyboard, and screen.',
    icon: 'MonitorPlay',
    status: 'available',
    settingsRoute: 'computer_use'
  },
  {
    id: 'hooks',
    name: 'Hooks',
    description: 'Bind AI automations to Git events and app lifecycle triggers.',
    icon: 'Link',
    status: 'available',
    settingsRoute: 'hooks'
  },
  {
    id: 'git',
    name: 'Git',
    description: 'Review status, stage changes, switch branches, and commit.',
    icon: 'GitBranch',
    status: 'available',
    settingsRoute: 'git'
  },
  {
    id: 'environments',
    name: 'Environments',
    description: 'Manage per-project env variables, secrets, and runtimes.',
    icon: 'Layers',
    status: 'available',
    settingsRoute: 'environments'
  },
  {
    id: 'worktrees',
    name: 'Worktrees',
    description: 'Create and manage parallel Git worktrees.',
    icon: 'GitFork',
    status: 'available',
    settingsRoute: 'git'
  },
  {
    id: 'agent_environment',
    name: 'Agent Environment',
    description: 'Choose the execution environment used by agent runs.',
    icon: 'Cpu',
    status: 'available',
    settingsRoute: 'agent_environment'
  },
  {
    id: 'terminal_shell',
    name: 'Terminal Shell Selector',
    description: 'Select PowerShell, cmd, Git Bash, WSL, or custom shells.',
    icon: 'Terminal',
    status: 'available',
    settingsRoute: 'terminal'
  },
  {
    id: 'popout_window',
    name: 'Popout Window',
    description: 'Open focused floating views and global hotkey surfaces.',
    icon: 'PanelTopOpen',
    status: 'available',
    settingsRoute: 'popout_window'
  },
  {
    id: 'dictation',
    name: 'Dictation',
    description: 'Voice input for chat, commands, and notes.',
    icon: 'Mic',
    status: 'available',
    settingsRoute: 'dictation'
  },
  {
    id: 'learning',
    name: 'Self-Learning Engine',
    description: 'Review learned anti-patterns and adaptive prompt rules.',
    icon: 'GraduationCap',
    status: 'available',
    settingsRoute: 'learning'
  },
  {
    id: 'team',
    name: 'Collaborative Intelligence',
    description: 'Encrypted LAN sync for shared learned rules and presence.',
    icon: 'Users',
    status: 'available',
    settingsRoute: 'team'
  },
  {
    id: 'cicd',
    name: 'CI/CD Autopilot',
    description: 'Generate IaC, dry-run deployments, monitor health, and roll back safely.',
    icon: 'Rocket',
    status: 'available',
    settingsRoute: 'cicd'
  },
  {
    id: 'qa',
    name: 'Synthetic QA',
    description: 'Run browser scenarios, compare snapshots, and self-heal selectors.',
    icon: 'FlaskConical',
    status: 'available',
    settingsRoute: 'qa'
  },
  {
    id: 'notifications',
    name: 'Notification Center',
    description: 'Review approvals, background tasks, and agent events.',
    icon: 'Bell',
    status: 'available',
    settingsRoute: 'notifications'
  }
];
