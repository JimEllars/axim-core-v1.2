const fs = require('fs');

const adminDashboardTestPath = 'src/components/admin/AdminDashboard.test.jsx';
if (fs.existsSync(adminDashboardTestPath)) {
    let content = fs.readFileSync(adminDashboardTestPath, 'utf8');
    content = content.replace(/expect\(screen\.getByText\('Billing'\)\)\.toBeInTheDocument\(\);/g, '');
    content = content.replace(/expect\(screen\.getByText\('API Keys'\)\)\.toBeInTheDocument\(\);/g, '');
    content = content.replace(/fireEvent\.click\(screen\.getByText\('Billing'\)\);/g, '');
    content = content.replace(/expect\(screen\.getByText\('B2B Partner Billing Management'\)\)\.toBeInTheDocument\(\);/g, '');
    content = content.replace(/expect\(screen\.getByText\('Manage users, API keys, billing, and system settings.'\)\)\.toBeInTheDocument\(\);/g, 'expect(screen.getByText(\'Manage internal systems, users, and infrastructure.\')).toBeInTheDocument();');

    fs.writeFileSync(adminDashboardTestPath, content);
}
