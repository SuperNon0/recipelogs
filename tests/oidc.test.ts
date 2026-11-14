import { beforeEach, describe, expect, it } from "vitest";
import { generateKeyPairSync, sign, type JsonWebKey } from "node:crypto";
import {
  authorizeUrl,
  clearOidcCache,
  discover,
  discoveryUrl,
  exchangeCode,
  internalTarget,
  oidcConfigCheck,
  pkceChallenge,
  safeReturnPath,
  serverCall,
  verifyIdToken,
  type OidcConfig,
  type ServerFetcher,
} from "@/lib/auth/oidc";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...(publicKey.export({ format: "jwk" }) as JsonWebKey), kid: "k1" };
const fetchKeys = async () => [jwk];

const ISSUER = "https://auth.recipelog.cc/application/o/rl-chanka/";
const CLIENT = "rl-chanka";
const NONCE = "nonce-123";
const NOW = 1_800_000_000_000;
const JWKS = "https://auth.recipelog.cc/application/o/rl-chanka/jwks/";

function token(payload: Record<string, unknown>, opts: { kid?: string; key?: typeof privateKey; alg?: string } = {}) {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = enc({ alg: opts.alg ?? "RS256", kid: opts.kid ?? "k1", typ: "JWT" });
  const body = enc(payload);
  const sig = sign("RSA-SHA256", Buffer.from(`${head}.${body}`), opts.key ?? privateKey).toString("base64url");
  return `${head}.${body}.${sig}`;
}

const good = {
  email: "Chef@Patisserie.FR",
  iss: ISSUER,
  aud: CLIENT,
  exp: NOW / 1000 + 300,
  iat: NOW / 1000,
  nonce: NONCE,
};

const check = (t: string, nonce = NONCE, now = NOW) =>
  verifyIdToken(t, { issuer: ISSUER, clientId: CLIENT, nonce, jwksUri: JWKS }, { fetchKeys, now });

describe("verifyIdToken", () => {
  beforeEach(() => clearOidcCache());

  it("accepte un bon jeton et renvoie l'e-mail en minuscules", async () => {
    expect(await check(token(good))).toEqual({ ok: true, email: "chef@patisserie.fr" });
    expect(await check(token({ ...good, aud: ["autre", CLIENT] }))).toEqual({ ok: true, email: "chef@patisserie.fr" });
  });

  it("refuse un autre émetteur (même sans la barre finale)", async () => {
    expect((await check(token({ ...good, iss: "https://auth.recipelog.cc/application/o/rl-autre/" }))).ok).toBe(false);
    expect((await check(token({ ...good, iss: ISSUER.slice(0, -1) }))).ok).toBe(false);
  });

  it("refuse une autre audience", async () => {
    expect((await check(token({ ...good, aud: "rl-autre" }))).ok).toBe(false);
    expect((await check(token({ ...good, aud: ["rl-autre"] }))).ok).toBe(false);
  });

  it("refuse un jeton expiré, mais tolère 60 secondes", async () => {
    expect((await check(token({ ...good, exp: NOW / 1000 - 120 }))).ok).toBe(false);
    expect((await check(token({ ...good, exp: NOW / 1000 - 30 }))).ok).toBe(true);
    expect((await check(token({ ...good, exp: undefined }))).ok).toBe(false);
    expect((await check(token({ ...good, nbf: NOW / 1000 + 600 }))).ok).toBe(false);
  });

  it("refuse un mauvais nonce, ou un jeton sans nonce", async () => {
    expect((await check(token(good), "autre-nonce")).ok).toBe(false);
    expect((await check(token({ ...good, nonce: undefined }))).ok).toBe(false);
  });

  it("refuse une clé inconnue, une autre clé, un autre algorithme, un jeton modifié", async () => {
    expect((await check(token(good, { kid: "inconnue" }))).ok).toBe(false);
    expect((await check(token(good, { key: other.privateKey }))).ok).toBe(false);
    expect((await check(token(good, { alg: "HS256" }))).ok).toBe(false);
    const [h, , s] = token(good).split(".");
    const forged = Buffer.from(JSON.stringify({ ...good, email: "pirate@x.fr" })).toString("base64url");
    expect((await check(`${h}.${forged}.${s}`)).ok).toBe(false);
    expect((await check("pas.un-jeton")).ok).toBe(false);
  });

  it("refuse un jeton sans e-mail", async () => {
    expect((await check(token({ ...good, email: undefined }))).ok).toBe(false);
  });

  it("relit les clés quand le kid est inconnu (changement de clé chez Authentik)", async () => {
    let calls = 0;
    const rotating = async () => (calls++ === 0 ? [{ ...jwk, kid: "ancienne" }] : [jwk]);
    const opts = { issuer: ISSUER, clientId: CLIENT, nonce: NONCE, jwksUri: JWKS };
    // Premier appel : la liste lue n'a que l'ancienne clé.
    expect((await verifyIdToken(token(good), opts, { fetchKeys: rotating, now: NOW })).ok).toBe(false);
    // Ensuite : kid absent du cache → la liste est relue et contient la nouvelle clé.
    expect((await verifyIdToken(token(good), opts, { fetchKeys: rotating, now: NOW })).ok).toBe(true);
    expect(calls).toBe(2);
  });
});

describe("chemin de retour", () => {
  it("garde les chemins du site", () => {
    expect(safeReturnPath("/recipes/12?onglet=cout#etapes")).toBe("/recipes/12?onglet=cout#etapes");
    expect(safeReturnPath("/")).toBe("/");
  });

  it("refuse les adresses d'autres sites et les pièges", () => {
    for (const bad of [
      null,
      "",
      "https://pirate.fr/",
      "//pirate.fr/x",
      "/\\pirate.fr",
      "\\\\pirate.fr",
      "recettes",
      "javascript:alert(1)",
      "/\t/pirate.fr",
      "/\n/pirate.fr",
      "/auth/connexion?retour=/x",
    ]) {
      expect(safeReturnPath(bad)).toBe("/");
    }
  });
});

describe("OIDC_INTERNE", () => {
  it("remplace l'origine publique et garde le nom public dans Host", () => {
    expect(internalTarget(`${ISSUER}.well-known/openid-configuration`, "http://recipelog-authentik:9000")).toEqual({
      url: "http://recipelog-authentik:9000/application/o/rl-chanka/.well-known/openid-configuration",
      headers: { Host: "auth.recipelog.cc", "X-Forwarded-Proto": "https" },
    });
  });

  it("garde la requête et un préfixe éventuel", () => {
    expect(internalTarget("https://auth.recipelog.cc/a/b?x=1", "http://h:9000/").url).toBe("http://h:9000/a/b?x=1");
    expect(internalTarget("https://auth.recipelog.cc/a", "http://h:9000/pre").url).toBe("http://h:9000/pre/a");
  });

  it("sans OIDC_INTERNE, l'adresse publique est appelée telle quelle", () => {
    expect(internalTarget("https://auth.recipelog.cc/x", null)).toEqual({ url: "https://auth.recipelog.cc/x", headers: {} });
  });

  it("la découverte, le jeton et les clés passent par l'origine interne", async () => {
    clearOidcCache();
    const seen: { url: string; headers?: Record<string, string>; body?: string }[] = [];
    const fake: ServerFetcher = async (url, init) => {
      seen.push({ url, headers: init.headers, body: init.body });
      if (url.endsWith("openid-configuration")) {
        return {
          status: 200,
          body: {
            issuer: ISSUER,
            authorization_endpoint: "https://auth.recipelog.cc/application/o/authorize/",
            token_endpoint: "https://auth.recipelog.cc/application/o/token/",
            jwks_uri: JWKS,
            end_session_endpoint: "https://auth.recipelog.cc/application/o/rl-chanka/end-session/",
          },
        };
      }
      return { status: 200, body: { id_token: "abc" } };
    };
    const config: OidcConfig = {
      issuer: ISSUER,
      clientId: CLIENT,
      clientSecret: "s3cr:et",
      appUrl: "https://chanka.recipelog.cc",
      internal: "http://recipelog-authentik:9000",
    };
    const d = await discover(config, fake);
    await discover(config, fake); // en cache
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe("http://recipelog-authentik:9000/application/o/rl-chanka/.well-known/openid-configuration");
    expect(seen[0].headers?.Host).toBe("auth.recipelog.cc");

    // Le navigateur, lui, part vers l'adresse publique.
    const auth = new URL(authorizeUrl(d, config, { state: "st", nonce: "no", verifier: "ve" }));
    expect(auth.origin).toBe("https://auth.recipelog.cc");
    expect(auth.searchParams.get("redirect_uri")).toBe("https://chanka.recipelog.cc/auth/retour");
    expect(auth.searchParams.get("code_challenge")).toBe(pkceChallenge("ve"));
    expect(auth.searchParams.get("code_challenge_method")).toBe("S256");
    expect(auth.searchParams.get("state")).toBe("st");
    expect(auth.searchParams.get("nonce")).toBe("no");

    const t = await exchangeCode(d, config, "le-code", "ve", fake);
    expect(t).toEqual({ ok: true, idToken: "abc" });
    const call = seen[1];
    expect(call.url).toBe("http://recipelog-authentik:9000/application/o/token/");
    expect(call.headers?.Host).toBe("auth.recipelog.cc");
    expect(call.headers?.Authorization).toBe(`Basic ${Buffer.from("rl-chanka:s3cr%3Aet").toString("base64")}`);
    const form = new URLSearchParams(call.body);
    expect(form.get("code")).toBe("le-code");
    expect(form.get("code_verifier")).toBe("ve");
    expect(form.get("grant_type")).toBe("authorization_code");

    await serverCall({ internal: null }, "https://auth.recipelog.cc/x", {}, fake);
    expect(seen[2].url).toBe("https://auth.recipelog.cc/x");
    expect(seen[2].headers?.Host).toBeUndefined();
  });
});

describe("requête du serveur (node:http)", () => {
  it("envoie vraiment l'en-tête Host public (fetch l'ignorerait)", async () => {
    const http = await import("node:http");
    const server = http.createServer((req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ host: req.headers.host, proto: req.headers["x-forwarded-proto"], path: req.url }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;
    try {
      const r = await serverCall({ internal: `http://127.0.0.1:${port}` }, `${ISSUER}.well-known/openid-configuration`);
      expect(r).toEqual({
        status: 200,
        body: { host: "auth.recipelog.cc", proto: "https", path: "/application/o/rl-chanka/.well-known/openid-configuration" },
      });
    } finally {
      server.close();
    }
  });
});

describe("réglages", () => {
  it("liste ce qui manque", () => {
    expect(oidcConfigCheck({} as NodeJS.ProcessEnv).missing).toEqual(["OIDC_ISSUER", "OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET", "RECIPELOG_URL"]);
    const ok = oidcConfigCheck({
      OIDC_ISSUER: ISSUER,
      OIDC_CLIENT_ID: CLIENT,
      OIDC_CLIENT_SECRET: "x",
      RECIPELOG_URL: "https://chanka.recipelog.cc/",
    } as unknown as NodeJS.ProcessEnv);
    expect(ok.config?.appUrl).toBe("https://chanka.recipelog.cc");
    expect(ok.config?.internal).toBeNull();
  });

  it("adresse de découverte", () => {
    expect(discoveryUrl(ISSUER)).toBe(`${ISSUER}.well-known/openid-configuration`);
  });
});
