const MAX_TOOL_NAME_LENGTH = 64;

function safeSegment(value = '', fallback = 'mcp') {
  const segment = String(value || '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return segment || fallback;
}

function shortHash(value = '') {
  let hash = 2166136261;
  for (let index = 0; index < String(value).length; index += 1) {
    hash ^= String(value).charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).slice(0, 7);
}

function safeName(value = '') {
  return String(value || '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, MAX_TOOL_NAME_LENGTH);
}

export function namespacedMcpToolName(serverId, toolName) {
  const serverPart = safeSegment(serverId, 'server');
  const toolPart = safeSegment(toolName, 'tool');
  const baseName = `${serverPart}__${toolPart}`;
  if (baseName.length <= MAX_TOOL_NAME_LENGTH) {
    return baseName;
  }

  const suffix = `_${shortHash(`${serverId}__${toolName}`)}`;
  const separator = '__';
  const minimumToolLength = 8;
  let compactServer = serverPart;
  if (compactServer.length + separator.length + minimumToolLength + suffix.length > MAX_TOOL_NAME_LENGTH) {
    compactServer = compactServer.slice(0, MAX_TOOL_NAME_LENGTH - separator.length - minimumToolLength - suffix.length);
  }
  const toolBudget = Math.max(1, MAX_TOOL_NAME_LENGTH - compactServer.length - separator.length - suffix.length);
  return safeName(`${compactServer}${separator}${toolPart.slice(0, toolBudget)}${suffix}`);
}

export function parseNamespacedMcpToolName(name = '') {
  const index = String(name).indexOf('__');
  if (index === -1) return null;
  return {
    serverId: name.slice(0, index),
    toolName: name.slice(index + 2)
  };
}

function schemaForTool(tool = {}) {
  return tool.inputSchema && typeof tool.inputSchema === 'object'
    ? tool.inputSchema
    : { type: 'object', properties: {} };
}

export function formatForOpenAI(mcpTools = [], serverId) {
  return mcpTools.map((tool) => ({
    type: 'function',
    function: {
      name: namespacedMcpToolName(serverId, tool.name),
      description: tool.description || tool.title || `MCP tool ${tool.name}`,
      parameters: schemaForTool(tool)
    }
  }));
}

export function formatForAnthropic(mcpTools = [], serverId) {
  return mcpTools.map((tool) => ({
    name: namespacedMcpToolName(serverId, tool.name),
    description: tool.description || tool.title || `MCP tool ${tool.name}`,
    input_schema: schemaForTool(tool)
  }));
}

export function formatForGemini(mcpTools = [], serverId) {
  return mcpTools.map((tool) => ({
    name: namespacedMcpToolName(serverId, tool.name),
    description: tool.description || tool.title || `MCP tool ${tool.name}`,
    parameters: schemaForTool(tool)
  }));
}
