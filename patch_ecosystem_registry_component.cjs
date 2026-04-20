const fs = require('fs');
let content = fs.readFileSync('src/components/admin/EcosystemRegistry.jsx', 'utf8');

// There is a bug in EcosystemRegistry: data is awaited from api.getAllEcosystemApps()
// Let's make sure it's calling the correct method and not erroring out.

content = content.replace(
  "const data = await api.getDiscoveryCapabilities();\n      const error = null;",
  "const data = await api.getAllEcosystemApps();\n      const error = null;"
);

fs.writeFileSync('src/components/admin/EcosystemRegistry.jsx', content, 'utf8');
