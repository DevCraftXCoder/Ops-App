/**
 * Session token utilities using HMAC-SHA-256 with embedded timestamps.
 * Tokens expire after maxAge seconds (default 30 days).
 * Format: `<hex_timestamp>.<hex_hmac>` where HMAC covers `scope:timestamp`.
 * Works in both Node.js (API routes) and Edge Runtime (middleware).
 */

const DEFAULT_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSign(password: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return toHex(sig);
}

/**
 * Verifies an HMAC-SHA-256 hex signature using crypto.subtle.verify
 * which is guaranteed timing-safe by the Web Crypto spec.
 */
async function hmacVerify(password: string, message: string, hexSig: string): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const sigBytes = new Uint8Array(
    hexSig.match(/.{2}/g)?.map((b) => parseInt(b, 16)) ?? []
  );
  if (sigBytes.length !== 32) return false;
  return crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(message));
}

/**
 * Creates a session token with an embedded timestamp.
 */
export async function deriveToken(password: string, scope: string): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000);
  const hmac = await hmacSign(password, `${scope}:${timestamp}`);
  return `${timestamp.toString(16)}.${hmac}`;
}

/**
 * Verifies a cookie value against the expected HMAC token.
 */
export async function verifyToken(
  cookie: string | undefined,
  password: string | undefined,
  scope: string,
  maxAgeSeconds: number = DEFAULT_MAX_AGE
): Promise<boolean> {
  if (!cookie || !password) return false;

  const dotIdx = cookie.indexOf(".");
  if (dotIdx === -1) return false;

  const timestampHex = cookie.slice(0, dotIdx);
  const hmacHex = cookie.slice(dotIdx + 1);

  const timestamp = parseInt(timestampHex, 16);
  if (isNaN(timestamp) || timestamp <= 0) return false;

  const now = Math.floor(Date.now() / 1000);
  if (now - timestamp > maxAgeSeconds) return false;
  if (timestamp > now + 60) return false;

  return hmacVerify(password, `${scope}:${timestamp}`, hmacHex);
}

export function constantTimeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aBuf = enc.encode(a);
  const bBuf = enc.encode(b);
  const maxLen = Math.max(aBuf.byteLength, bBuf.byteLength);
  const aPad = new Uint8Array(maxLen);
  const bPad = new Uint8Array(maxLen);
  aPad.set(aBuf);
  bPad.set(bBuf);
  let diff = aBuf.byteLength ^ bBuf.byteLength;
  for (let i = 0; i < maxLen; i++) {
    diff |= aPad[i] ^ bPad[i];
  }
  return diff === 0;
}
