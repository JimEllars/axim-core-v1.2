const fs = require('fs');
let file = 'tests/ui-smoke.test.jsx';
let content = fs.readFileSync(file, 'utf8');

// remove unused imports
content = content.replace("import React from 'react';", "");
content = content.replace("import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';", "import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';");

fs.writeFileSync(file, content);

console.log("Fixed unused imports.");
