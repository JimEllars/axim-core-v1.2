// @vitest-environment node
/**
 * Proving tests for `.github/workflows/deploy-edge-functions.yml`.
 *
 * The workflow merged in PR #498 to deploy the functions nothing had ever
 * deployed. Its first run on `main` (41986445329) reported **success** having
 * deployed nothing: `SUPABASE_ACCESS_TOKEN` is not provisioned on the repository,
 * so `preflight` logged a warning, `deploy`/`smoke`/`critical-contracts` were all
 * skipped, and the run went green. All 80 functions still answered
 * "Requested function was not found".
 *
 * That is the failure mode the workflow exists to end, reproduced one level up,
 * so the reporting is now pinned here. These assertions are structural: `js-yaml`
 * is only present transitively, so parsing the file with it would make this test
 * depend on an undeclared package. The workflow is asserted by line-anchored
 * match instead — enough to fail if the guarantee is removed, and honest about
 * what it does not check (YAML validity is covered by GitHub and by any editor).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WORKFLOW_PATH = join(
  import.meta.dirname,
  '..',
  '.github',
  'workflows',
  'deploy-edge-functions.yml',
);
const workflow = readFileSync(WORKFLOW_PATH, 'utf8');

/** Returns the body of a top-level job block (two-space indented `name:`). */
function jobBlock(name) {
  const lines = workflow.split('\n');
  const start = lines.findIndex((line) => line === `  ${name}:`);
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^ {2}[a-z][a-z0-9-]*:\s*$/.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}

describe('edge deploy workflow', () => {
  it('has the jobs the pipeline depends on', () => {
    for (const name of ['preflight', 'parse-gate', 'deploy', 'smoke', 'critical-contracts', 'report']) {
      expect(jobBlock(name), `job ${name} is missing`).not.toBeNull();
    }
  });

  it('never runs a deploy without a credential', () => {
    for (const name of ['deploy', 'smoke', 'critical-contracts']) {
      const block = jobBlock(name);
      expect(block).toMatch(/if:\s*needs\.preflight\.outputs\.has_credentials == 'true'/);
    }
  });

  it('always runs the report job, even when everything else was skipped', () => {
    const block = jobBlock('report');
    expect(block).toMatch(/if:\s*always\(\)/);
    // It has to depend on the skipped jobs, or `needs.<job>.result` is not
    // available to explain why they did not run.
    expect(block).toMatch(/needs:\s*\[preflight, parse-gate, deploy, smoke, critical-contracts\]/);
  });

  it('reports "NOT DEPLOYED" rather than a bare success when there are no credentials', () => {
    const block = jobBlock('report');

    expect(block).toContain('Edge deploy: **NOT DEPLOYED** — no credentials');
    expect(block).toContain('SUPABASE_ACCESS_TOKEN');
    // The remediation has to name the secret and say how to re-run, because the
    // reader of a green run has no other cue that nothing happened.
    expect(block).toContain('sbp_');
    expect(block).toContain('workflow_dispatch');

    // The branch must be on HAS_CREDENTIALS and must exit 0: a missing secret is
    // an operator action, not a reason to fail every pull request.
    expect(block).toMatch(/if \[ "\$\{HAS_CREDENTIALS\}" != "true" \]; then/);
    expect(block).toMatch(/exit 0/);
  });

  it('still writes a summary when the deploy did run', () => {
    const block = jobBlock('report');
    expect(block).toContain('Edge deploy: deployed');
    expect(block).toContain('FUNCTIONS_CSV');
  });
});
