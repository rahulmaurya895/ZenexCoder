import { Plus } from 'lucide-react';
import { useEffect } from 'react';
import { useAutomationStore } from '@/store/automationStore';
import AutomationCard from './AutomationCard';
import AutomationEditor from './AutomationEditor';

export default function AutomationsPanel() {
  const {
    automations,
    editingAutomation,
    loadAutomations,
    addAutomation,
    updateAutomation,
    deleteAutomation,
    toggleAutomation,
    setEditingAutomation,
    runAutomation
  } = useAutomationStore();

  useEffect(() => {
    loadAutomations().catch(() => {});
  }, [loadAutomations]);

  async function save(automation) {
    if (automation.id) await updateAutomation(automation.id, automation);
    else await addAutomation(automation);
    setEditingAutomation(null);
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <span className="panel-title">Automations</span>
        <button className="icon-button" onClick={() => setEditingAutomation({})} title="New automation">
          <Plus size={14} />
        </button>
      </div>
      <div className="panel-body settings-grid">
        {editingAutomation && <AutomationEditor automation={editingAutomation.id ? editingAutomation : undefined} onSave={save} />}
        {automations.map((automation) => (
          <AutomationCard
            key={automation.id}
            automation={automation}
            onRun={() => runAutomation(automation.id)}
            onEdit={() => setEditingAutomation(automation)}
            onDelete={() => deleteAutomation(automation.id)}
            onToggle={() => toggleAutomation(automation.id)}
          />
        ))}
      </div>
    </section>
  );
}
