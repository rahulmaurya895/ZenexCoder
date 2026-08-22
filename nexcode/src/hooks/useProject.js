import { useProjectStore } from '@/store/projectStore';

export function useProject() {
  const store = useProjectStore();
  return {
    ...store,
    activeFile: store.getActiveFile()
  };
}
