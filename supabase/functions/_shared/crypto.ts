export async function decryptPayload(ivBase64: string, tagBase64: string, ciphertextBase64: string, sharedSecretBase64: string): Promise<string> {
    const iv = Uint8Array.from(atob(ivBase64), c => c.charCodeAt(0));
    const tag = Uint8Array.from(atob(tagBase64), c => c.charCodeAt(0));
    const ciphertext = Uint8Array.from(atob(ciphertextBase64), c => c.charCodeAt(0));
    const keyData = Uint8Array.from(atob(sharedSecretBase64), c => c.charCodeAt(0));

    const key = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "AES-GCM" },
        false,
        ["decrypt"]
    );

    const combinedCiphertext = new Uint8Array(ciphertext.length + tag.length);
    combinedCiphertext.set(ciphertext);
    combinedCiphertext.set(tag, ciphertext.length);

    try {
        const decrypted = await crypto.subtle.decrypt(
            {
                name: "AES-GCM",
                iv: iv,
                tagLength: 128
            },
            key,
            combinedCiphertext
        );
        const decoder = new TextDecoder();
        return decoder.decode(decrypted);
    } catch (e) {
        throw new Error("Decryption failed: " + e.message);
    }
}
