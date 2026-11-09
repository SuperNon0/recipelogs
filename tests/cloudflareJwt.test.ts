import { describe, expect, it, beforeEach } from "vitest";
import { generateKeyPairSync, sign, type JsonWebKey } from "node:crypto";
import { clearKeyCache, normalizeTeam, verifyCloudflareJwt } from "@/lib/auth/cloudflare";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...(publicKey.export({ format: "jwk" }) as JsonWebKey), kid: "k1" };
const fetchKeys = async () => [jwk];

const TEAM = "monequipe";
const AUD = "aud-recipelog";
const NOW = 1_800_000_000_000;

function token(payload: Record<string, unknown>, opts: { kid?: string; key?: typeof privateKey; alg?: string } = {}) {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = enc({ alg: opts.alg ?? "RS256", kid: opts.kid ?? "k1" });
  const body = enc(payload);
  const sig = sign("RSA-SHA256", Buffer.from(`${head}.${body}`), opts.key ?? privateKey).toString("base64url");
  return `${head}.${body}.${sig}`;
}

const good = {
  email: "Noe@Example.com",
  iss: `https://${TEAM}.cloudflareaccess.com`,
  aud: [AUD],
  exp: NOW / 1000 + 3600,
  iat: NOW / 1000,
};

const check = (t: string) => verifyCloudflareJwt(t, { team: TEAM, aud: AUD }, { fetchKeys, now: NOW });

describe("verifyCloudflareJwt", () => {
  beforeEach(() => clearKeyCache());

  it("accepte un jeton signé par l'équipe et renvoie l'e-mail en minuscules", async () => {
    expect(await check(token(good))).toEqual({ ok: true, email: "noe@example.com" });
  });

  it("refuse un jeton signé par une autre clé (en-tête forgé)", async () => {
    const r = await check(token(good, { key: other.privateKey }));
    expect(r.ok).toBe(false);
  });

  it("refuse un jeton modifié après signature", async () => {
    const [h, , s] = token(good).split(".");
    const forged = Buffer.from(JSON.stringify({ ...good, email: "pirate@x.fr" })).toString("base64url");
    expect((await check(`${h}.${forged}.${s}`)).ok).toBe(false);
  });

  it("refuse un jeton expiré, d'une autre application ou d'une autre équipe", async () => {
    expect((await check(token({ ...good, exp: NOW / 1000 - 3600 }))).ok).toBe(false);
    expect((await check(token({ ...good, aud: ["autre"] }))).ok).toBe(false);
    expect((await check(token({ ...good, iss: "https://autre.cloudflareaccess.com" }))).ok).toBe(false);
  });

  it("refuse une clé inconnue, un autre algorithme, un jeton sans e-mail ou mal formé", async () => {
    expect((await check(token(good, { kid: "inconnue" }))).ok).toBe(false);
    expect((await check(token(good, { alg: "none" }))).ok).toBe(false);
    expect((await check(token({ ...good, email: undefined }))).ok).toBe(false);
    expect((await check("pas.un-jeton")).ok).toBe(false);
  });

  it("refuse tout tant que l'équipe ou l'AUD manquent", async () => {
    const r = await verifyCloudflareJwt(token(good), { team: "", aud: AUD }, { fetchKeys, now: NOW });
    expect(r.ok).toBe(false);
  });
});

describe("normalizeTeam", () => {
  it("accepte le nom, le domaine ou l'adresse complète", () => {
    expect(normalizeTeam("MonEquipe")).toBe("monequipe");
    expect(normalizeTeam("monequipe.cloudflareaccess.com")).toBe("monequipe");
    expect(normalizeTeam("https://monequipe.cloudflareaccess.com/cdn-cgi/access/certs")).toBe("monequipe");
  });
});
