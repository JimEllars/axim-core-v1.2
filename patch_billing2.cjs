const fs = require('fs');

let content = fs.readFileSync('supabase/functions/autonomous-billing/index.ts', 'utf8');

// There's a problem: TypeScript might complain about 'data' being any type in the Object.entries loop if not typed correctly.
// Also we need to make sure we're awaiting proper updates and there's no syntax errors.
// Looking at the replaced string, data.count and data.logIds are used. Since it's typescript, we should type logsByPartner:

content = content.replace(
  "const logsByPartner = allUnbilledLogs.reduce((acc, log) => {",
  "const logsByPartner: Record<string, { count: number, logIds: string[] }> = allUnbilledLogs.reduce((acc: any, log: any) => {"
);

fs.writeFileSync('supabase/functions/autonomous-billing/index.ts', content);
