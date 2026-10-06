import { describe, it, expect, vi } from 'vitest';
import worker from '../src/index.js';

describe('MCP Bridge Worker', () => {
  const env = {
    CF_ACCESS_CLIENT_ID: 'test-client-id',
    CF_ACCESS_CLIENT_SECRET: 'test-client-secret',
    PASSPORT_VERIFY_URL: 'http://localhost/verify',
    ENVIRONMENT: 'production',
    LAB_STATE: {
      get: async (key) => key === 'OPERATOR_DOCK_SUSPENDED' ? 'false' : null
    }
  };

  const getAuthorizedHeaders = () => {
    return {
      'Content-Type': 'application/json',
      'CF-Access-Client-Id': 'test-client-id',
      'CF-Access-Client-Secret': 'test-client-secret',
      'Authorization': 'Bearer valid-token'
    };
  };

  // Mock global fetch
  global.fetch = vi.fn().mockImplementation(async (url, options) => {
    if (url === 'http://localhost/verify') {
      const auth = options.headers['Authorization'];
      if (auth === 'Bearer valid-token') {
        return {
          ok: true,
          json: async () => ({ session: { active: true, email: 'james.ellars@axim.us.com' } })
        };
      }
      if (auth === 'Bearer invalid-token') {
        return {
          ok: true,
          json: async () => ({ session: { active: false } })
        };
      }
      if (auth === 'Bearer unauthorized-email-token') {
        return {
          ok: true,
          json: async () => ({ session: { active: true, email: 'hacker@example.com' } })
        };
      }
      return { ok: false, status: 403 };
    }

    // Mock Supabase endpoints
    if (url.includes('/rest/v1/telemetry_events')) {
       return { ok: true, json: async () => ([{ id: 1, message: "my secret is sk-12345678901234567890", severity: "ERROR" }]) };
    }

    if (url.includes('/rest/v1/hitl_audit_logs')) {
       return { ok: true, json: async () => ([]), headers: { get: () => "0/1" } };
    }

    return { ok: true, json: async () => ({}) };
  });

  it('rejects requests with missing CF Access headers', async () => {
    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer valid-token' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 })
    });

    const response = await worker.fetch(request, env, {});
    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('Cloudflare Access');
  });

  it('rejects requests with missing Bearer token', async () => {
    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Access-Client-Id': 'test-client-id',
        'CF-Access-Client-Secret': 'test-client-secret'
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 })
    });

    const response = await worker.fetch(request, env, {});
    expect(response.status).toBe(401);
  });

  it('rejects unauthenticated Passport sessions', async () => {
    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Access-Client-Id': 'test-client-id',
        'CF-Access-Client-Secret': 'test-client-secret',
        'Authorization': 'Bearer invalid-token'
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 })
    });

    const response = await worker.fetch(request, env, {});
    expect(response.status).toBe(403);
  });

  it('rejects unauthorized emails', async () => {
    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Access-Client-Id': 'test-client-id',
        'CF-Access-Client-Secret': 'test-client-secret',
        'Authorization': 'Bearer unauthorized-email-token'
      },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 })
    });

    const response = await worker.fetch(request, env, {});
    expect(response.status).toBe(403);
  });

  it('accepts authorized operator requests (james.ellars@axim.us.com)', async () => {
    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: getAuthorizedHeaders(),
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 })
    });

    const response = await worker.fetch(request, env, {});
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.result.tools).toBeDefined();

    const toolNames = data.result.tools.map(t => t.name);
    expect(toolNames).toContain('bridge_runtime_status');
    expect(toolNames).toContain('axim_dispatch_task');
  });

  it('fail-closed kill switch behavior when OPERATOR_DOCK_SUSPENDED is true', async () => {
    const suspendedEnv = { ...env, LAB_STATE: { get: async () => 'true' } };
    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: getAuthorizedHeaders(),
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 })
    });

    const response = await worker.fetch(request, suspendedEnv, {});
    expect(response.status).toBe(503);
  });

  it('fail-closed kill switch behavior when LAB_STATE missing in production', async () => {
    const noKVEnv = { ...env, LAB_STATE: undefined };
    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: getAuthorizedHeaders(),
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 })
    });

    const response = await worker.fetch(request, noKVEnv, {});
    expect(response.status).toBe(503);
  });

  it('verifies that sanitizeEgressPayload redacts secrets from live telemetry output', async () => {
    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: getAuthorizedHeaders(),
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'telemetry_lookup' }, id: 2 })
    });

    const response = await worker.fetch(request, env, {});
    expect(response.status).toBe(200);
    const data = await response.json();
    const textOutput = data.result.content[0].text;
    expect(textOutput).toContain('[REDACTED_SECRET]');
    expect(textOutput).not.toContain('sk-12345678901234567890');
  });

  it('verifies that axim_dispatch_task stages records to hitl_audit_logs', async () => {
    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: getAuthorizedHeaders(),
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'axim_dispatch_task', arguments: { task_type: 'test_task', payload: {} } }, id: 3 })
    });

    const response = await worker.fetch(request, env, {});
    expect(response.status).toBe(200);
    const data = await response.json();
    const textOutput = data.result.content[0].text;
    expect(textOutput).toContain('STAGED_FOR_APPROVAL');
  });

});
