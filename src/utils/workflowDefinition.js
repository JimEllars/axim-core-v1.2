/**
 * Serialization helpers for workflow graph definitions.
 *
 * The visual builder persists `{ nodes, edges }` into
 * `workflows_ax2024.definition` (JSONB) and the edge DAG runner
 * (`supabase/functions/trigger-workflow`) reads the same shape back.
 *
 * Two rules drive everything here:
 *  1. React Flow decorates node objects with runtime-only fields (`selected`,
 *     `dragging`, `measured`, `internals`, ...). Those must never be persisted:
 *     they bloat the row and leak DOM state into the definition.
 *  2. Node `data.config` is user-authored action configuration (endpoints,
 *     recipients, policy IDs). It must be persisted verbatim. The generic
 *     `sanitizePayload()` PII scrubber must NOT be applied to a definition -
 *     it redacts keys containing `token`, `secret`, `email`, `name`, which
 *     silently destroys every action node's configuration.
 */

export const EMPTY_WORKFLOW_DEFINITION = Object.freeze({ nodes: [], edges: [] });

export const KNOWN_NODE_TYPES = Object.freeze(['trigger', 'action', 'condition']);

// React Flow runtime decoration. Not persisted; listed here so the removal is
// explicit rather than accidental (we copy a fixed allow-list below).
export const RUNTIME_NODE_FIELDS = Object.freeze([
  'selected',
  'dragging',
  'resizing',
  'measured',
  'width',
  'height',
  'positionAbsolute',
  'computedPosition',
  'handleBounds',
  'internals',
  'zIndex',
]);

function toFiniteNumber(value, fallback) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Strip React Flow runtime decoration from a single node while keeping the
 * authoring payload (`id`, `type`, `position`, `data`) byte-for-byte intact.
 */
export function serializeNode(node) {
  if (!isPlainObject(node) || node.id === undefined || node.id === null) {
    return null;
  }

  const clean = {
    id: String(node.id),
    type: KNOWN_NODE_TYPES.includes(node.type) ? node.type : 'action',
    position: {
      x: toFiniteNumber(node.position?.x, 0),
      y: toFiniteNumber(node.position?.y, 0),
    },
    data: isPlainObject(node.data) ? node.data : {},
  };

  return clean;
}

export function serializeEdge(edge) {
  if (!isPlainObject(edge)) return null;
  if (!edge.source || !edge.target) return null;

  const clean = {
    id: String(edge.id || `${edge.source}-${edge.target}`),
    source: String(edge.source),
    target: String(edge.target),
  };

  if (edge.sourceHandle) clean.sourceHandle = edge.sourceHandle;
  if (edge.targetHandle) clean.targetHandle = edge.targetHandle;
  if (edge.label !== undefined && edge.label !== null) clean.label = edge.label;

  return clean;
}

/**
 * Reduce a live React Flow graph to the persistable definition.
 */
export function serializeWorkflowDefinition(nodes, edges) {
  const safeNodes = Array.isArray(nodes) ? nodes.map(serializeNode).filter(Boolean) : [];
  const safeEdges = Array.isArray(edges) ? edges.map(serializeEdge).filter(Boolean) : [];

  const nodeIds = new Set(safeNodes.map((node) => node.id));
  // Drop edges that point at nodes which no longer exist - React Flow will
  // otherwise throw while rehydrating an orphaned edge.
  const connectedEdges = safeEdges.filter(
    (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target),
  );

  return { nodes: safeNodes, edges: connectedEdges };
}

/**
 * Coerce whatever is stored in `workflows_ax2024.definition` (object, JSON
 * string, null, legacy/unshaped payload) into a graph the builder can load.
 */
export function normalizeWorkflowDefinition(definition) {
  let candidate = definition;

  if (typeof candidate === 'string') {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return { ...EMPTY_WORKFLOW_DEFINITION };
    }
  }

  if (!isPlainObject(candidate)) {
    return { ...EMPTY_WORKFLOW_DEFINITION };
  }

  const nodes = Array.isArray(candidate.nodes) ? candidate.nodes : [];
  const edges = Array.isArray(candidate.edges) ? candidate.edges : [];

  return serializeWorkflowDefinition(nodes, edges);
}

/**
 * Load a workflow row (or a bare definition) into builder state.
 * Falls back to the supplied defaults when the stored graph is empty, so the
 * canvas never renders completely blank for a brand-new workflow.
 */
export function deserializeWorkflowDefinition(source, fallback = EMPTY_WORKFLOW_DEFINITION) {
  const raw = isPlainObject(source) && 'definition' in source ? source.definition : source;
  const { nodes, edges } = normalizeWorkflowDefinition(raw);

  if (nodes.length === 0 && edges.length === 0) {
    return normalizeWorkflowDefinition(fallback);
  }

  return { nodes, edges };
}

/**
 * True when the definition actually carries a runnable graph. The edge DAG
 * runner refuses to execute an empty definition, so callers use this to warn
 * the operator before a no-op run is dispatched.
 */
export function isRunnableDefinition(definition) {
  const { nodes } = normalizeWorkflowDefinition(definition);
  return nodes.some((node) => node.type === 'trigger' || node.type === 'action');
}
