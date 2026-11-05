// @vitest-environment node
/**
 * Regression gate for the edge worker's route table.
 *
 * `cloudflare-workers/src/index.js` has proxied `/api/v1/robotics/projects`,
 * `/api/v1/robotics/sim` and `/api/v1/robotics/fleet/emergency-stop` at
 * `functions/v1/robotics-projects`, `robotics-sim` and `robotics-emergency-stop`
 * since the robotics schema landed. None of those directories existed under
 * `supabase/functions/`, so the worker proxied faithfully to a 404 and every
 * robotics API call failed. Nothing noticed, because no test related the two
 * halves of the wiring.
 *
 * This test relates them: every route target must be a function directory that
 * exists. Anything not yet built has to be named in `NOT_YET_BUILT`, so adding a
 * route to a function that does not exist can never be silent again — and the
 * outstanding gap is written down rather than assumed.
 *
 * The list held the three MCP functions until Wave 131 built them
 * (`mcp-router`, `mcp-sse`, `mcp-message`), so it is empty now. It stays as an
 * empty set rather than being deleted, because it is the mechanism that made the
 * gap visible in the first place.
 *
 * The worker is imported for real (`apiRoutes`), not re-parsed out of the source,
 * so a rename or a change of shape fails here instead of producing an empty map
 * that trivially passes.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { apiRoutes } from '../cloudflare-workers/src/index.js';

const REPO_ROOT = join(import.meta.dirname, '..');
const FUNCTIONS_DIR = join(REPO_ROOT, 'supabase', 'functions');

/**
 * Functions the worker routes to that have not been built yet. Each entry is a
 * known gap with its own roadmap item; the test asserts the list stays accurate
 * in both directions, so building one of these forces its removal from here.
 */
const NOT_YET_BUILT = new Set();

/** '/functions/v1/robotics-sim' -> 'robotics-sim' */
function functionNameFromTarget(target) {
  const match = /^\/functions\/v1\/([^/]+)/.exec(target ?? '');
  return match ? match[1] : null;
}

describe('edge worker route table', () => {
  it('has routes to check', () => {
    // A sanity floor: if the export disappeared, the assertions below would pass
    // vacuously against an empty map.
    expect(apiRoutes.size).toBeGreaterThanOrEqual(15);
  });

  it('every route target is a known function or a recorded gap', () => {
    const missing = [];

    for (const [route, target] of apiRoutes) {
      const name = functionNameFromTarget(target);
      if (!name) {
        missing.push(`${route} -> ${target} (not a /functions/v1/<name> target)`);
        continue;
      }
      if (NOT_YET_BUILT.has(name)) continue;

      const functionDir = join(FUNCTIONS_DIR, name);
      if (!existsSync(join(functionDir, 'index.ts'))) {
        missing.push(`${route} -> ${name} (no supabase/functions/${name}/index.ts)`);
      }
    }

    expect(missing, `routes with no implementation:\n${missing.join('\n')}`).toEqual([]);
  });

  it('the recorded gaps are still gaps', () => {
    // When one of the MCP functions lands, this fails and asks for the allowlist
    // entry to be removed, so the list cannot rot into a permanent excuse.
    const stillMissing = [...NOT_YET_BUILT].filter(
      (name) => !existsSync(join(FUNCTIONS_DIR, name, 'index.ts')),
    );
    expect(stillMissing.sort()).toEqual([...NOT_YET_BUILT].sort());
  });

  it('routes the MCP transports at functions that exist', () => {
    // Wave 131: all six MCP routes proxied to directories that did not exist and
    // answered Supabase's 404. Both transports now resolve to real code.
    const mcpRoutes = {
      '/mcp': 'mcp-router',
      '/api/v1/mcp': 'mcp-router',
      '/sse': 'mcp-sse',
      '/api/v1/mcp/sse': 'mcp-sse',
      '/message': 'mcp-message',
      '/api/v1/mcp/message': 'mcp-message',
    };

    for (const [route, expectedFunction] of Object.entries(mcpRoutes)) {
      expect(apiRoutes.get(route)).toBe(`/functions/v1/${expectedFunction}`);
      expect(existsSync(join(FUNCTIONS_DIR, expectedFunction, 'index.ts'))).toBe(true);
    }
  });

  it('routes the robotics API at functions that exist', () => {
    const roboticsRoutes = {
      '/api/v1/robotics/projects': 'robotics-projects',
      '/api/v1/robotics/sim': 'robotics-sim',
      '/api/v1/robotics/fleet/emergency-stop': 'robotics-emergency-stop',
    };

    for (const [route, expectedFunction] of Object.entries(roboticsRoutes)) {
      expect(apiRoutes.get(route)).toBe(`/functions/v1/${expectedFunction}`);
      expect(existsSync(join(FUNCTIONS_DIR, expectedFunction, 'index.ts'))).toBe(true);
    }
  });

  it('the function directories it points at are in the deployable tree', () => {
    // `supabase functions deploy` (no name filter) deploys every directory in
    // supabase/functions, which is why adding a directory here is enough to ship
    // it. Assert the robotics functions really are top-level directories and not
    // nested helpers, which `deploy` would skip.
    const topLevel = new Set(readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name));

    for (const name of [
      'robotics-projects',
      'robotics-sim',
      'robotics-emergency-stop',
      'robotics-sim-drainer',
      'mcp-router',
      'mcp-sse',
      'mcp-message',
    ]) {
      expect(topLevel.has(name), `${name} is not a top-level function directory`).toBe(true);
    }
  });
});
