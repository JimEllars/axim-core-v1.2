const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/components/admin/AdminDashboard.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Add import if missing
if (!content.includes('import BillingPortal')) {
    content = content.replace("import EcosystemRegistry from './EcosystemRegistry';", "import EcosystemRegistry from './EcosystemRegistry';\nimport BillingPortal from './BillingPortal';");
}

// Add tab
if (!content.includes("{ id: 'billing', label: 'Fulfillment', icon: FiBox }")) {
    content = content.replace(
        "    { id: 'ecosystem', label: 'Ecosystem Registry', icon: FiBox },\n  ];",
        "    { id: 'ecosystem', label: 'Ecosystem Registry', icon: FiBox },\n    { id: 'billing', label: 'Fulfillment', icon: FiBox },\n  ];"
    );
}

// Add content rendering
if (!content.includes("activeTab === 'billing' && <BillingPortal />")) {
    content = content.replace(
        "{activeTab === 'ecosystem' && <EcosystemRegistry />}",
        "{activeTab === 'ecosystem' && <EcosystemRegistry />}\n          {activeTab === 'billing' && <BillingPortal />}"
    );
}

fs.writeFileSync(filePath, content, 'utf8');
console.log("Patched AdminDashboard successfully");
