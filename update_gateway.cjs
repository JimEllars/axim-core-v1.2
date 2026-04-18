const fs = require('fs');
let content = fs.readFileSync('supabase/functions/api-gateway/index.ts', 'utf8');

const replacement = `
    const partnerId = apiKeyData.user_id;

    // Dynamic Rate Limiting: Web3-Aware Gateway
    let rateLimitCap = 100;
    try {
        const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(partnerId);

        if (!userError && userData && userData.user && userData.user.user_metadata) {
            if (userData.user.user_metadata.axim_node_holder) {
                rateLimitCap = 1000;
            }
        }
    } catch (e) {
        // gracefully handle missing/malformed session data
        console.warn("Failed to check Web3 token identity, defaulting to standard rate limit", e);
    }
    // Assume there is rate limit enforcement logic following this checking \`rateLimitCap\`

    const { data: creditData, error: creditError } = await supabaseAdmin
`;

const search = `
    const partnerId = apiKeyData.user_id;

    // Dynamic Rate Limiting: Web3-Aware Gateway
    // Fetch the user session/profile to check for Web3 tokens
    let rateLimitCap = 100; // default cap
    try {
        const { data: userData, error: userError } = await supabaseAdmin
            .from('users')
            .select('metadata')
            .eq('id', partnerId)
            .single();

        if (!userError && userData && userData.metadata && userData.metadata.axim_node_holder) {
            rateLimitCap = 1000;
        }
    } catch (e) {
        // gracefully handle missing/malformed session data
        console.warn("Failed to check Web3 token identity, defaulting to standard rate limit", e);
    }

    // Here we'd actually enforce the rateLimitCap with Redis or another DB table
    // Example: const currentUsage = await getUsage(partnerId); if (currentUsage > rateLimitCap) { ... }

    const { data: creditData, error: creditError } = await supabaseAdmin
`;

content = content.replace(search.trim(), replacement.trim());
fs.writeFileSync('supabase/functions/api-gateway/index.ts', content);
