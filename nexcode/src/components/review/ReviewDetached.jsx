import ReviewPanel from './ReviewPanel';

export default function ReviewDetached() {
  return (
    <section className="panel">
      <div className="panel-header">
        <span className="panel-title">Detached Review</span>
      </div>
      <div className="panel-body">
        <ReviewPanel />
      </div>
    </section>
  );
}
