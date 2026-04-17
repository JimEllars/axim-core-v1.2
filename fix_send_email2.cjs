const fs = require('fs');
let code = fs.readFileSync('supabase/functions/send-email/index.ts', 'utf8');

const authBlock = `
    // 2. Authenticate User
    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) {
      throw new Error('Unauthorized: No active user session found.');
    }
`;

const updatedAuthBlock = `
    // 2. We already validated the token, we can get user ID from there if it exists, or skip
    // If you're mixing standard Supabase JWT and micro-app custom JWT, getUser() might fail for the latter.
    const decodedToken = await validateMicroAppSession(req);
    const user = decodedToken.user;
`;

code = code.replace(authBlock, updatedAuthBlock);
code = code.replace('await validateMicroAppSession(req);', '');

fs.writeFileSync('supabase/functions/send-email/index.ts', code);
