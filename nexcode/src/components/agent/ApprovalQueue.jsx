import ApprovalRequest from './ApprovalRequest';
import { useAgentStore } from '@/store/agentStore';

export default function ApprovalQueue() {
  const pendingApprovals = useAgentStore((state) => state.pendingApprovals);
  if (!pendingApprovals.length) return null;
  return (
    <div className="approval-queue">
      {pendingApprovals.map((approval) => (
        <ApprovalRequest key={approval.id} approval={approval} />
      ))}
    </div>
  );
}
