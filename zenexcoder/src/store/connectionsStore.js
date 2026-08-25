import { create } from 'zustand';
import { CONNECTION_REGISTRY } from '@/components/connections/connectionRegistry';

const defaultEnabled = CONNECTION_REGISTRY.reduce(
  (acc, entry) => ({ ...acc, [entry.id]: entry.status === 'available' }),
  {}
);

export const useConnectionsStore = create((set, get) => ({
  registry: CONNECTION_REGISTRY,
  enabledIntegrations: defaultEnabled,
  loading: false,
  async load() {
    set({ loading: true });
    const settings = await window.zezenexcoderr.store.get('settings', {}).catch(() => ({}));
    set({
      enabledIntegrations: {
        ...defaultEnabled,
        ...(settings.connections?.enabledIntegrations || {})
      },
      loading: false
    });
  },
  async persist(enabledIntegrations = get().enabledIntegrations) {
    const settings = await window.zezenexcoderr.store.get('settings', {}).catch(() => ({}));
    await window.zezenexcoderr.store.set('settings', {
      ...settings,
      connections: {
        ...(settings.connections || {}),
        enabledIntegrations
      }
    });
    set({ enabledIntegrations });
  },
  setStatus(id, status) {
    set((state) => ({
      registry: state.registry.map((entry) => (entry.id === id ? { ...entry, status } : entry))
    }));
  },
  async toggleIntegration(id) {
    const entry = get().registry.find((item) => item.id === id);
    if (!entry || entry.status === 'coming_soon') return;
    const enabledIntegrations = {
      ...get().enabledIntegrations,
      [id]: !get().enabledIntegrations[id]
    };
    await get().persist(enabledIntegrations);
  }
}));
