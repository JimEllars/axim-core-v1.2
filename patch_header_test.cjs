const fs = require('fs');
let content = fs.readFileSync('src/components/dashboard/Header.test.jsx', 'utf8');

content = content.replace(
  "    FiLogOut: () => <div data-testid=\"fi-logout\" />,\n    FiActivity: () => <div data-testid=\"fi-activity\" />,\n    FiShield: () => <div data-testid=\"fi-shield\" />,",
  "    FiLogOut: (props) => <div data-testid=\"fi-logout\" {...props} />,\n    FiActivity: (props) => <div data-testid=\"fi-activity\" {...props} />,\n    FiShield: (props) => <div data-testid=\"fi-shield\" {...props} />,"
);

fs.writeFileSync('src/components/dashboard/Header.test.jsx', content);
