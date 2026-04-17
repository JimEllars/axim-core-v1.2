import { verify, decode } from "https://deno.land/x/djwt@v2.9.1/mod.ts";

export async function validateMicroAppSession(req: Request): Promise<any> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Missing or invalid Authorization header");
  }

  const token = authHeader.split(" ")[1];
  const secretString = Deno.env.get("JWT_SECRET");

  if (!secretString) {
    throw new Error("Server configuration error: JWT_SECRET not set");
  }

  // Assuming symmetric key (HMAC SHA-256 for instance)
  // Let's use standard import for cryptoKey
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secretString);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    true,
    ["verify"]
  );

  try {
    const payload = await verify(token, cryptoKey);

    const decodedToken = decode(token);
    return { ...payload, user: { id: payload.sub } };

  } catch (error) {
    throw new Error("Invalid or expired token");
  }
}
