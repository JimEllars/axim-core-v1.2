const fs = require('fs');

let content = fs.readFileSync('cloudflare-workers/tests/integration.test.js', 'utf8');

// I don't see integration.test.js in the output, it was tests/edge-worker.test.js in the main directory that failed
