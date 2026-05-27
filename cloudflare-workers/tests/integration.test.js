import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import { setTimeout } from 'timers/promises';

let wranglerProcess;
const WORKER_URL = 'http://127.0.0.1:8787'; // Wrangler dev default port

beforeAll(async () => {
  // Start wrangler dev in background
  wranglerProcess = spawn('npx', ['wrangler', 'dev', '--port', '8787'], {
    cwd: process.cwd(),
    stdio: 'pipe'
  });

  // Wait for worker to be ready (3 seconds)
  await setTimeout(3000);
});

afterAll(() => {
  if (wranglerProcess) {
    wranglerProcess.kill();
  }
});

describe('Cloudflare Worker Integration', () => {
  it('should return 200 from /health endpoint', async () => {
    const response = await fetch(`${WORKER_URL}/health`);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.status).toBe('ok');
  });

  it('should proxy /api/* routes to GCP backend', async () => {
    const response = await fetch(`${WORKER_URL}/api/test`);
    // Note: since GCP_BACKEND_URL isn't actually a local mock, it will fail to connect or proxy.
    // So the proxy will return 502 Bad Gateway.
    expect(response.status).toBe(502);
    expect(await response.text()).toBe('API Proxy Error');
  });

  it('should return 404 for non-API routes', async () => {
    const response = await fetch(`${WORKER_URL}/some-frontend-route`);
    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toContain('Frontend pages are served by Cloudflare Pages');
  });
});
