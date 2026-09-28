import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { listTools, callTool, MCPClientError } from '../mcpClient';
import * as telemetry from '../../telemetry';

vi.mock('../../telemetry', () => ({
  logTelemetry: vi.fn()
}));

describe('MCP Client', () => {
  const mockServerUrl = 'https://mock.mcp.server';
  const mockToken = 'test-token';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('listTools', () => {
    it('successfully fetches and caches tools', async () => {
      const mockTools = [{ name: 'test_tool', description: 'test' }];
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          result: { tools: mockTools }
        })
      });

      const tools = await listTools(mockServerUrl, mockToken);
      expect(tools).toEqual(mockTools);

      const cachedTools = await listTools(mockServerUrl, mockToken);
      expect(cachedTools).toEqual(mockTools);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('handles JSON-RPC errors', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          error: { code: -32601, message: 'Method not found' }
        })
      });

      let error;
      try {
        await listTools('new-server', mockToken);
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(MCPClientError);
      expect(error.message).toBe('Method not found');
    });
  });

  describe('callTool', () => {
    it('successfully calls a tool and logs telemetry', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 2,
          result: { content: [{ type: 'text', text: 'Success' }] }
        })
      });

      const result = await callTool(mockServerUrl, mockToken, 'test_tool', { arg1: 'val1' });
      expect(result.content[0].text).toBe('Success');
      expect(telemetry.logTelemetry).toHaveBeenCalledWith(expect.objectContaining({
        type: 'mcp_tool_call',
        status: 'success',
        app_id: 'test_tool'
      }));
    });

    it('retries on 503 errors and fails eventually', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503
      });

      const originalSetTimeout = global.setTimeout;
      global.setTimeout = vi.fn((cb) => {
        cb();
        return 1;
      });

      await expect(callTool(mockServerUrl, mockToken, 'fail_tool', {})).rejects.toThrow(MCPClientError);
      expect(global.fetch).toHaveBeenCalledTimes(3);

      global.setTimeout = originalSetTimeout;
    });

    it('handles timeout errors', async () => {
      global.fetch = vi.fn().mockRejectedValue(new DOMException('The user aborted a request.', 'AbortError'));

      await expect(callTool(mockServerUrl, mockToken, 'timeout_tool', {})).rejects.toThrow(/timed out/);
    });
  });
});
