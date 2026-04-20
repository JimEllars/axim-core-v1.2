const fs = require('fs');

let content = fs.readFileSync('src/components/admin/EcosystemRegistry.jsx', 'utf8');

content = content.replace(
  "const data = await api.getDiscoveryCapabilities();",
  "const data = await api.getAllEcosystemApps();" // Fetch all apps including inactive for management
);

fs.writeFileSync('src/components/admin/EcosystemRegistry.jsx', content, 'utf8');
