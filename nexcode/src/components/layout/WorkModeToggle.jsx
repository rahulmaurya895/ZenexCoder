import { Briefcase, Code2 } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useProjectStore } from '@/store/projectStore';
import { useSettingsStore } from '@/store/settingsStore';
import { SYSTEM_PROMPTS } from '@/utils/promptTemplates';

export default function WorkModeToggle() {
  const workMode = useAppStore((state) => state.workMode);
  const setWorkMode = useAppStore((state) => state.setWorkMode);
  const updateAiSettings = useSettingsStore((state) => state.updateAiSettings);
  const setProjectWorkMode = useProjectStore((state) => state.setProjectWorkMode);

  async function switchMode(mode) {
    setWorkMode(mode);
    await updateAiSettings({
      systemPrompt: mode === 'coding' ? SYSTEM_PROMPTS.coding : SYSTEM_PROMPTS.general
    });
    await setProjectWorkMode(mode);
  }

  return (
    <div className="segmented-control" title="Work mode">
      <button className={workMode === 'coding' ? 'active' : ''} onClick={() => switchMode('coding')}>
        <Code2 size={14} /> For coding
      </button>
      <button className={workMode === 'everyday' ? 'active' : ''} onClick={() => switchMode('everyday')}>
        <Briefcase size={14} /> Everyday
      </button>
    </div>
  );
}
