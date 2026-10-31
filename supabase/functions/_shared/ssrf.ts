/**
 * SSRF guard for Edge Functions that fetch user/request-supplied URLs.
 *
 * Resolves the hostname via DNS and rejects loopback, private, link-local,
 * and other non-routable addresses before any outbound request is made.
 * Mirrors the deny-list used by the Rust runtime (remote.rs).
 */

function isPrivateIp(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length === 4) {
    const a = parseInt(parts[0], 10);
    const b = parseInt(parts[1], 10);
    if (a === 0 || a === 10 || a === 127) return true; // 0.0.0.0/8, 10/8, 127/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a === 192 && b === 0) return true; // 192.0.0.0/24
    if (a >= 224) return true; // multicast + reserved
    return false;
  }
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA
  if (lower.startsWith("fe8") || lower.startsWith("fe9") ||
      lower.startsWith("fea") || lower.startsWith("feb")) return true; // link-local
  if (lower.startsWith("::ffff:")) return isPrivateIp(lower.substring(7));
  return false;
}

const BLOCKED_PORTS = new Set([6543, 5432, 8080, 9000]);

export async function assertPublicUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("SSRF blocked: invalid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("SSRF blocked: only http/https URLs are allowed");
  }

  const port = url.port ? parseInt(url.port, 10) : url.protocol === "https:" ? 443 : 80;
  if (BLOCKED_PORTS.has(port)) {
    throw new Error("SSRF blocked: internal infrastructure port");
  }

  const hostname = url.hostname;
  if (isPrivateIp(hostname)) {
    throw new Error("SSRF blocked: private/internal address");
  }

  let ips: string[] = [];
  try {
    const a = await Deno.resolveDns(hostname, "A");
    ips = ips.concat(a);
  } catch {
    /* IPv4 may be absent */
  }
  try {
    const aaaa = await Deno.resolveDns(hostname, "AAAA");
    ips = ips.concat(aaaa);
  } catch {
    /* IPv6 may be absent */
  }

  if (ips.length === 0) {
    throw new Error("SSRF blocked: DNS resolution returned no addresses");
  }

  for (const ip of ips) {
    if (isPrivateIp(ip)) {
      throw new Error("SSRF blocked: private/internal address");
    }
  }
}
