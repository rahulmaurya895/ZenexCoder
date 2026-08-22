import { Globe } from 'lucide-react';

/**
 * @param {{browser: object}} props
 */
export default function BrowserViewport({ browser }) {
  const src = browser.base64Image ? `data:image/jpeg;base64,${browser.base64Image}` : '';
  return (
    <div className="browser-viewport">
      {src ? (
        <img src={src} alt={browser.title || browser.url || 'Browser viewport'} />
      ) : (
        <div className="browser-empty">
          <Globe size={26} />
          <span>{browser.active ? 'Waiting for frame' : 'Browser session closed'}</span>
        </div>
      )}
      {browser.isLoading && (
        <div className="browser-loading-overlay">
          <span className="spinner" />
        </div>
      )}
    </div>
  );
}
