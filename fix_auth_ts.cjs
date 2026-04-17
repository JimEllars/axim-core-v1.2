const fs = require('fs');
let code = fs.readFileSync('supabase/functions/_shared/auth.ts', 'utf8');

code = code.replace('{ name: "HMAC", hash: "SHA-512" }', '{ name: "HMAC", hash: "SHA-256" }');
code = code.replace('import { verify } from "https://deno.land/x/djwt@v2.9.1/mod.ts";', 'import { verify, decode } from "https://deno.land/x/djwt@v2.9.1/mod.ts";');

const returnStatement = 'return payload;';
const decodedPayload = `
    const decodedToken = decode(token);
    return { ...payload, user: { id: payload.sub } };
`;
code = code.replace(returnStatement, decodedPayload);

fs.writeFileSync('supabase/functions/_shared/auth.ts', code);
