import { describe, it, expect } from 'vitest';
import worker from '../src/index.js';

describe('MCP Bridge Worker', () => {
  const env = { AXIM_GATEWAY_TOKEN: 'test-key' };

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

  it('accepts authorized requests and lists tools', async () => {
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
    expect(toolNames).toContain('core_health_check');
    expect(toolNames).toContain('telemetry_lookup');
    expect(toolNames).toContain('hitl_queue_status');
  });

  it('executes core_health_check tool', async () => {
    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-key'
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'core_health_check' }, id: 2 })
    });

    const response = await worker.fetch(request, env, {});
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.result.content[0].text).toContain('simulated');
  });

  it('executes telemetry_lookup tool', async () => {
    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-key'
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'telemetry_lookup' }, id: 3 })
    });

    const response = await worker.fetch(request, env, {});
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.result.content[0].text).toContain('simulated');
  });
});
