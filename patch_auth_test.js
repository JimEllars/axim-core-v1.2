import fs from 'fs';
let code = fs.readFileSync('tests/ui-smoke.test.jsx', 'utf8');

code = code.replace(
  "then: (r) => { r(result); return b; }",
  "then: (r) => { return Promise.resolve(result).then(r); }"
);

fs.writeFileSync('tests/ui-smoke.test.jsx', code);
