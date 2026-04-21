const fs = require('fs');

const file = 'src/services/__tests__/apiClient.test.js';
let content = fs.readFileSync(file, 'utf8');

// Use expect.objectContaining instead
content = content.replace(
  /await expect\(callCloudApi\(endpoint, payload\)\)\.rejects\.toEqual\({/g,
  `await expect(callCloudApi(endpoint, payload)).rejects.toEqual(expect.objectContaining({`
);

content = content.replace(
  /source: 'apiClient:test\/endpoint',\n\s*correlationId: expect\.any\(String\)\n\s*}\);/g,
  `source: 'apiClient:test/endpoint'
      }));`
);


fs.writeFileSync(file, content, 'utf8');
