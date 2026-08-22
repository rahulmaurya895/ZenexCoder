import { create } from 'zustand';
import { useAgentStore } from './agentStore';
import { useAppStore } from './appStore';
import { usePermissionsStore } from './permissionsStore';
import { useProjectStore } from './projectStore';

const modeRank = { default: 0, 'auto-review': 1, 'full-access': 2 };

function restrictiveMode(globalMode = 'default', automationMode = 'default') {
  return modeRank[automationMode] < modeRank[globalMode] ? automationMode : globalMode;
}

export const useAutomationStore = create((set, get) => ({
  automations: [],
  editingAutomation: null,
  async loadAutomations() {
    const automations = await window.nexcode.automation.list();
    set({ automations });
  },
  async addAutomation(automation) {
    const saved = await window.nexcode.automation.save(automation);
    set((state) => ({ automations: [saved, ...state.automations.filter((item) => item.id !== saved.id)] }));
    return saved;
  },
  async updateAutomation(id, patch) {
    const current = get().automations.find((item) => item.id === id);
    const saved = await window.nexcode.automation.save({ ...current, ...patch, id });
    set((state) => ({ automations: state.automations.map((item) => (item.id === id ? saved : item)) }));
    return saved;
  },
  async deleteAutomation(id) {
    await window.nexcode.automation.delete(id);
    set((state) => ({ automations: state.automations.filter((item) => item.id !== id) }));
  },
  async toggleAutomation(id) {
    const current = get().automations.find((item) => item.id === id);
    if (current) await get().updateAutomation(id, { enabled: !current.enabled });
  },
  setEditingAutomation(editingAutomation) {
    set({ editingAutomation });
  },
  async runAutomation(id, context = {}) {
    const automation = get().automations.find((item) => item.id === id);
    if (!automation) return;
    const project = useProjectStore.getState();
    const runProjectPath = context.projectPath || project.projectPath;
    const permissions = usePermissionsStore.getState();
    const app = useAppStore.getState();
    const mode = restrictiveMode(permissions.mode, automation.permissionMode || permissions.mode);
    const projectRules = runProjectPath ? permissions.projectRules[runProjectPath] || {} : {};
    const fill = (template = '') =>
      template
        .replaceAll('{{filePath}}', context.filePath || '')
        .replaceAll('{{fileContent}}', context.fileContent || '')
        .replaceAll('{{diff}}', context.diff || '');
    const plan = {
      id: `automation-${id}-${Date.now()}`,
      title: `Automation: ${automation.name}`,
      steps: [
        {
          id: `automation-step-${Date.now()}`,
          title: automation.name,
          description: fill(automation.promptTemplate),
          actionType: 'file_read'
        }
      ]
    };
    const runResult = await useAgentStore.getState().startRun(plan, {
      cwd: runProjectPath,
      permissions: {
        mode,
        projectRules,
        sessionAllows: useAgentStore.getState().sessionAllows,
        showSystemNotifications: permissions.showSystemNotifications,
        workMode: app.workMode,
        devToolsVisible: app.devToolsVisible
      }
    });
    const updated = await window.nexcode.automation.markRun(id);
    set((state) => ({ automations: state.automations.map((item) => (item.id === id ? updated : item)) }));
    return { runId: runResult?.runId || plan.id, automation: updated };
  }
}));
