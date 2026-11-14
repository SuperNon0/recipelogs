import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { readFlow, sessionSecret, signFlow, signSession, verifySession } from "@/lib/auth/session";

const SECRET = "a".repeat(64);
const NOW = 1_800_000_000_000;

describe("cookie de session rl_session", () => {
  it("a la forme du contrat : base64url(JSON) . base64url(HMAC-SHA256)", () => {
    const v = signSession("Chef@Exemple.fr", SECRET, NOW);
    const [part, mac] = v.split(".");
    expect(JSON.parse(Buffer.from(part, "base64url").toString())).toEqual({
      email: "chef@exemple.fr",
      exp: NOW / 1000 + 7 * 24 * 3600,
      iat: NOW / 1000,
    });
    expect(mac).toBe(createHmac("sha256", SECRET).update(part).digest("base64url"));
  });

  it("se vérifie avec le même secret", () => {
    const r = verifySession(signSession("chef@exemple.fr", SECRET, NOW), SECRET, NOW + 1000);
    expect(r).toEqual({ ok: true, session: { email: "chef@exemple.fr", exp: NOW / 1000 + 604800, iat: NOW / 1000 } });
  });

  it("refuse une session modifiée, signée par un autre secret ou expirée", () => {
    const v = signSession("chef@exemple.fr", SECRET, NOW);
    const [, mac] = v.split(".");
    const forged = Buffer.from(JSON.stringify({ email: "pirate@x.fr", exp: NOW / 1000 + 9999, iat: NOW / 1000 })).toString("base64url");
    expect(verifySession(`${forged}.${mac}`, SECRET, NOW).ok).toBe(false);
    expect(verifySession(v, "b".repeat(64), NOW).ok).toBe(false);
    expect(verifySession(v, SECRET, NOW + 8 * 24 * 3600 * 1000).ok).toBe(false);
    expect(verifySession("n'importe quoi", SECRET, NOW).ok).toBe(false);
    expect(verifySession(`${v}.x`, SECRET, NOW).ok).toBe(false);
  });

  it("distingue l'absence de cookie d'une session invalide", () => {
    expect(verifySession(undefined, SECRET, NOW)).toEqual({ ok: false, reason: "absent" });
    expect(verifySession("x.y", SECRET, NOW)).toEqual({ ok: false, reason: "invalid" });
  });

  it("un cookie de connexion en cours ne vaut pas une session", () => {
    const flow = signFlow({ state: "s", nonce: "n", verifier: "v", retour: "/" }, SECRET, NOW);
    expect(verifySession(flow, SECRET, NOW).ok).toBe(false);
  });

  it("le secret doit être assez long", () => {
    expect(sessionSecret({ RECIPELOG_SESSION_SECRET: "court" })).toBeNull();
    expect(sessionSecret({ RECIPELOG_SESSION_SECRET: SECRET })).toBe(SECRET);
  });
});

describe("cookie de connexion en cours rl_oidc", () => {
  it("garde state, nonce, code_verifier et retour pendant 10 minutes", () => {
    const v = signFlow({ state: "s", nonce: "n", verifier: "v", retour: "/recettes" }, SECRET, NOW);
    expect(readFlow(v, SECRET, NOW + 9 * 60 * 1000)).toMatchObject({ state: "s", nonce: "n", verifier: "v", retour: "/recettes" });
    expect(readFlow(v, SECRET, NOW + 11 * 60 * 1000)).toBeNull();
    expect(readFlow(v, "b".repeat(64), NOW)).toBeNull();
  });

  it("une session ne vaut pas un cookie de connexion en cours", () => {
    expect(readFlow(signSession("a@b.fr", SECRET, NOW), SECRET, NOW)).toBeNull();
  });
});
