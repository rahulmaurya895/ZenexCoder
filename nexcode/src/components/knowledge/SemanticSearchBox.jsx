import { Search } from 'lucide-react';
import { useState } from 'react';
import { useKnowledgeStore } from '@/store/knowledgeStore';
import { useProjectStore } from '@/store/projectStore';

function resultTitle(result = {}) {
  if (result.type === 'external') return result.source || 'External memory';
  return result.file_path || 'Code chunk';
}

export default function SemanticSearchBox() {
  const [value, setValue] = useState('');
  const projectPath = useProjectStore((state) => state.projectPath);
  const search = useKnowledgeStore((state) => state.search);
  const results = useKnowledgeStore((state) => state.searchResults);
  const loading = useKnowledgeStore((state) => state.searchLoading);

  async function submit(event) {
    event?.preventDefault();
    await search(value, projectPath);
  }

  return (
    <section className="knowledge-section">
      <div className="knowledge-section-header">
        <div>
          <h3>Semantic Search</h3>
          <p>Ask by meaning, not exact words.</p>
        </div>
      </div>
      <form className="semantic-search-form" onSubmit={submit}>
        <Search size={15} />
        <input value={value} onChange={(event) => setValue(event.target.value)} placeholder="Where do we process payments?" />
        <button className="primary-button" disabled={loading || !value.trim()}>
          Search
        </button>
      </form>
      <div className="semantic-results">
        {loading ? <div className="muted-text">Searching vector database...</div> : null}
        {!loading && results.length === 0 ? <div className="muted-text">No semantic results yet.</div> : null}
        {results.map((result) => (
          <article className="semantic-result" key={`${result.type}-${result.id}`}>
            <div className="semantic-result-title">
              <strong>{resultTitle(result)}</strong>
              <span>{Number(result.score || 0).toFixed(3)}</span>
            </div>
            {result.url ? <div className="muted-text">{result.url}</div> : null}
            <p>{result.content}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
