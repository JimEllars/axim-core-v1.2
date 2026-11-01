/**
 * Proving tests for the visual workflow builder persistence path.
 *
 * Three defects this covers, all previously masked because
 * src/components/admin/WorkflowBuilder.test.jsx mocks supabaseApiService
 * wholesale:
 *
 *  1. `supabaseApiService.saveWorkflow(...)` did not exist. WorkflowBuilder
 *     called it, so every "Save Workflow" click threw a TypeError and showed
 *     "Failed to save workflow." Nothing was ever written.
 *  2. `getWorkflows()` selected (name, description, slug, definition) but not
 *     `id`, so a loaded workflow could not be addressed for update and each save
 *     inserted a duplicate rather than updating.
 *  3. The builder ran the definition through sanitizePayload() before saving.
 *     That scrubber redacts any key containing token/secret/email/name, so every
 *     action node's configuration was silently blanked on save.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock('../logging', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import supabaseApiService, { buildWorkflowSlug } from '../supabaseApiService';
import { sanitizePayload } from '../../utils/sanitization';
import {
  deserializeWorkflowDefinition,
  isRunnableDefinition,
  normalizeWorkflowDefinition,
  serializeWorkflowDefinition,
} from '../../utils/workflowDefinition';

/**
 * Chainable Postgrest stub. `writeResult` is returned by the awaited tail of an
 * insert/update chain; `selectResult` by reads.
 */
function makeSupabase({ selectResult = { data: [], error: null }, writeResults = [] } = {}) {
  const calls = [];
  let writeIndex = 0;

  const client = {
    from(table) {
      const record = (op) => calls.push({ op, table });

      const tail = () => {
        const result = writeResults[writeIndex] ?? { data: { id: 'wf-1' }, error: null };
        writeIndex += 1;
        return result;
      };

      const builder = {
        select: vi.fn((columns) => {
          record('select');
          calls[calls.length - 1].columns = columns;
          return builder;
        }),
        insert: vi.fn((values) => {
          record('insert');
          calls[calls.length - 1].values = values;
          return builder;
        }),
        update: vi.fn((values) => {
          record('update');
          calls[calls.length - 1].values = values;
          return builder;
        }),
        eq: vi.fn((column, value) => {
          record('eq');
          calls[calls.length - 1].column = column;
          calls[calls.length - 1].value = value;
          return builder;
        }),
        order: vi.fn(() => {
          record('order');
          return builder;
        }),
        single: vi.fn(async () => tail()),
        then: (onFulfilled, onRejected) => {
          const result = calls[calls.length - 1].op === 'select' ? selectResult : tail();
          return Promise.resolve(result).then(onFulfilled, onRejected);
        },
      };

      return builder;
    },
  };

  return { client, calls };
}

const onlineConnectivity = { getIsOnline: () => true };
const offline = { queueRequest: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('workflow definition serialization', () => {
  const runtimeNodes = [
    {
      id: '1',
      type: 'trigger',
      position: { x: 250, y: 50 },
      data: { label: 'Webhook Received' },
      selected: true,
      width: 200,
      height: 80,
      measured: { width: 200, height: 80 },
      internals: { positionAbsolute: { x: 250, y: 50 } },
    },
    {
      id: '2',
      type: 'action',
      position: { x: 250, y: 200 },
      data: {
        label: 'Notify lead',
        actionType: 'email',
        config: { to: 'lead@example.com', subject: 'Welcome', api_token: 'tok_live_123' },
      },
    },
  ];

  it('drops React Flow runtime decoration but keeps the authoring payload', () => {
    const definition = serializeWorkflowDefinition(runtimeNodes, [
      { id: 'e1-2', source: '1', target: '2' },
    ]);

    expect(definition.nodes[0]).toEqual({
      id: '1',
      type: 'trigger',
      position: { x: 250, y: 50 },
      data: { label: 'Webhook Received' },
    });
    expect(definition.nodes[0]).not.toHaveProperty('selected');
    expect(definition.nodes[0]).not.toHaveProperty('measured');
  });

  it('preserves action configuration that the PII scrubber would destroy', () => {
    const definition = serializeWorkflowDefinition(runtimeNodes, []);

    // This is the exact payload the builder used to persist.
    const scrubbed = sanitizePayload({ nodes: runtimeNodes, edges: [] });

    expect(definition.nodes[1].data.config).toEqual({
      to: 'lead@example.com',
      subject: 'Welcome',
      api_token: 'tok_live_123',
    });

    // Documents why sanitizePayload() must not be used here.
    expect(scrubbed.nodes[1].data.config.api_token).toBe('[REDACTED]');
    expect(scrubbed.nodes[1].data.label).toBe('Notify lead');
  });

  it('drops orphaned edges so rehydration cannot throw', () => {
    const definition = serializeWorkflowDefinition(runtimeNodes, [
      { id: 'e1-2', source: '1', target: '2' },
      { id: 'e-orphan', source: '1', target: 'missing' },
    ]);

    expect(definition.edges).toHaveLength(1);
    expect(definition.edges[0].id).toBe('e1-2');
  });

  it('round-trips through storage', () => {
    const saved = serializeWorkflowDefinition(runtimeNodes, [
      { id: 'e1-2', source: '1', target: '2', sourceHandle: 'true' },
    ]);
    const loaded = deserializeWorkflowDefinition({ definition: saved });

    expect(loaded.nodes).toEqual(saved.nodes);
    expect(loaded.edges).toEqual(saved.edges);
  });

  it('normalizes a JSON string and rejects malformed payloads', () => {
    expect(normalizeWorkflowDefinition('{"nodes":[],"edges":[]}')).toEqual({ nodes: [], edges: [] });
    expect(normalizeWorkflowDefinition('{not json')).toEqual({ nodes: [], edges: [] });
    expect(normalizeWorkflowDefinition(null)).toEqual({ nodes: [], edges: [] });
  });

  it('falls back to the seed canvas when a workflow has no saved graph', () => {
    const fallback = {
      nodes: [{ id: '1', type: 'trigger', position: { x: 1, y: 2 }, data: { label: 'Seed' } }],
      edges: [],
    };

    const loaded = deserializeWorkflowDefinition(
      { id: 'wf-1', name: 'Empty', definition: { nodes: [], edges: [] } },
      fallback,
    );

    expect(loaded.nodes).toHaveLength(1);
    expect(loaded.nodes[0].data.label).toBe('Seed');
  });

  it('reports an empty definition as not runnable', () => {
    expect(isRunnableDefinition({ nodes: [], edges: [] })).toBe(false);
    expect(isRunnableDefinition(serializeWorkflowDefinition(runtimeNodes, []))).toBe(true);
  });
});

describe('supabaseApiService.saveWorkflow', () => {
  it('exists - the builder has always called it', () => {
    expect(typeof supabaseApiService.saveWorkflow).toBe('function');
  });

  it('inserts a new workflow with a derived slug and the full definition', async () => {
    const { client, calls } = makeSupabase({
      writeResults: [{ data: { id: 'wf-new', slug: 'lead-intake' }, error: null }],
    });
    supabaseApiService.initialize(client, onlineConnectivity, offline);

    const definition = {
      nodes: [{ id: '1', type: 'trigger', position: { x: 0, y: 0 }, data: { label: 'New Lead' } }],
      edges: [],
    };

    const saved = await supabaseApiService.saveWorkflow(
      { name: 'Lead Intake', description: 'Inbound leads', definition },
      'user-123',
    );

    const insert = calls.find((call) => call.op === 'insert');
    expect(insert.table).toBe('workflows_ax2024');
    expect(insert.values).toMatchObject({
      name: 'Lead Intake',
      slug: 'lead-intake',
      user_id: 'user-123',
      definition,
    });
    expect(saved).toMatchObject({ id: 'wf-new' });
  });

  it('updates in place when the workflow already has an id', async () => {
    const { client, calls } = makeSupabase({
      writeResults: [{ data: { id: 'wf-existing' }, error: null }],
    });
    supabaseApiService.initialize(client, onlineConnectivity, offline);

    await supabaseApiService.saveWorkflow(
      { id: 'wf-existing', name: 'Lead Intake', definition: { nodes: [], edges: [] } },
      'user-123',
    );

    expect(calls.some((call) => call.op === 'update')).toBe(true);
    expect(calls.some((call) => call.op === 'insert')).toBe(false);
    const eq = calls.find((call) => call.op === 'eq');
    expect(eq).toMatchObject({ column: 'id', value: 'wf-existing' });
    const update = calls.find((call) => call.op === 'update');
    expect(update.values).toHaveProperty('updated_at');
  });

  it('retries with a suffixed slug on a unique violation instead of overwriting', async () => {
    const { client, calls } = makeSupabase({
      writeResults: [
        { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } },
        { data: { id: 'wf-second', slug: 'lead-intake-ab12cd' }, error: null },
      ],
    });
    supabaseApiService.initialize(client, onlineConnectivity, offline);

    const saved = await supabaseApiService.saveWorkflow(
      { name: 'Lead Intake', definition: { nodes: [], edges: [] } },
      'user-123',
    );

    const inserts = calls.filter((call) => call.op === 'insert');
    expect(inserts).toHaveLength(2);
    expect(inserts[0].values.slug).toBe('lead-intake');
    expect(inserts[1].values.slug).toMatch(/^lead-intake-[0-9a-z-]{1,}$/);
    expect(saved.id).toBe('wf-second');
  });

  it('rejects a workflow without a name rather than writing a null row', async () => {
    const { client } = makeSupabase();
    supabaseApiService.initialize(client, onlineConnectivity, offline);

    await expect(
      supabaseApiService.saveWorkflow({ name: '   ', definition: { nodes: [], edges: [] } }, 'user-123'),
    ).rejects.toThrow(/name is required/);
  });

  it('always persists a well-formed definition, even from a legacy row', async () => {
    const { client, calls } = makeSupabase();
    supabaseApiService.initialize(client, onlineConnectivity, offline);

    await supabaseApiService.saveWorkflow(
      { name: 'Legacy Flow', definition: 'not-a-graph' },
      'user-123',
    );

    const insert = calls.find((call) => call.op === 'insert');
    expect(insert.values.definition).toEqual({ nodes: [], edges: [] });
  });
});

describe('buildWorkflowSlug', () => {
  it('produces a url-safe slug', () => {
    expect(buildWorkflowSlug('Lead Intake — EU/UK')).toBe('lead-intake-eu-uk');
  });

  it('never returns an empty string (slug is NOT NULL UNIQUE)', () => {
    expect(buildWorkflowSlug('   ')).toBe('workflow');
    expect(buildWorkflowSlug(undefined)).toBe('workflow');
  });
});
