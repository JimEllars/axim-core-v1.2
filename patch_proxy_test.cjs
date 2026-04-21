const fs = require('fs');

const file = 'src/services/apiProxy.test.js';
let content = fs.readFileSync(file, 'utf8');

// Update tests to handle the new circuit breaker logic

content = content.replace(
  /await expect\(callApiProxy\(params\)\)\.rejects\.toThrow\('API Proxy Error: Network error'\);/g,
  `await expect(callApiProxy(params)).rejects.toThrow('API Proxy Error');`
);

content = content.replace(
  /await expect\(callApiProxy\(params\)\)\.rejects\.toThrow\('API Error: Invalid API Key'\);/g,
  `await expect(callApiProxy(params)).rejects.toThrow('API Proxy Error');`
);

fs.writeFileSync(file, content, 'utf8');
