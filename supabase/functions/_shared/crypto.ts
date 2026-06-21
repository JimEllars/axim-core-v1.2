export async function hashApiKey(key: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(key);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function generateApiKey(): string {
    return 'axim_pk_' + crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').substring(0, 16);
}
