import { describe, it, expect } from 'vitest';
import worker from '../src/index.js';

describe('MCP Bridge Worker', () => {
  const env = { AXIM_INTERNAL_KEY: 'test-key' };

  it('rejects unauthorized requests', async () => {
    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 })
    });

    const response = await worker.fetch(request, env, {});
    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error.code).toBe(-32001);
  });

  it('does not permit a fallback test credential when the gateway secret is absent', async () => {
    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-key'
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 })
    });

    const response = await worker.fetch(request, {}, {});

    expect(response.status).toBe(401);
  });

  it('accepts authorized requests via Bearer token and lists tools', async () => {
    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-key'
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 })
    });

    const response = await worker.fetch(request, env, {});
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.result.tools).toBeDefined();
    expect(data.result.tools.length).toBeGreaterThan(0);
    const toolNames = data.result.tools.map(t => t.name);
    expect(toolNames).toContain('axim_get_telemetry');
    expect(toolNames).toContain('axim_list_nodes');
    expect(toolNames).toContain('axim_dispatch_task');
  });

  it('accepts authorized requests via Signature header', async () => {
    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Axim-Signature': 'test-key'
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'initialize', id: 1 })
    });

    const response = await worker.fetch(request, env, {});
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.result.protocolVersion).toBe("2.0");
  });

  it('executes axim_get_telemetry tool', async () => {
    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-key'
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'axim_get_telemetry' }, id: 2 })
    });

    const response = await worker.fetch(request, env, {});
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.result.content[0].text).toContain('simulated');
  });

  it('executes axim_list_nodes tool', async () => {
    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-key'
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'axim_list_nodes' }, id: 3 })
    });

    const response = await worker.fetch(request, env, {});
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.result.content[0].text).toContain('simulated');
  });

  it('executes axim_dispatch_task tool', async () => {
    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-key'
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'axim_dispatch_task', arguments: { task_type: 'test', payload: {} } }, id: 4 })
    });

    const response = await worker.fetch(request, env, {});
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.result.content[0].text).toContain('Simulated dispatch success');
  });
});
