import { useEffect, useRef } from 'react';
import { useAgentStore } from '@/store/agentStore';
import { useAppStore } from '@/store/appStore';
import { useAutomationStore } from '@/store/automationStore';
import { useEnvironmentStore } from '@/store/environmentStore';
import { useGitStore } from '@/store/gitStore';
import { useHookStore } from '@/store/hookStore';
import { usePermissionsStore } from '@/store/permissionsStore';
import { useProjectStore } from '@/store/projectStore';

let listenerUsers = 0;
let disposers = [];

function wildcardMatches(pattern = '', value = '') {
  if (!pattern) return true;
  const escaped = pattern
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${escaped}$`, 'i').test(value || '');
}

function globMatches(glob = '**/*', filePath = '') {
  if (!glob || glob === '**/*') return true;
  return wildcardMatches(glob.replaceAll('\\', '/'), filePath.replaceAll('\\', '/'));
}

function eventMatches(hookEvent, event) {
  return hookEvent === event;
}

function conditionMatches(hook = {}, context = {}) {
  const condition = hook.condition || {};
  const branchPattern = condition.branchPattern || '';
  if (branchPattern && !wildcardMatches(branchPattern, context.branch || context.payload?.branch || '')) return false;

  const extensionText = condition.fileExtensions || '';
  if (extensionText && context.filePath) {
    const extensions = extensionText
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    if (extensions.length && !extensions.some((extension) => context.filePath.toLowerCase().endsWith(extension))) {
      return false;
    }
  }

  const glob = condition.glob || '';
  if (glob && context.filePath && !globMatches(glob, context.filePath)) return false;
  return true;
}

function fillTemplate(template = '', context = {}) {
  return template
    .replaceAll('{{event}}', context.event || '')
    .replaceAll('{{projectPath}}', context.projectPath || '')
    .replaceAll('{{filePath}}', context.filePath || '')
    .replaceAll('{{fileContent}}', context.fileContent || '')
    .replaceAll('{{branch}}', context.branch || '')
    .replaceAll('{{diff}}', context.diff || '');
}

function runPermissions(projectPath) {
  const permissions = usePermissionsStore.getState();
  const app = useAppStore.getState();
  return {
    mode: permissions.mode,
    projectRules: projectPath ? permissions.projectRules[projectPath] || {} : {},
    sessionAllows: useAgentStore.getState().sessionAllows,
    showSystemNotifications: permissions.showSystemNotifications,
    workMode: app.workMode,
    devToolsVisible: app.devToolsVisible
  };
}

function waitForAgentCompletion(runId, timeoutMs = 180000) {
  if (!runId) return Promise.resolve('completed');
  return new Promise((resolve) => {
    const current = useAgentStore.getState();
    if (current.plan.id === runId && ['completed', 'error', 'stopped'].includes(current.runState)) {
      resolve(current.runState);
      return;
    }
    const timeout = setTimeout(() => {
      dispose();
      resolve('timeout');
    }, timeoutMs);
    const dispose = useAgentStore.subscribe((state) => {
      if (state.plan.id === runId && ['completed', 'error', 'stopped'].includes(state.runState)) {
        clearTimeout(timeout);
        dispose();
        resolve(state.runState);
      }
    });
  });
}

async function runAgentPromptHook(hook, context) {
  const projectPath = context.projectPath || useProjectStore.getState().projectPath;
  const plan = {
    id: `hook-${hook.id}-${Date.now()}`,
    title: `Hook: ${hook.name}`,
    steps: [
      {
        id: `hook-step-${Date.now()}`,
        title: hook.name,
        description: fillTemplate(hook.prompt || 'Review this hook event.', context),
        actionType: 'file_read'
      }
    ]
  };
  const result = await useAgentStore.getState().startRun(plan, {
    cwd: projectPath,
    permissions: runPermissions(projectPath)
  });
  return waitForAgentCompletion(result?.runId || plan.id);
}

async function runTerminalHook(hook, context) {
  const projectPath = context.projectPath || useProjectStore.getState().projectPath;
  const plan = {
    id: `hook-${hook.id}-${Date.now()}`,
    title: `Hook command: ${hook.name}`,
    steps: [
      {
        id: `hook-command-${Date.now()}`,
        title: hook.name,
        command: fillTemplate(hook.command || '', context),
        actionType: 'terminal_run'
      }
    ]
  };
  const result = await useAgentStore.getState().startRun(plan, {
    cwd: projectPath,
    permissions: runPermissions(projectPath)
  });
  return waitForAgentCompletion(result?.runId || plan.id);
}

async function runHookAction(hook, context) {
  if (hook.actionType === 'automation' && hook.automationId) {
    const result = await useAutomationStore.getState().runAutomation(hook.automationId, context);
    return waitForAgentCompletion(result?.runId);
  }
  if (hook.actionType === 'terminal_command') {
    return runTerminalHook(hook, context);
  }
  return runAgentPromptHook(hook, context);
}

async function runLegacyFileSaveAutomations(context) {
  const automations = useAutomationStore.getState().automations.filter(
    (automation) =>
      automation.enabled &&
      automation.triggerType === 'on_file_save' &&
      globMatches(automation.triggerParams?.glob, context.filePath || '')
  );
  for (const automation of automations) {
    useAutomationStore.getState().runAutomation(automation.id, context).catch(() => {});
  }
}

async function executeTrigger(trigger) {
  const hookStore = useHookStore.getState();
  const projectPath = trigger.projectPath || useProjectStore.getState().projectPath || '';
  const context = {
    ...trigger.payload,
    event: trigger.event,
    projectPath,
    payload: trigger.payload || {},
    filePath: trigger.payload?.filePath || '',
    fileContent: trigger.payload?.content || trigger.payload?.fileContent || '',
    branch: trigger.payload?.branch || useGitStore.getState().branch || ''
  };

  const matches = hookStore.hooks.filter(
    (hook) => hook.enabled && eventMatches(hook.eventType, trigger.event) && conditionMatches(hook, context)
  );

  let status = 'allow';
  const results = [];
  try {
    if (trigger.event === 'on_file_save') {
      await runLegacyFileSaveAutomations(context);
    }

    for (const hook of matches) {
      const resultState = await runHookAction(hook, context);
      const blocked = ['error', 'stopped', 'timeout'].includes(resultState);
      results.push({ hookId: hook.id, state: resultState });
      if (blocked && hook.blockOnIssues) {
        status = 'block';
        break;
      }
    }
  } catch (error) {
    hookStore.setError(error.message);
    status = matches.some((hook) => hook.blockOnIssues) ? 'block' : 'allow';
    results.push({ error: error.message });
  }

  if (trigger.triggerId) {
    await window.zezenexcoderr.hooks.resolveTrigger({
      triggerId: trigger.triggerId,
      status,
      details: { results }
    });
  }
  return { status, results };
}

function ensureHookListeners() {
  if (!window.zezenexcoderr?.hooks || !window.zezenexcoderr?.automation) return;
  if (!disposers.length) {
    disposers = [
      window.zezenexcoderr.hooks.onExternalTrigger((trigger) => {
        executeTrigger(trigger).catch((error) => {
          useHookStore.getState().setError(error.message);
          if (trigger.triggerId) {
            window.zezenexcoderr.hooks.resolveTrigger({
              triggerId: trigger.triggerId,
              status: 'allow',
              details: { error: error.message, reason: 'Hook handler failed; failing open.' }
            }).catch(() => {});
          }
        });
      }),
      window.zezenexcoderr.automation.onFileSaved((payload) => {
        executeTrigger({
          event: 'on_file_save',
          projectPath: useProjectStore.getState().projectPath || '',
          payload,
          source: 'file',
          waiting: false
        }).catch((error) => useHookStore.getState().setError(error.message));
      })
    ];
  }
  listenerUsers += 1;
}

function releaseHookListeners() {
  listenerUsers = Math.max(0, listenerUsers - 1);
  if (listenerUsers === 0) {
    disposers.forEach((dispose) => dispose());
    disposers = [];
  }
}

export function useHooks() {
  const hooks = useHookStore();
  const projectPath = useProjectStore((state) => state.projectPath);
  const branch = useGitStore((state) => state.branch);
  const activeEnvId = useEnvironmentStore((state) => JSON.stringify(state.activeEnvId));
  const previous = useRef({ projectPath: '', branch: '', activeEnvId: '' });

  useEffect(() => {
    ensureHookListeners();
    useHookStore.getState().loadHooks().catch(() => {});
    return releaseHookListeners;
  }, []);

  useEffect(() => {
    if (!projectPath || previous.current.projectPath === projectPath) return;
    previous.current.projectPath = projectPath;
    useHookStore.getState().registerProject(projectPath).catch(() => {});
    window.zezenexcoderr?.hooks?.triggerAppEvent({
      event: 'onProjectOpen',
      projectPath,
      payload: { projectPath }
    }).catch(() => {});
  }, [projectPath]);

  useEffect(() => {
    if (!projectPath || !branch || previous.current.branch === branch) return;
    previous.current.branch = branch;
    window.zezenexcoderr?.hooks?.triggerAppEvent({
      event: 'onBranchChange',
      projectPath,
      payload: { projectPath, branch }
    }).catch(() => {});
  }, [branch, projectPath]);

  useEffect(() => {
    if (!projectPath || !activeEnvId || previous.current.activeEnvId === activeEnvId) return;
    previous.current.activeEnvId = activeEnvId;
    window.zezenexcoderr?.hooks?.triggerAppEvent({
      event: 'onEnvChange',
      projectPath,
      payload: { projectPath, activeEnvId }
    }).catch(() => {});
  }, [activeEnvId, projectPath]);

  return hooks;
}
