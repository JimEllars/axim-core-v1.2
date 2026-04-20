const fs = require('fs');

let content = fs.readFileSync('src/services/onyxAI/__tests__/api.test.js', 'utf8');

// The issue is `api.initialize is not a function`.
// We mock `../../services/onyxAI/api` somewhere.
// Let's check where it's mocked.
if (content.includes("vi.mock('../api'")) {
    console.log("Mocking api.js directly");
}
