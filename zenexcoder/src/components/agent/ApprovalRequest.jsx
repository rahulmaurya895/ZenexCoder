import { Check, Edit3, ShieldAlert, X } from 'lucide-react';
import { useState } from 'react';
import { useAgentStore } from '@/store/agentStore';
import { usePermissionsStore } from '@/store/permissionsStore';
import { useProjectStore } from '@/store/projectStore';

/**
 * @param {{approval: object}} props
 */
export default function ApprovalRequest({ approval }) {
  const [remember, setRemember] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editedCommand, setEditedCommand] = useState(approval.description || '');
  const [editedArgs, setEditedArgs] = useState(() => JSON.stringify(approval.mcp?.args || approval.browser?.args || approval.computer?.args || {}, null, 2));
  const [editError, setEditError] = useState('');
  const resolveApproval = useAgentStore((state) => state.resolveApproval);
  const setProjectRule = usePermissionsStore((state) => state.setProjectRule);
  const projectPath = useProjectStore((state) => state.projectPath);
  const isMcp = approval.actionType === 'mcp_tool_call';
  const isBrowser = approval.actionType === 'browser_interact';
  const isComputer = ['computer_screenshot', 'computer_interact'].includes(approval.actionType);
  const canRemember = !isComputer || approval.actionType === 'computer_screenshot';
  const canApproveAll = approval.actionType !== 'computer_interact';

  async function approve(options = {}) {
    if ((isMcp || isBrowser || isComputer) && editing) {
      try {
        options.editedArgs = JSON.parse(editedArgs || '{}');
        setEditError('');
      } catch {
        setEditError('Arguments must be valid JSON.');
        return;
      }
    }
    if (remember && canRemember && projectPath) {
      await setProjectRule(projectPath, approval.actionType, 'allow');
    }
    await resolveApproval(approval.id, 'approve', options);
  }

  return (
    <div
      className={`approval-card ${isMcp ? 'mcp-approval-card' : ''} ${isBrowser ? 'browser-approval-card' : ''} ${isComputer ? 'computer-approval-card' : ''}`}
      onContextMenu={async (event) => {
        event.preventDefault();
        if (!canRemember) return;
        if (projectPath && window.confirm(`Always allow ${approval.actionType} for this project?`)) {
          await setProjectRule(projectPath, approval.actionType, 'allow');
        }
      }}
    >
      <div className="approval-card-title">
        <ShieldAlert size={16} />
        <strong>
          {isMcp
            ? `AI wants to execute ${approval.mcp?.toolName} via ${approval.mcp?.serverName}`
            : isComputer
              ? approval.title || 'AI wants to control your computer'
            : approval.title || `AI wants to ${approval.actionType}`}
        </strong>
        <span className={`risk-pill ${approval.riskLevel}`}>{approval.riskLevel || 'medium'}</span>
      </div>
      {(isMcp || isBrowser || isComputer) && editing ? (
        <textarea rows={7} value={editedArgs} onChange={(event) => setEditedArgs(event.target.value)} />
      ) : editing ? (
        <textarea rows={3} value={editedCommand} onChange={(event) => setEditedCommand(event.target.value)} />
      ) : isMcp ? (
        <pre className="approval-json-block">{JSON.stringify(approval.mcp?.args || {}, null, 2)}</pre>
      ) : isBrowser ? (
        <>
          {approval.browser?.screenshot ? (
            <div className="approval-browser-frame">
              <img src={`data:image/jpeg;base64,${approval.browser.screenshot}`} alt="Current browser viewport" />
            </div>
          ) : null}
          <pre className="approval-json-block">{JSON.stringify(approval.browser?.args || {}, null, 2)}</pre>
        </>
      ) : isComputer ? (
        <>
          <div className="approval-description">
            {approval.actionType === 'computer_interact'
              ? 'High risk: AI wants to take control of your mouse/keyboard.'
              : 'AI wants to capture your current screen.'}
          </div>
          <pre className="approval-json-block">{JSON.stringify(approval.computer?.args || {}, null, 2)}</pre>
        </>
      ) : (
        <div className="approval-description">{approval.description}</div>
      )}
      {editError && <div className="error-text">{editError}</div>}
      {canRemember ? (
        <label className="check-row">
          <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
          Remember for this project
        </label>
      ) : null}
      <div className="chat-input-actions">
        <button className="success-button" onClick={() => approve(editing ? { editedCommand } : {})}>
          <Check size={14} /> Approve
        </button>
        {canApproveAll ? <button onClick={() => approve({ approveAll: true })}>Approve All</button> : null}
        <button className="danger-button" onClick={() => resolveApproval(approval.id, 'deny')}>
          <X size={14} /> Deny
        </button>
        <button onClick={() => setEditing(!editing)}>
          <Edit3 size={14} /> Edit First
        </button>
      </div>
    </div>
  );
}
