const fs = require('fs');
let content = fs.readFileSync('src/services/onyxAI/__tests__/api.test.js', 'utf8');

content = content.replace(
  "if (gcpApiService.queryDatabase) gcpApiService.queryDatabase.mockResolvedValue([]);",
  ""
);

content = content.replace(
  "if (supabaseApiService.queryDatabase) supabaseApiService.queryDatabase.mockResolvedValue([]);",
  ""
);

fs.writeFileSync('src/services/onyxAI/__tests__/api.test.js', content, 'utf8');
