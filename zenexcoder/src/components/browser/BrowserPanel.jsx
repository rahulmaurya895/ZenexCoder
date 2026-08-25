import { Globe, ScanText } from 'lucide-react';
import { useBrowser } from '@/hooks/useBrowser';
import BrowserToolbar from './BrowserToolbar';
import BrowserViewport from './BrowserViewport';

export default function BrowserPanel() {
  const browser = useBrowser();

  return (
    <section className="panel browser-panel">
      <div className="panel-header">
        <Globe size={16} />
        <span className="panel-title">Browser</span>
        <span className={`browser-status ${browser.active ? 'active' : ''}`}>
          {browser.active ? 'Active' : 'Stopped'}
        </span>
      </div>
      <BrowserToolbar browser={browser} />
      {browser.error && <div className="browser-error-banner">{browser.error}</div>}
      <div className="browser-layout">
        <BrowserViewport browser={browser} />
        <aside className="browser-dom-panel">
          <div className="browser-dom-header">
            <span>{browser.title || browser.url || 'Page'}</span>
            <button onClick={browser.readPage} disabled={!browser.active || browser.isLoading}>
              <ScanText size={14} /> Read Page
            </button>
          </div>
          <pre>{browser.dom || 'No page snapshot yet.'}</pre>
        </aside>
      </div>
    </section>
  );
}
