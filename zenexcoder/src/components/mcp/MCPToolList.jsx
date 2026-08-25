import { Boxes, Database, Wrench } from 'lucide-react';

function SchemaPreview({ schema }) {
  const text = JSON.stringify(schema || {}, null, 2);
  return <pre className="mcp-schema-preview">{text}</pre>;
}

function EmptyCapabilities() {
  return (
    <div className="empty-state compact-empty">
      <div className="empty-state-inner">
        <h2>No tools or resources exposed.</h2>
        <p>The server connected successfully but did not advertise capabilities.</p>
      </div>
    </div>
  );
}

/**
 * @param {{tools: object[], resources: object[], resourceTemplates: object[]}} props
 */
export default function MCPToolList({ tools = [], resources = [], resourceTemplates = [] }) {
  const hasCapabilities = tools.length || resources.length || resourceTemplates.length;

  return (
    <div className="mcp-tool-list">
      <div className="mcp-capability-banner">
        <Boxes size={14} />
        <span>Discovered MCP capabilities are ready for the next agent tool-invocation integration step.</span>
      </div>
      {!hasCapabilities ? (
        <EmptyCapabilities />
      ) : (
        <>
          <section className="mcp-capability-section">
            <div className="git-section-header">
              <Wrench size={14} />
              <div className="panel-title">Tools ({tools.length})</div>
            </div>
            <div className="mcp-tool-grid">
              {tools.map((tool) => (
                <article className="mcp-tool-card" key={tool.name}>
                  <strong>{tool.title || tool.name}</strong>
                  {tool.description && <p>{tool.description}</p>}
                  <SchemaPreview schema={tool.inputSchema} />
                </article>
              ))}
            </div>
          </section>

          <section className="mcp-capability-section">
            <div className="git-section-header">
              <Database size={14} />
              <div className="panel-title">Resources ({resources.length + resourceTemplates.length})</div>
            </div>
            <div className="mcp-tool-grid">
              {resources.map((resource) => (
                <article className="mcp-tool-card" key={resource.uri}>
                  <strong>{resource.title || resource.name}</strong>
                  {resource.description && <p>{resource.description}</p>}
                  <code>{resource.uri}</code>
                  {resource.mimeType && <span className="mcp-muted-line">{resource.mimeType}</span>}
                </article>
              ))}
              {resourceTemplates.map((resource) => (
                <article className="mcp-tool-card" key={resource.uriTemplate}>
                  <strong>{resource.title || resource.name}</strong>
                  {resource.description && <p>{resource.description}</p>}
                  <code>{resource.uriTemplate}</code>
                  {resource.mimeType && <span className="mcp-muted-line">{resource.mimeType}</span>}
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
