const fs = require('fs');
const file = 'cloudflare-workers/tests/integration.test.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'import { env, createExecutionContext } from "cloudflare:test";',
  'import { env, createExecutionContext } from "cloudflare:test"; // eslint-disable-line'
);

fs.writeFileSync(file, content);
