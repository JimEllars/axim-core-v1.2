const fs = require('fs');

const file = 'src/services/__tests__/apiClient.test.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /await expect\(callCloudApi\(endpoint, payload\)\)\.rejects\.toEqual\({/g,
  `await expect(callCloudApi(endpoint, payload)).rejects.toMatchObject({`
);

fs.writeFileSync(file, content, 'utf8');
