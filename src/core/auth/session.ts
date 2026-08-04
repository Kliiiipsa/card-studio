/**
 * Stateless signed sessions: the cookie holds "payload.signature" where the
 * payload is base64url JSON and the signature is HMAC-SHA256 with AUTH_SECRET.
 * Web Crypto only → verifiable both in the Edge middleware and Node routes.
 */
export const SESSION_COOKIE = "wb_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export type SessionPayload = {
  email: string;
  role: "admin" | "user";
  /** unix seconds */
  exp: number;
};

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(text: string): Uint8Array | null {
  try {
    const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function hmac(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return new Uint8Array(sig);
}

export async function createSessionToken(
  secret: string,
  payload: Omit<SessionPayload, "exp">,
): Promise<string> {
  const full: SessionPayload = { ...payload, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE };
  const body = b64urlEncode(new TextEncoder().encode(JSON.stringify(full)));
  const sig = b64urlEncode(await hmac(secret, body));
  return `${body}.${sig}`;
}

/** Returns the payload when the token is authentic and unexpired, else null. */
export async function verifySessionToken(
  secret: string,
  token: string | undefined,
): Promise<SessionPayload | null> {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const givenSig = b64urlDecode(token.slice(dot + 1));
  if (!givenSig) return null;
  const expected = await hmac(secret, body);
  if (givenSig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ givenSig[i];
  if (diff !== 0) return null;

  const raw = b64urlDecode(body);
  if (!raw) return null;
  let payload: SessionPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(raw)) as SessionPayload;
  } catch {
    return null;
  }
  if (typeof payload.email !== "string" || typeof payload.exp !== "number") return null;
  if (payload.exp * 1000 < Date.now()) return null;
  return payload;
}

/** Reads and verifies the session from a route-handler Request. Null when absent/invalid. */
export async function sessionFromRequest(req: Request): Promise<SessionPayload | null> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  const cookieHeader = req.headers.get("cookie") ?? "";
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return verifySessionToken(secret, match?.[1]);
}
