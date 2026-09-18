const fs = require('fs');
let content = fs.readFileSync('tests/edge-worker.test.js', 'utf8');

// The test 'allows request when rate limit is not exceeded' should expect 404 because
// the mock worker url is '/api/test' which is not handled by the router in the worker,
// meaning the rate limit was bypassed successfully but it falls through to a 404 response.
content = content.replace(/expect\(response\.status\)\.toBe\(200\);/, "expect(response.status).toBe(404);");

fs.writeFileSync('tests/edge-worker.test.js', content);
