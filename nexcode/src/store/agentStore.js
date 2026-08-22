import { create } from 'zustand';

const emptyPlan = { id: null, title: '', steps: [], currentStepIndex: 0 };

export const useAgentStore = create((set, get) => ({
  plan: emptyPlan,
  runState: 'idle',
  pendingApprovals: [],
  sessionAllows: [],
  followUps: [],
  startedAt: null,
  completedAt: null,
  async startRun(plan, options = {}) {
    const normalizedPlan = {
      id: plan.id || `run-${Date.now()}`,
      title: plan.title || 'Agent Run',
      steps: (plan.steps || []).map((step, index) => ({
        id: step.id || `step-${index + 1}-${Date.now()}`,
        title: step.title || `Step ${index + 1}`,
        description: step.description || '',
        status: step.status || 'pending',
        files: step.files || [],
        output: step.output || '',
        durationMs: step.durationMs || 0,
        ...step
      })),
      currentStepIndex: 0
    };
    set({ plan: normalizedPlan, runState: 'running', startedAt: Date.now(), completedAt: null });
    return window.zenexcoder.agent.startRun({ ...normalizedPlan, ...options });
  },
  hydrateRun(plan) {
    set({ plan, runState: 'running', startedAt: Date.now(), completedAt: null });
  },
  updateStep(step) {
    set((state) => {
      const exists = state.plan.steps.some((item) => item.id === step.id);
      const steps = exists
        ? state.plan.steps.map((item) => (item.id === step.id ? { ...item, ...step } : item))
        : [...state.plan.steps, step];
      const currentStepIndex = Math.max(0, steps.findIndex((item) => item.status === 'running'));
      return { plan: { ...state.plan, steps, currentStepIndex: currentStepIndex === -1 ? state.plan.currentStepIndex : currentStepIndex } };
    });
  },
  setRunState(runState) {
    set({ runState, completedAt: ['completed', 'error', 'stopped'].includes(runState) ? Date.now() : get().completedAt });
  },
  async pause() {
    const runId = get().plan.id;
    set({ runState: 'paused' });
    if (runId) await window.zenexcoder.agent.control({ runId, action: 'pause' });
  },
  async resume() {
    const runId = get().plan.id;
    set({ runState: 'running' });
    if (runId) await window.zenexcoder.agent.control({ runId, action: 'resume' });
  },
  async stop() {
    const runId = get().plan.id;
    set({ runState: 'stopped' });
    if (runId) await window.zenexcoder.agent.control({ runId, action: 'stop' });
  },
  async skipStep(id) {
    const runId = get().plan.id;
    set((state) => ({
      plan: {
        ...state.plan,
        steps: state.plan.steps.map((step) => (step.id === id ? { ...step, status: 'skipped' } : step))
      }
    }));
    if (runId) await window.zenexcoder.agent.control({ runId, action: 'skip', stepId: id });
  },
  editStep(id, patch) {
    const runId = get().plan.id;
    set((state) => ({
      plan: {
        ...state.plan,
        steps: state.plan.steps.map((step) => (step.id === id ? { ...step, ...patch } : step))
      }
    }));
    if (runId) {
      window.zenexcoder.agent.control({ runId, action: 'edit-step', stepId: id, patch }).catch(() => {});
    }
  },
  addApproval(approval) {
    set((state) => ({
      pendingApprovals: state.pendingApprovals.some((item) => item.id === approval.id)
        ? state.pendingApprovals
        : [...state.pendingApprovals, approval]
    }));
  },
  async resolveApproval(id, decision, options = {}) {
    const approval = get().pendingApprovals.find((item) => item.id === id);
    set((state) => ({
      pendingApprovals: state.pendingApprovals.filter((item) => item.id !== id),
      sessionAllows:
        options.approveAll && approval?.actionType
          ? [...new Set([...state.sessionAllows, approval.actionType])]
          : state.sessionAllows
    }));
    await window.zenexcoder.agent.respondApproval({
      actionId: id,
      decision,
      editedCommand: options.editedCommand || null,
      approveAll: Boolean(options.approveAll),
      editedArgs: options.editedArgs || null,
      actionType: approval?.actionType || null,
      description: approval?.description || approval?.title || ''
    });
    if (decision === 'approve' && approval?.actionType === 'swarm_consensus' && approval.executionPlan?.steps?.length) {
      await get().startRun(approval.executionPlan, approval.runOptions || {});
    }
    if (approval) await window.zenexcoder.store.set(`approval:last:${id}`, { approval, decision }).catch(() => {});
  },
  addFollowUp(content, mode = 'queue') {
    set((state) => ({ followUps: [...state.followUps, { id: `follow-${Date.now()}`, content, mode, createdAt: Date.now() }] }));
  },
  insertSteerStep(content) {
    let insertedStep = null;
    set((state) => {
      const step = {
        id: `steer-${Date.now()}`,
        title: 'Steer instruction',
        description: content,
        status: 'pending',
        added: true,
        files: [],
        output: '',
        durationMs: 0
      };
      insertedStep = step;
      const insertAt = Math.max(0, state.plan.currentStepIndex + 1);
      const steps = [...state.plan.steps];
      steps.splice(insertAt, 0, step);
      return { plan: { ...state.plan, steps } };
    });
    const runId = get().plan.id;
    if (runId && insertedStep) {
      window.zenexcoder.agent.control({ runId, action: 'insert-step', step: insertedStep }).catch(() => {});
    }
  },
  consumeNextQueuedFollowUp() {
    const next = get().followUps.find((item) => item.mode === 'queue');
    if (!next) return null;
    set((state) => ({ followUps: state.followUps.filter((item) => item.id !== next.id) }));
    return next;
  },
  reset() {
    set({ plan: emptyPlan, runState: 'idle', pendingApprovals: [], sessionAllows: [], followUps: [], startedAt: null, completedAt: null });
  }
}));
