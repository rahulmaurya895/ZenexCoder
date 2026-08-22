import { Eye } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import ReviewPanel from './ReviewPanel';

/**
 * @param {{sourceId?: string}} props
 */
export default function ReviewButton({ sourceId }) {
  const [open, setOpen] = useState(false);
  const [records, setRecords] = useState([]);
  const pendingReviewCount = useAppStore((state) => state.pendingReviewCount);
  const setPendingReviewCount = useAppStore((state) => state.setPendingReviewCount);
  const reviewMode = useAppStore((state) => state.reviewMode);

  async function refresh() {
    const list = await window.zenexcoder.review.list('pending_review');
    setRecords(sourceId ? list.filter((item) => item.stepId === sourceId || item.messageId === sourceId) : list);
    setPendingReviewCount(list.length);
  }

  useEffect(() => {
    refresh().catch(() => {});
    const dispose = window.zenexcoder.review.onUpdate(refresh);
    return dispose;
  }, [sourceId]);

  async function openReview() {
    await refresh();
    if (reviewMode === 'detached') {
      await window.zenexcoder.review.openDetached();
      return;
    }
    setOpen((value) => !value);
  }

  return (
    <>
      <button onClick={openReview}>
        <Eye size={14} /> Review ({records.length || pendingReviewCount})
      </button>
      {open && <ReviewPanel records={records.length ? records : undefined} onChange={refresh} />}
    </>
  );
}
