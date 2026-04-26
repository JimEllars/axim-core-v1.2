const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'supabase/functions/onyx-bridge/index.ts');
let content = fs.readFileSync(filePath, 'utf8');

// The line memoryResults = await Promise.race... inside a scope where `user` might not be defined if `!isServiceRole` check fails or if it's service role.
// We need to make sure `user` is captured safely. `user` is extracted earlier, but wrapped in `if (!isServiceRole) { ... }`.
// Let's modify the code so `let user = null;` is declared before `if (!isServiceRole)`.

const declareUserCode = `
    let user = null;
    if (!isServiceRole) {
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader! } } }
      );

      const { data: authData, error: userError } = await supabaseClient.auth.getUser();
      user = authData.user;

      if (userError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...getCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
        });
      }
    }
`;

content = content.replace(
    /if \(!isServiceRole\) \{\s*const supabaseClient = createClient\([\s\S]*?if \(userError \|\| !user\) \{[\s\S]*?\}\s*\}/,
    declareUserCode
);

fs.writeFileSync(filePath, content, 'utf8');
console.log("Patched onyx-bridge successfully step 2");
