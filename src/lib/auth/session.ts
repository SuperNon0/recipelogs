import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Cookies signés du mode « plateforme » (connexion par Authentik).
 *
 * - rl_session : `base64url(JSON {email, exp, iat})` + `.` +
 *   `base64url(HMAC-SHA256(secret, partie1))`, 7 jours (plateforme/connexion.md).
 * - rl_oidc : même forme, 10 minutes, garde state, nonce, code_verifier et
 *   chemin de retour pendant l'aller-retour chez Authentik.
 *
 * Le secret est RECIPELOG_SESSION_SECRET, utilisé tel quel (texte) comme clé HMAC.
 */

export const SESSION_COOKIE = "rl_session";
export const FLOW_COOKIE = "rl_oidc";
export const SESSION_MAX_AGE = 7 * 24 * 60 * 60;
export const FLOW_MAX_AGE = 10 * 60;

export type Session = { email: string; exp: number; iat: number };
export type Flow = { state: string; nonce: string; verifier: string; retour: string; exp: number };

export function sessionSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const s = (env.RECIPELOG_SESSION_SECRET ?? "").trim();
  return s.length >= 32 ? s : null;
}

function mac(secret: string, part: string): string {
  return createHmac("sha256", secret).update(part).digest("base64url");
}

export function signValue(payload: Record<string, unknown>, secret: string): string {
  const part = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${part}.${mac(secret, part)}`;
}

/** Contenu signé et pas expiré (champ exp en secondes), sinon null. */
export function readValue(raw: string | undefined | null, secret: string, now = Date.now()): Record<string, unknown> | null {
  if (!raw) return null;
  const dot = raw.indexOf(".");
  if (dot <= 0 || dot !== raw.lastIndexOf(".")) return null;
  const part = raw.slice(0, dot);
  const expected = Buffer.from(mac(secret, part));
  const given = Buffer.from(raw.slice(dot + 1));
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  let v: unknown;
  try {
    v = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!v || typeof v !== "object") return null;
  const obj = v as Record<string, unknown>;
  if (typeof obj.exp !== "number" || obj.exp * 1000 <= now) return null;
  return obj;
}

export function signSession(email: string, secret: string, now = Date.now()): string {
  const iat = Math.floor(now / 1000);
  return signValue({ email: email.trim().toLowerCase(), exp: iat + SESSION_MAX_AGE, iat }, secret);
}

export type SessionCheck = { ok: true; session: Session } | { ok: false; reason: "absent" | "invalid" };

export function verifySession(raw: string | undefined | null, secret: string, now = Date.now()): SessionCheck {
  if (!raw) return { ok: false, reason: "absent" };
  const v = readValue(raw, secret, now);
  if (!v || typeof v.email !== "string" || !v.email.includes("@") || typeof v.iat !== "number") {
    return { ok: false, reason: "invalid" };
  }
  return { ok: true, session: { email: v.email.toLowerCase(), exp: v.exp as number, iat: v.iat } };
}

export function signFlow(flow: Omit<Flow, "exp">, secret: string, now = Date.now()): string {
  return signValue({ t: "flow", ...flow, exp: Math.floor(now / 1000) + FLOW_MAX_AGE }, secret);
}

export function readFlow(raw: string | undefined | null, secret: string, now = Date.now()): Flow | null {
  const v = readValue(raw, secret, now);
  if (!v || v.t !== "flow") return null;
  const { state, nonce, verifier, retour, exp } = v;
  if (typeof state !== "string" || typeof nonce !== "string" || typeof verifier !== "string" || typeof retour !== "string") {
    return null;
  }
  return { state, nonce, verifier, retour, exp: exp as number };
}

/** Options communes des deux cookies. */
export function cookieOptions(maxAge: number) {
  return { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge };
}
