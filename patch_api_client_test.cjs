const fs = require('fs');

const file = 'src/services/__tests__/apiClient.test.js';
let content = fs.readFileSync(file, 'utf8');

// Update to expect correlationId
content = content.replace(
  /success: false,\n\s*error: 'Custom API Error',\n\s*source: 'apiClient:test\/endpoint'/g,
  `success: false,
        error: 'Custom API Error',
        source: 'apiClient:test/endpoint',
        correlationId: expect.any(String)`
);

content = content.replace(
  /success: false,\n\s*error: 'A network error occurred.',\n\s*source: 'apiClient:test\/endpoint'/g,
  `success: false,
        error: 'A network error occurred.',
        source: 'apiClient:test/endpoint',
        correlationId: expect.any(String)`
);

fs.writeFileSync(file, content, 'utf8');
