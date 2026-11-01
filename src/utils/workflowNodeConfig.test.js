import { describe, it, expect } from 'vitest';
import {
  ACTION_TYPES,
  ACTION_TYPE_DEFINITIONS,
  DEFAULT_HTTP_TIMEOUT_MS,
  applyActionType,
  formatJsonField,
  formatListField,
  getActionFields,
  getActionTypeLabel,
  getDefaultActionConfig,
  isKnownActionType,
  parseJsonField,
  parseListField,
  validateActionConfig,
  validateActionField,
  validateWorkflowActions,
  ACTION_FIELD_TYPES,
} from './workflowNodeConfig';

const UUID = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

describe('workflowNodeConfig — action type catalogue', () => {
  it('covers every action type the edge runner supports', () => {
    // Mirrors SUPPORTED_ACTION_TYPES in
    // supabase/functions/_shared/workflowActions.ts. If the runner gains a
    // type and this list does not, the builder silently cannot author it.
    expect(ACTION_TYPES).toEqual([
      'api_call',
      'email',
      'robot_sim_run',
      'robot_policy_gate',
      'robot_ota_deploy',
    ]);
  });

  it('recognises known types only', () => {
    expect(isKnownActionType('api_call')).toBe(true);
    expect(isKnownActionType('webhook')).toBe(false);
    expect(isKnownActionType('toString')).toBe(false); // prototype keys are not action types
    expect(isKnownActionType(undefined)).toBe(false);
  });

  it('labels known and unknown action types', () => {
    expect(getActionTypeLabel('robot_sim_run')).toBe('Robot Simulation Run');
    expect(getActionTypeLabel('mystery')).toBe('mystery');
    expect(getActionTypeLabel(undefined)).toBe('Untyped action');
  });

  it('returns no fields for an unknown action type', () => {
    expect(getActionFields('mystery')).toEqual([]);
  });

  it('declares the config keys the runner reads', () => {
    const keysFor = (type) => getActionFields(type).map((field) => field.key);
    expect(keysFor('api_call')).toEqual(['url', 'method', 'timeout_ms', 'headers', 'body']);
    expect(keysFor('email')).toEqual(['to', 'subject', 'from', 'body', 'text']);
    expect(keysFor('robot_sim_run')).toEqual(['project_id', 'scene_type', 'duration_sec', 'params']);
    expect(keysFor('robot_policy_gate')).toEqual(['project_id', 'min_benchmark_score']);
    expect(keysFor('robot_ota_deploy')).toEqual(['project_id', 'version', 'weights_hash', 'node_ids']);
  });

  it('marks the fields the runner requires with requireString/positive-number checks', () => {
    const requiredKeys = (type) => getActionFields(type).filter((field) => field.required).map((f) => f.key);
    expect(requiredKeys('api_call')).toEqual(['url']);
    expect(requiredKeys('email')).toEqual(['to']);
    expect(requiredKeys('robot_sim_run')).toEqual(['project_id', 'duration_sec']);
    expect(requiredKeys('robot_policy_gate')).toEqual(['project_id']);
    expect(requiredKeys('robot_ota_deploy')).toEqual(['project_id', 'version']);
  });
});

describe('workflowNodeConfig — defaults', () => {
  it('seeds only fields that declare a default', () => {
    expect(getDefaultActionConfig('api_call')).toEqual({
      method: 'POST',
      timeout_ms: DEFAULT_HTTP_TIMEOUT_MS,
    });
    expect(getDefaultActionConfig('robot_policy_gate')).toEqual({ min_benchmark_score: 0.8 });
    expect(getDefaultActionConfig('email')).toEqual({});
    expect(getDefaultActionConfig('mystery')).toEqual({});
  });
});

describe('workflowNodeConfig — field value helpers', () => {
  it('parses JSON text and reports syntax errors', () => {
    expect(parseJsonField('')).toEqual({ ok: true, value: undefined, error: null });
    expect(parseJsonField('  {"a":1}  ')).toEqual({ ok: true, value: { a: 1 }, error: null });
    const broken = parseJsonField('{"a":');
    expect(broken.ok).toBe(false);
    expect(typeof broken.error).toBe('string');
  });

  it('formats JSON for the editor and tolerates junk', () => {
    expect(formatJsonField({ a: 1 })).toBe('{\n  "a": 1\n}');
    expect(formatJsonField(undefined)).toBe('');
    const circular = {};
    circular.self = circular;
    expect(formatJsonField(circular)).toBe('');
  });

  it('parses and formats list fields', () => {
    expect(parseListField('a@x.com, b@x.com')).toEqual(['a@x.com', 'b@x.com']);
    expect(parseListField('  ,  ')).toEqual([]);
    expect(parseListField([' one ', 'two'])).toEqual(['one', 'two']);
    expect(parseListField(null)).toEqual([]);
    expect(formatListField(['a', 'b'])).toBe('a, b');
    expect(formatListField('solo@x.com')).toBe('solo@x.com');
    expect(formatListField(undefined)).toBe('');
  });
});

describe('workflowNodeConfig — field validation', () => {
  const urlField = ACTION_TYPE_DEFINITIONS.api_call.fields[0];

  it('requires a non-empty value for required fields', () => {
    expect(validateActionField(urlField, '')).toBe('Endpoint URL is required.');
    expect(validateActionField(urlField, '   ')).toBe('Endpoint URL is required.');
    expect(validateActionField(urlField, undefined)).toBe('Endpoint URL is required.');
  });

  it('lets optional fields stay empty', () => {
    const headersField = ACTION_TYPE_DEFINITIONS.api_call.fields[3];
    expect(validateActionField(headersField, undefined)).toBeNull();
    expect(validateActionField(headersField, '')).toBeNull();
  });

  it('rejects relative, malformed and non-http URLs', () => {
    expect(validateActionField(urlField, 'https://hooks.example.com/x')).toBeNull();
    expect(validateActionField(urlField, 'http://localhost:8000/x')).toBeNull();
    expect(validateActionField(urlField, '/relative/path')).toBe(
      'Endpoint URL is not a valid absolute URL.',
    );
    expect(validateActionField(urlField, 'not a url')).toBe(
      'Endpoint URL is not a valid absolute URL.',
    );
    expect(validateActionField(urlField, 'ftp://example.com/file')).toBe(
      'Endpoint URL must use http or https.',
    );
  });

  it('enforces numeric range bounds', () => {
    const timeoutField = ACTION_TYPE_DEFINITIONS.api_call.fields[2];
    expect(validateActionField(timeoutField, 5000)).toBeNull();
    expect(validateActionField(timeoutField, '5000')).toBeNull();
    expect(validateActionField(timeoutField, 'abc')).toBe('Timeout (ms) must be a number.');
    expect(validateActionField(timeoutField, 0)).toBe('Timeout (ms) must be at least 1.');
    expect(validateActionField(timeoutField, 120000)).toBe('Timeout (ms) must be at most 60000.');
  });

  it('rejects methods outside the runner-safe set', () => {
    const methodField = ACTION_TYPE_DEFINITIONS.api_call.fields[1];
    expect(validateActionField(methodField, 'POST')).toBeNull();
    expect(validateActionField(methodField, 'TRACE')).toBe(
      'HTTP Method must be one of POST, GET, PUT, PATCH, DELETE, HEAD.',
    );
  });

  it('requires UUIDs where the runner inserts into a uuid column', () => {
    const projectField = ACTION_TYPE_DEFINITIONS.robot_sim_run.fields[0];
    expect(validateActionField(projectField, UUID)).toBeNull();
    expect(validateActionField(projectField, 'project-1')).toBe(
      'Robotics Project ID must be a UUID.',
    );

    const nodesField = ACTION_TYPE_DEFINITIONS.robot_ota_deploy.fields[3];
    // node_ids is always written as an array (see splitMultiple) because the
    // runner drops a bare string, and it is inserted into a uuid column.
    expect(nodesField.splitMultiple).toBe(true);
    expect(validateActionField(nodesField, `${UUID}, ${UUID}`)).toBeNull();
    expect(validateActionField(nodesField, 'not-a-uuid')).toBe(
      'Target Fleet Nodes must contain valid UUIDs.',
    );
  });

  it('rejects a JSON field that was left as an unparsed string', () => {
    const headersField = ACTION_TYPE_DEFINITIONS.api_call.fields[3];
    expect(validateActionField(headersField, { Authorization: 'Bearer x' })).toBeNull();
    expect(validateActionField(headersField, '{"a":1}')).toBe(
      'Headers must be JSON, not a string.',
    );
  });
});

describe('workflowNodeConfig — validateActionConfig', () => {
  it('flags a missing action type the way the runner does', () => {
    const { valid, errors } = validateActionConfig(null, {});
    expect(valid).toBe(false);
    expect(errors._type).toMatch(/runner rejects untyped action nodes/);
  });

  it('flags an unsupported action type', () => {
    const { errors } = validateActionConfig('webhook', {});
    expect(errors._type).toBe('Unsupported action type "webhook".');
  });

  it('accepts a complete api_call', () => {
    const result = validateActionConfig('api_call', {
      url: 'https://hooks.example.com/lead',
      method: 'POST',
      timeout_ms: 5000,
      headers: { 'X-Source': 'axim' },
      body: { lead_id: 'abc' },
    });
    expect(result).toEqual({ valid: true, errors: {} });
  });

  it('reports every missing required field, not just the first', () => {
    const { valid, errors } = validateActionConfig('robot_sim_run', { project_id: '' });
    expect(valid).toBe(false);
    expect(Object.keys(errors).sort()).toEqual(['duration_sec', 'project_id']);
  });

  it('tolerates a null config object', () => {
    expect(validateActionConfig('email', null).errors.to).toBe('Recipients is required.');
  });

  it('accepts a single recipient or an array', () => {
    expect(validateActionConfig('email', { to: 'ops@example.com' }).valid).toBe(true);
    expect(validateActionConfig('email', { to: ['ops@example.com', 'a@b.co'] }).valid).toBe(true);
    expect(validateActionConfig('email', { to: [] }).errors.to).toBe('Recipients is required.');
  });

  it('accepts a positive simulation duration only', () => {
    const base = { project_id: UUID };
    expect(validateActionConfig('robot_sim_run', { ...base, duration_sec: 60 }).valid).toBe(true);
    expect(validateActionConfig('robot_sim_run', { ...base, duration_sec: 0 }).errors.duration_sec)
      .toBe('Duration (seconds) must be at least 1.');
    expect(validateActionConfig('robot_sim_run', { ...base }).errors.duration_sec)
      .toBe('Duration (seconds) is required.');
  });

  it('bounds the policy gate threshold to 0..1', () => {
    expect(validateActionConfig('robot_policy_gate', { project_id: UUID, min_benchmark_score: 0.9 }).valid).toBe(true);
    expect(
      validateActionConfig('robot_policy_gate', { project_id: UUID, min_benchmark_score: 1.4 })
        .errors.min_benchmark_score,
    ).toBe('Minimum Benchmark Score must be at most 1.');
  });

  it('requires a firmware version for OTA deploys', () => {
    expect(validateActionConfig('robot_ota_deploy', { project_id: UUID }).errors.version)
      .toBe('Firmware Version is required.');
    expect(validateActionConfig('robot_ota_deploy', { project_id: UUID, version: '1.4.2' }).valid)
      .toBe(true);
  });
});

describe('workflowNodeConfig — validateWorkflowActions', () => {
  const validApiNode = {
    id: 'n1',
    type: 'action',
    data: {
      label: 'Notify CRM',
      actionType: 'api_call',
      config: { url: 'https://hooks.example.com/crm', method: 'POST' },
    },
  };

  it('ignores non-action nodes', () => {
    const result = validateWorkflowActions({
      nodes: [
        { id: 't1', type: 'trigger', data: { label: 'Webhook' } },
        { id: 'c1', type: 'condition', data: { label: 'Always' } },
      ],
      edges: [],
    });
    expect(result).toEqual({ valid: true, issues: [] });
  });

  it('passes a fully configured action graph', () => {
    expect(validateWorkflowActions({ nodes: [validApiNode], edges: [] }).valid).toBe(true);
  });

  it('names the offending node in the issue message', () => {
    const result = validateWorkflowActions({
      nodes: [{ id: 'n9', type: 'action', data: { label: 'Format Payload', actionType: 'api_call', config: {} } }],
      edges: [],
    });
    expect(result.valid).toBe(false);
    expect(result.issues[0]).toMatchObject({
      nodeId: 'n9',
      label: 'Format Payload',
      message: '"Format Payload": Endpoint URL is required.',
    });
  });

  it('falls back to the node id when a node has no label', () => {
    const result = validateWorkflowActions({
      nodes: [{ id: 'node_42', type: 'action', data: {} }],
      edges: [],
    });
    expect(result.issues[0].label).toBe('node_42');
    expect(result.issues[0].actionType).toBeNull();
  });

  it('collects one issue per broken node', () => {
    const result = validateWorkflowActions({
      nodes: [
        validApiNode,
        { id: 'n2', type: 'action', data: { label: 'A', actionType: 'email', config: {} } },
        { id: 'n3', type: 'action', data: { label: 'B', actionType: 'robot_sim_run', config: {} } },
      ],
      edges: [],
    });
    expect(result.issues.map((issue) => issue.nodeId)).toEqual(['n2', 'n3']);
  });

  it('handles a missing or malformed definition', () => {
    expect(validateWorkflowActions(undefined).valid).toBe(true);
    expect(validateWorkflowActions({ nodes: 'nope' }).valid).toBe(true);
    expect(validateWorkflowActions({}).valid).toBe(true);
  });
});

describe('workflowNodeConfig — applyActionType', () => {
  it('seeds defaults for the new type', () => {
    const next = applyActionType({ label: 'New Action', actionType: 'email', config: {} }, 'api_call');
    expect(next.actionType).toBe('api_call');
    expect(next.config).toEqual({ method: 'POST', timeout_ms: DEFAULT_HTTP_TIMEOUT_MS });
  });

  it('carries over config keys the new type also declares', () => {
    const next = applyActionType(
      { actionType: 'robot_sim_run', config: { project_id: UUID, duration_sec: 30 } },
      'robot_policy_gate',
    );
    expect(next.config).toEqual({ project_id: UUID, min_benchmark_score: 0.8 });
  });

  it('drops config the new type will never read', () => {
    const next = applyActionType(
      { actionType: 'api_call', config: { url: 'https://x.example.com', method: 'GET' } },
      'email',
    );
    expect(next.config).toEqual({});
  });

  it('renames an unnamed node to the action label but keeps a custom name', () => {
    expect(applyActionType({ label: 'New Action' }, 'email').label).toBe('Email');
    expect(applyActionType({}, 'email').label).toBe('Email');
    expect(applyActionType({ label: 'Notify CRM' }, 'email').label).toBe('Notify CRM');
  });

  it('tolerates malformed node data', () => {
    expect(applyActionType(null, 'api_call')).toMatchObject({ actionType: 'api_call' });
    expect(applyActionType({ config: null }, 'api_call').config).toEqual({
      method: 'POST',
      timeout_ms: DEFAULT_HTTP_TIMEOUT_MS,
    });
  });
});

describe('workflowNodeConfig — field descriptor integrity', () => {
  it('gives every field a unique key, a label and a known type', () => {
    const knownTypes = Object.values(ACTION_FIELD_TYPES);
    for (const [actionType, definition] of Object.entries(ACTION_TYPE_DEFINITIONS)) {
      const keys = definition.fields.map((field) => field.key);
      expect(new Set(keys).size, `${actionType} has duplicate field keys`).toBe(keys.length);
      for (const field of definition.fields) {
        expect(field.label, `${actionType}.${field.key} needs a label`).toBeTruthy();
        expect(knownTypes, `${actionType}.${field.key} has an unknown type`).toContain(field.type);
        if (field.type === ACTION_FIELD_TYPES.SELECT) {
          expect(Array.isArray(field.options)).toBe(true);
          expect(field.options.length).toBeGreaterThan(0);
        }
      }
    }
  });
});
