import { ArrowLeft, ArrowRight, Power, RefreshCw, Search, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

/**
 * @param {{browser: object}} props
 */
export default function BrowserToolbar({ browser }) {
  const [draftUrl, setDraftUrl] = useState(browser.url || '');

  useEffect(() => {
    setDraftUrl(browser.url || '');
  }, [browser.url]);

  async function submit(event) {
    event.preventDefault();
    if (!draftUrl.trim()) return;
    await browser.navigate(draftUrl.trim());
  }

  return (
    <form className="browser-toolbar" onSubmit={submit}>
      <button type="button" className="icon-button" onClick={browser.back} disabled={!browser.active || browser.isLoading} title="Back">
        <ArrowLeft size={15} />
      </button>
      <button type="button" className="icon-button" onClick={browser.forward} disabled={!browser.active || browser.isLoading} title="Forward">
        <ArrowRight size={15} />
      </button>
      <button type="button" className="icon-button" onClick={browser.reload} disabled={!browser.active || browser.isLoading} title="Reload">
        <RefreshCw size={15} />
      </button>
      <label className="browser-url-field">
        <Search size={14} />
        <input
          value={draftUrl}
          onChange={(event) => setDraftUrl(event.target.value)}
          placeholder="https://example.com"
          disabled={browser.isLoading}
        />
      </label>
      {!browser.active ? (
        <button type="button" className="primary-button" onClick={browser.start} disabled={browser.isLoading}>
          <Power size={14} /> Start
        </button>
      ) : (
        <button type="button" className="danger-button" onClick={browser.stop} disabled={browser.isLoading}>
          <XCircle size={14} /> Close Session
        </button>
      )}
    </form>
  );
}
