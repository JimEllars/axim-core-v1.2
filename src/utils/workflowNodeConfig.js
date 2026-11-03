/**
 * Typed action-node configuration contract.
 *
 * Single source of truth for *what an action node needs to carry* before the
 * edge DAG runner (`supabase/functions/_shared/workflowActions.ts`) can execute
 * it. Every rule here mirrors a `requireString(...)` / `Number.isFinite(...)`
 * check in that runner, so the builder cannot author a node the runner will
 * reject for a reason the operator could not see.
 *
 * Two hard rules:
 *  1. No React, no IO. These are pure functions so both the inspector UI and
 *     the pre-dispatch validation gate can use them, and so they are testable
 *     without a DOM.
 *  2. `data.actionType` is authoritative. The runner resolves
 *     `data.actionType` first and only falls back to `data.config.type` /
 *     `data.type` for hand-authored definitions. The builder always writes
 *     `data.actionType`.
 *
 * Why the empty-config node is flagged rather than silently defaulted: an
 * `api_call` with no URL throws in the runner, which halts the DAG and marks
 * the run failed. Surfacing that at author time is cheaper than discovering it
 * from a dead run.
 */

/** Matches DEFAULT_HTTP_TIMEOUT_MS in supabase/functions/_shared/workflowActions.ts */
export const DEFAULT_HTTP_TIMEOUT_MS = 10000;

export const ACTION_FIELD_TYPES = Object.freeze({
  TEXT: 'text',
  URL: 'url',
  NUMBER: 'number',
  SELECT: 'select',
  TEXTAREA: 'textarea',
  JSON: 'json',
  LIST: 'list',
});

const HTTP_METHODS = Object.freeze(['POST', 'GET', 'PUT', 'PATCH', 'DELETE', 'HEAD']);

// RFC 4122 shape. project_id / node_ids are inserted directly into uuid columns
// by the runner, so a typo surfaces as a Postgres 22P02 error mid-DAG instead
// of as a form error.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value.trim());
}

export const ACTION_TYPE_DEFINITIONS = Object.freeze({
  api_call: {
    label: 'API Call',
    summary: 'Dispatch an outbound HTTP request into an external system.',
    fields: Object.freeze([
      {
        key: 'url',
        label: 'Endpoint URL',
        type: ACTION_FIELD_TYPES.URL,
        required: true,
        placeholder: 'https://hooks.example.com/lead',
        help: 'Public hosts only — the runner refuses loopback, private and link-local targets.',
      },
      {
        key: 'method',
        label: 'HTTP Method',
        type: ACTION_FIELD_TYPES.SELECT,
        options: HTTP_METHODS,
        defaultValue: 'POST',
      },
      {
        key: 'timeout_ms',
        label: 'Timeout (ms)',
        type: ACTION_FIELD_TYPES.NUMBER,
        min: 1,
        max: 60000,
        defaultValue: DEFAULT_HTTP_TIMEOUT_MS,
        help: 'Aborts the request after this many milliseconds.',
      },
      {
        key: 'headers',
        label: 'Headers',
        type: ACTION_FIELD_TYPES.JSON,
        placeholder: '{ "Authorization": "Bearer …" }',
      },
      {
        key: 'body',
        label: 'Request Body',
        type: ACTION_FIELD_TYPES.JSON,
        placeholder: '{ "lead_id": "{{lead.id}}" }',
        help: 'Sent as JSON. Ignored for GET and HEAD.',
      },
    ]),
  },

  email: {
    label: 'Email',
    summary: 'Send a transactional email through the configured dispatcher.',
    fields: Object.freeze([
      {
        key: 'to',
        label: 'Recipients',
        type: ACTION_FIELD_TYPES.LIST,
        required: true,
        placeholder: 'operator@example.com, ops@example.com',
        help: 'Comma-separated. One address is stored as a string, several as an array.',
      },
      {
        key: 'subject',
        label: 'Subject',
        type: ACTION_FIELD_TYPES.TEXT,
        placeholder: 'New lead assigned',
      },
      {
        key: 'from',
        label: 'From',
        type: ACTION_FIELD_TYPES.TEXT,
        placeholder: 'missioncontrol@your-domain.com',
        help: 'Defaults to the configured sender domain when left blank.',
      },
      {
        key: 'body',
        label: 'HTML Body',
        type: ACTION_FIELD_TYPES.TEXTAREA,
        placeholder: '<p>Hello…</p>',
      },
      {
        key: 'text',
        label: 'Plain-Text Body',
        type: ACTION_FIELD_TYPES.TEXTAREA,
        placeholder: 'Hello…',
      },
    ]),
  },

  robot_sim_run: {
    label: 'Robot Simulation Run',
    summary: 'Queue a headless simulation run against a robotics project.',
    fields: Object.freeze([
      {
        key: 'project_id',
        label: 'Robotics Project ID',
        type: ACTION_FIELD_TYPES.TEXT,
        required: true,
        uuid: true,
        placeholder: '00000000-0000-0000-0000-000000000000',
      },
      {
        key: 'scene_type',
        label: 'Scene',
        type: ACTION_FIELD_TYPES.TEXT,
        placeholder: 'default',
        help: 'Scene preset registered for the project. Defaults to "default".',
      },
      {
        key: 'duration_sec',
        label: 'Duration (seconds)',
        type: ACTION_FIELD_TYPES.NUMBER,
        required: true,
        min: 1,
        placeholder: '60',
      },
      {
        key: 'params',
        label: 'Run Parameters',
        type: ACTION_FIELD_TYPES.JSON,
        placeholder: '{ "difficulty": "hard" }',
      },
    ]),
  },

  robot_policy_gate: {
    label: 'Robot Policy Gate',
    summary: 'Blocks the DAG unless the newest policy clears a benchmark threshold.',
    fields: Object.freeze([
      {
        key: 'project_id',
        label: 'Robotics Project ID',
        type: ACTION_FIELD_TYPES.TEXT,
        required: true,
        uuid: true,
        placeholder: '00000000-0000-0000-0000-000000000000',
      },
      {
        key: 'min_benchmark_score',
        label: 'Minimum Benchmark Score',
        type: ACTION_FIELD_TYPES.NUMBER,
        min: 0,
        max: 1,
        defaultValue: 0.8,
        placeholder: '0.8',
        help: '0–1. The runner defaults to 0.8 when left blank.',
      },
    ]),
  },

  robot_ota_deploy: {
    label: 'Robot OTA Deploy',
    summary: 'Register a firmware package and move fleet nodes onto it.',
    fields: Object.freeze([
      {
        key: 'project_id',
        label: 'Robotics Project ID',
        type: ACTION_FIELD_TYPES.TEXT,
        required: true,
        uuid: true,
        placeholder: '00000000-0000-0000-0000-000000000000',
      },
      {
        key: 'version',
        label: 'Firmware Version',
        type: ACTION_FIELD_TYPES.TEXT,
        required: true,
        placeholder: '1.4.2',
      },
      {
        key: 'weights_hash',
        label: 'Weights Hash',
        type: ACTION_FIELD_TYPES.TEXT,
        placeholder: 'sha256:…',
        help: 'Recorded on the policy registry row. Defaults to the workflow run id.',
      },
      {
        key: 'node_ids',
        label: 'Target Fleet Nodes',
        type: ACTION_FIELD_TYPES.LIST,
        uuid: true,
        // Always stored as an array: the runner reads `node_ids` with
        // `Array.isArray(...) ? map(String) : []`, so a single id written as a
        // bare string would be dropped without an error.
        splitMultiple: true,
        placeholder: 'uuid, uuid',
        help: 'Leave blank to register the package without pushing it to any node.',
      },
    ]),
  },
});

export const ACTION_TYPES = Object.freeze(Object.keys(ACTION_TYPE_DEFINITIONS));

export function isKnownActionType(actionType) {
  return typeof actionType === 'string' && Object.prototype.hasOwnProperty.call(
    ACTION_TYPE_DEFINITIONS,
    actionType,
  );
}

/** Field descriptors for an action type. Unknown types yield an empty list. */
export function getActionFields(actionType) {
  const definition = ACTION_TYPE_DEFINITIONS[actionType];
  return definition ? definition.fields : [];
}

export function getActionTypeLabel(actionType) {
  return ACTION_TYPE_DEFINITIONS[actionType]?.label || actionType || 'Untyped action';
}

/**
 * Seed config for a freshly-selected action type: every field that declares a
 * `defaultValue` gets it, everything else stays absent so the inspector shows
 * placeholders rather than fake values.
 */
export function getDefaultActionConfig(actionType) {
  const config = {};
  for (const field of getActionFields(actionType)) {
    if (field.defaultValue !== undefined) {
      config[field.key] = field.defaultValue;
    }
  }
  return config;
}

// --- field value helpers ----------------------------------------------------

export function parseJsonField(text) {
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (trimmed === '') {
    return { ok: true, value: undefined, error: null };
  }
  try {
    return { ok: true, value: JSON.parse(trimmed), error: null };
  } catch (error) {
    return { ok: false, value: undefined, error: error.message };
  }
}

export function formatJsonField(value) {
  if (value === undefined || value === null || value === '') return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
}

export function parseListField(text) {
  if (Array.isArray(text)) {
    return text.map((entry) => String(entry).trim()).filter(Boolean);
  }
  return String(text ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function formatListField(value) {
  if (Array.isArray(value)) return value.join(', ');
  if (value === undefined || value === null) return '';
  return String(value);
}

// --- validation -------------------------------------------------------------

function isEmptyValue(value) {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/**
 * Validate one field against its descriptor. Returns an error string or null.
 * Messages are user-facing: they name the field the runner would complain about.
 */
export function validateActionField(field, value) {
  if (isEmptyValue(value)) {
    return field.required ? `${field.label} is required.` : null;
  }

  switch (field.type) {
    case ACTION_FIELD_TYPES.URL: {
      if (typeof value !== 'string') return `${field.label} must be a URL string.`;
      let parsed;
      try {
        parsed = new URL(value.trim());
      } catch {
        return `${field.label} is not a valid absolute URL.`;
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return `${field.label} must use http or https.`;
      }
      return null;
    }

    case ACTION_FIELD_TYPES.NUMBER: {
      const numeric = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(numeric)) return `${field.label} must be a number.`;
      if (field.min !== undefined && numeric < field.min) {
        return `${field.label} must be at least ${field.min}.`;
      }
      if (field.max !== undefined && numeric > field.max) {
        return `${field.label} must be at most ${field.max}.`;
      }
      return null;
    }

    case ACTION_FIELD_TYPES.SELECT:
      return field.options.includes(value) ? null : `${field.label} must be one of ${field.options.join(', ')}.`;

    case ACTION_FIELD_TYPES.LIST: {
      const entries = parseListField(value);
      if (field.uuid && entries.some((entry) => !isUuid(entry))) {
        return `${field.label} must contain valid UUIDs.`;
      }
      return null;
    }

    case ACTION_FIELD_TYPES.JSON:
      return typeof value === 'string' ? `${field.label} must be JSON, not a string.` : null;

    case ACTION_FIELD_TYPES.TEXT:
    case ACTION_FIELD_TYPES.TEXTAREA:
    default:
      if (field.uuid && !isUuid(String(value))) return `${field.label} must be a UUID.`;
      return null;
  }
}

/**
 * Validate a whole action node config.
 * Returns `{ valid, errors }` where `errors` is keyed by field name, plus a
 * `_type` key when the node has no usable action type (the runner's own
 * "no recognisable action type" failure).
 */
export function validateActionConfig(actionType, config = {}) {
  if (!isKnownActionType(actionType)) {
    return {
      valid: false,
      errors: {
        _type: actionType
          ? `Unsupported action type "${actionType}".`
          : 'Select an action type — the runner rejects untyped action nodes.',
      },
    };
  }

  const safeConfig = config && typeof config === 'object' && !Array.isArray(config) ? config : {};
  const errors = {};

  for (const field of getActionFields(actionType)) {
    const error = validateActionField(field, safeConfig[field.key]);
    if (error) errors[field.key] = error;
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * Pre-dispatch gate for a whole graph.
 *
 * `trigger` and `condition` nodes are skipped: the runner only executes
 * `action` nodes and evaluates conditions inline, so they carry no action
 * config. Everything else the builder can emit is checked.
 */
export function validateWorkflowActions(definition) {
  const nodes = Array.isArray(definition?.nodes) ? definition.nodes : [];
  const issues = [];

  for (const node of nodes) {
    if (!node || node.type !== 'action') continue;

    const data = node.data && typeof node.data === 'object' ? node.data : {};
    const label = typeof data.label === 'string' && data.label.trim() !== ''
      ? data.label.trim()
      : String(node.id);

    const { valid, errors } = validateActionConfig(data.actionType, data.config);
    if (valid) continue;

    issues.push({
      nodeId: String(node.id),
      label,
      actionType: data.actionType ?? null,
      errors,
      // First error, prefixed with the node it came from - what the toast shows.
      message: `"${label}": ${Object.values(errors)[0]}`,
    });
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Apply an action-type change to a node's data.
 *
 * Config keys shared with the new schema are carried over (switching between
 * the two robotics node types keeps `project_id`), keys that do not exist on
 * the new type are dropped, and defaults for the new type are seeded. This
 * keeps a definition free of config the runner will never read.
 */
export function applyActionType(nodeData, actionType) {
  const data = nodeData && typeof nodeData === 'object' ? nodeData : {};
  const previousConfig = data.config && typeof data.config === 'object' ? data.config : {};
  const fields = getActionFields(actionType);
  const allowedKeys = new Set(fields.map((field) => field.key));

  const nextConfig = getDefaultActionConfig(actionType);
  for (const [key, value] of Object.entries(previousConfig)) {
    if (!allowedKeys.has(key)) continue;
    if (value === undefined || value === null) continue;
    nextConfig[key] = value;
  }

  return {
    ...data,
    actionType,
    config: nextConfig,
    // Keep the visible card label in step with the chosen action until the
    // operator names the node themselves.
    label: data.label && data.label !== 'New Action' ? data.label : getActionTypeLabel(actionType),
  };
}
