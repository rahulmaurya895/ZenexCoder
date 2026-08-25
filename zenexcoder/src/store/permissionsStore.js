import { create } from 'zustand';

const defaults = {
  // Broad access lets users and agents use AI, browser, files, and terminal
  // workflows without the old per-action confirmation flow. Destructive
  // actions remain protected by the Electron handler.
  mode: 'full-access',
  projectRules: {},
  showSystemNotifications: true,
  accessPolicyVersion: 2
};

export const usePermissionsStore = create((set, get) => ({
  ...defaults,
  async load() {
    const saved = await window.zezenexcoderr.store.get('permissions', defaults);
    // Upgrade profiles created before the broad-access policy. A later user
    // selection is persisted and is never overwritten.
    const needsAccessUpgrade = !saved?.accessPolicyVersion;
    set({
      ...defaults,
      ...saved,
      ...(needsAccessUpgrade ? { mode: 'full-access', accessPolicyVersion: defaults.accessPolicyVersion } : {})
    });
    if (needsAccessUpgrade) {
      await get().persist({ mode: 'full-access', accessPolicyVersion: defaults.accessPolicyVersion });
    }
  },
  async persist(patch = {}) {
    const next = { ...get(), ...patch };
    const serializable = {
      mode: next.mode,
      projectRules: next.projectRules,
      showSystemNotifications: next.showSystemNotifications,
      accessPolicyVersion: defaults.accessPolicyVersion
    };
    await window.zezenexcoderr.store.set('permissions', serializable);
    set(patch);
  },
  async setMode(mode) {
    await get().persist({ mode });
  },
  async setProjectRule(projectPath, actionType, rule) {
    const projectRules = {
      ...get().projectRules,
      [projectPath]: {
        ...(get().projectRules[projectPath] || {}),
        [actionType]: rule
      }
    };
    await get().persist({ projectRules });
  },
  async setSystemNotifications(showSystemNotifications) {
    await get().persist({ showSystemNotifications });
  }
}));
