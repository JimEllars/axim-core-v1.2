import { describe, it, expect } from 'vitest';
import worker from '../src/index.js';

describe('MCP Bridge Worker', () => {
  const env = { MCP_GATEWAY_SECRET: 'test-key' };

  it('rejects unauthorized requests', async () => {
    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 })
    });

    const response = await worker.fetch(request, env, {});
    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error.code).toBe(-32600);
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
    expect(toolNames).toContain('axim_ping');
    expect(toolNames).toContain('core_health_check');
    expect(toolNames).toContain('telemetry_lookup');
    expect(toolNames).toContain('hitl_queue_status');
  });

  it('accepts authorized requests via X-Axim-Gateway-Token header', async () => {
    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Axim-Gateway-Token': 'test-key'
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'initialize', id: 1 })
    });

    const response = await worker.fetch(request, env, {});
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.result.protocolVersion).toBe("2.0");
  });

  it('executes axim_ping tool', async () => {
    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-key'
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'axim_ping' }, id: 2 })
    });

    const response = await worker.fetch(request, env, {});
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.result.content[0].text).toContain('pong');
  });
});
