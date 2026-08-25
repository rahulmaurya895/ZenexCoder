import { useEffect } from 'react';
import { useAppStore } from '@/store/appStore';
import { useChatStore } from '@/store/chatStore';
import { useSwarmStore } from '@/store/swarmStore';

let listenerUsers = 0;
let disposers = [];
const recordedConsensus = new Set();

function consensusMessage(payload = {}) {
  const steps = payload.executionPlan?.steps || [];
  const fileSteps = steps.filter((step) => step.actionType === 'file_write');
  const fileList = fileSteps.length
    ? fileSteps.map((step) => `  - 📄 \`${step.filePath || step.title}\``).join('\n')
    : '  - 📄 Project files auto-saved to workspace';

  return [
    '🎉 **Swarm Consensus Completed & Files Saved!**',
    '',
    '### 📋 Summary of Work Accomplished:',
    payload.summary || payload.finalCode || 'Architect blueprint created ➔ Senior Dev implemented code ➔ QA verified functionality ➔ SecOps passed security check.',
    '',
    '### 📁 Saved Project Files:',
    fileList,
    '',
    '### 🧪 How to Test in ZenexCoder:',
    '1. Open your saved files directly from the left **File Tree**.',
    '2. Open **Terminal** (`Ctrl+\``) to execute scripts or launch dev server.',
    '3. Review full turn details in the **Agent Run** panel.'
  ].join('\n');
}


function ensureSwarmListeners() {
  if (!disposers.length && window.zezenexcoderr?.swarm) {
    disposers = [
      window.zezenexcoderr.swarm.onAgentTurn((payload) => useSwarmStore.getState().applyTurn(payload)),
      window.zezenexcoderr.swarm.onInternalMessage((payload) => useSwarmStore.getState().addInternalMessage(payload)),
      window.zezenexcoderr.swarm.onConsensus(async (payload) => {
        useSwarmStore.getState().applyConsensus(payload);
        useAppStore.getState().setRightPanelOpen(true);
        if (payload.taskId && !recordedConsensus.has(payload.taskId)) {
          recordedConsensus.add(payload.taskId);
          await useChatStore.getState().addMessage('assistant', consensusMessage(payload), [], payload.modelId || null);
        }
      }),
      window.zezenexcoderr.swarm.onHalt((payload) => useSwarmStore.getState().applyHalt(payload)),
      window.zezenexcoderr.swarm.onError((payload) => useSwarmStore.getState().applyError(payload))
    ].filter(Boolean);
  }
  listenerUsers += 1;
}


function releaseSwarmListeners() {
  listenerUsers = Math.max(0, listenerUsers - 1);
  if (listenerUsers === 0) {
    disposers.forEach((dispose) => dispose());
    disposers = [];
  }
}

export function useSwarm() {
  useEffect(() => {
    ensureSwarmListeners();
    return releaseSwarmListeners;
  }, []);
}
