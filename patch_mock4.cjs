const fs = require('fs');

let content = fs.readFileSync('src/components/layout/ApprovalQueue.test.jsx', 'utf8');

content = content.replace(
  /expect\(api\.resolveHitlAction\)\.toHaveBeenCalledWith\('1', 'Approved', \{ description: 'A test description', target: 'test-target' \}\); \/\/.*?\);/gs,
  "expect(api.resolveHitlAction).toHaveBeenCalledWith('1', 'Approved', { description: 'A test description', target: 'test-target' });"
);

content = content.replace(
  /expect\(api\.resolveHitlAction\)\.toHaveBeenCalledWith\('1', 'Rejected'\); \/\/.*?\);/gs,
  "expect(api.resolveHitlAction).toHaveBeenCalledWith('1', 'Rejected');"
);


fs.writeFileSync('src/components/layout/ApprovalQueue.test.jsx', content, 'utf8');
