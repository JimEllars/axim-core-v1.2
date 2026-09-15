import { describe, it, expect, vi } from 'vitest';
import worker from '../src/index.js';

describe('MCP Bridge Worker', () => {
  const env = { AXIM_MCP_KEY: 'test-key' };

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
    expect(data.result.content[0].text).toContain('Bridge is healthy');
  });
});
