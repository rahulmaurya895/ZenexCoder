import { useEffect } from 'react';
import { formatTokens } from '@/utils/tokenCounter';
import { useTokenUsage } from '@/hooks/useTokenUsage';
import { useAppStore } from '@/store/appStore';

export default function TokenMeter() {
  const usage = useTokenUsage();
  const setNotice = useAppStore((state) => state.setNotice);
  const percent = Math.min(100, Math.round(usage.ratio * 100));
  const title = `System prompt: ${formatTokens(usage.systemTokens)} | History: ${formatTokens(usage.historyTokens)} | Attachments: ${formatTokens(usage.attachmentTokens)}`;

  useEffect(() => {
    if (usage.status === 'danger') {
      setNotice('Old messages may be removed to fit context window');
    }
  }, [setNotice, usage.status]);

  return (
    <div className={`token-meter ${usage.status}`} title={title}>
      <div className="token-meter-label">
        {formatTokens(usage.total)} / {formatTokens(usage.max)} tokens
      </div>
      <div className="token-meter-track">
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
