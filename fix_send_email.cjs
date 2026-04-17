const fs = require('fs');
let code = fs.readFileSync('supabase/functions/send-email/index.ts', 'utf8');

code = code.replace("import { validateMicroAppSession } from '../_shared/auth.ts';", "import { validateMicroAppSession } from '../_shared/auth.ts';\nimport { notifyOnyx } from '../_shared/telemetry.ts';");

code = code.replace("const status = (error.message.includes('Unauthorized') || error.message.includes('Invalid or expired token') || error.message.includes('Missing or invalid Authorization header')) ? 401 : 500;", `const status = (error.message.includes('Unauthorized') || error.message.includes('Invalid or expired token') || error.message.includes('Missing or invalid Authorization header')) ? 401 : 500;

    if (status === 500) {
      await notifyOnyx('/send-email', 500, { error: error.message });
    }`);

fs.writeFileSync('supabase/functions/send-email/index.ts', code);
