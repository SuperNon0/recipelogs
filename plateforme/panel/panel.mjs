// Panel admin de la plateforme RecipeLog (admin.<domaine>).
// - Connexion par Authentik (OIDC, code + PKCE), réservée au groupe super-admins.
// - N'a AUCUN accès à Docker : il demande tout au moteur (réseau Docker, clé).
// - Sert aussi la page « site en pause / adresse inconnue » pour les autres
//   adresses en *.<domaine> qui n'ont pas de RecipeLog en ligne.
import { createServer, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { createHash, createHmac, createPublicKey, randomBytes, timingSafeEqual, verify as verifier } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const DOMAINE = process.env.DOMAINE || "recipelog.cc";
const URL_PANEL = (process.env.PANEL_URL || `https://admin.${DOMAINE}`).replace(/\/$/, "");
const HOTE_PANEL = new URL(URL_PANEL).host;
const ISSUER = process.env.PANEL_OIDC_ISSUER || "";
const CLIENT_ID = process.env.PANEL_OIDC_CLIENT_ID || "";
const CLIENT_SECRET = process.env.PANEL_OIDC_CLIENT_SECRET || "";
const INTERNE = (process.env.OIDC_INTERNE || "").replace(/\/$/, "");
const SECRET = process.env.PANEL_SESSION_SECRET || "";
const MOTEUR = (process.env.MOTEUR_URL || "http://recipelog-moteur:8000").replace(/\/$/, "");
const MOTEUR_CLE = process.env.MOTEUR_CLE || "";
const GROUPE = "super-admins";
const DUREE_SESSION = 12 * 3600;

const pret = Boolean(ISSUER && CLIENT_ID && CLIENT_SECRET && SECRET.length >= 32 && MOTEUR_CLE);

// ------------------------------------------------------------ outils
const b64u = (b) => Buffer.from(b).toString("base64url");
const signer = (obj) => {
  const corps = b64u(JSON.stringify(obj));
  return `${corps}.${createHmac("sha256", SECRET).update(corps).digest("base64url")}`;
};
function lire(valeur) {
  if (!valeur) return null;
  const [corps, sig] = valeur.split(".");
  if (!corps || !sig) return null;
  const attendu = createHmac("sha256", SECRET).update(corps).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(attendu);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const o = JSON.parse(Buffer.from(corps, "base64url").toString("utf8"));
    return o.exp && o.exp * 1000 > Date.now() ? o : null;
  } catch {
    return null;
  }
}
const cookies = (req) =>
  Object.fromEntries(
    (req.headers.cookie ?? "")
      .split(";")
      .map((c) => c.trim().split("="))
      .filter(([k, v]) => k && v)
      .map(([k, ...v]) => [k, v.join("=")]),
  );
const cookie = (nom, valeur, age) => `${nom}=${valeur}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
const echapper = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Appels serveur vers Authentik : par le réseau Docker, avec l'adresse publique
// en en-tête (fetch ignore Host : node:http).
function appel(adresse, { methode = "GET", entetes = {}, corps } = {}) {
  let u = new URL(adresse);
  const hotePublic = u.host;
  if (INTERNE) u = new URL(u.pathname + u.search, INTERNE);
  return new Promise((ok, ko) => {
    const req = (u.protocol === "https:" ? httpsRequest : httpRequest)(
      {
        method: methode,
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: u.pathname + u.search,
        headers: { Accept: "application/json", ...(INTERNE ? { Host: hotePublic, "X-Forwarded-Proto": "https" } : {}), ...entetes },
        timeout: 8000,
      },
      (rep) => {
        const m = [];
        rep.on("data", (d) => m.push(d));
        rep.on("end", () => {
          try {
            ok({ statut: rep.statusCode, json: JSON.parse(Buffer.concat(m).toString("utf8")) });
          } catch {
            ok({ statut: rep.statusCode, json: null });
          }
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("délai dépassé")));
    req.on("error", ko);
    if (corps) req.write(corps);
    req.end();
  });
}

let decouverte = null;
async function oidc() {
  if (decouverte && decouverte.exp > Date.now()) return decouverte;
  const d = await appel(`${ISSUER}.well-known/openid-configuration`);
  if (d.statut !== 200 || !d.json?.authorization_endpoint) throw new Error("Authentik ne répond pas.");
  const k = await appel(d.json.jwks_uri);
  decouverte = { ...d.json, cles: k.json?.keys ?? [], exp: Date.now() + 10 * 60 * 1000 };
  return decouverte;
}

function verifierJeton(idToken, d, nonce) {
  const [h, p, s] = idToken.split(".");
  const entete = JSON.parse(Buffer.from(h, "base64url").toString("utf8"));
  const charge = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
  if (entete.alg !== "RS256") throw new Error("algorithme inattendu");
  const jwk = d.cles.find((c) => c.kid === entete.kid) ?? d.cles[0];
  if (!jwk) throw new Error("clé introuvable");
  const ok = verifier("RSA-SHA256", Buffer.from(`${h}.${p}`), createPublicKey({ key: jwk, format: "jwk" }), Buffer.from(s, "base64url"));
  if (!ok) throw new Error("signature invalide");
  const aud = Array.isArray(charge.aud) ? charge.aud : [charge.aud];
  if (charge.iss !== ISSUER) throw new Error("émetteur inattendu");
  if (!aud.includes(CLIENT_ID)) throw new Error("destinataire inattendu");
  if (!charge.exp || charge.exp * 1000 < Date.now() - 60000) throw new Error("jeton expiré");
  if (charge.nonce !== nonce) throw new Error("nonce inattendu");
  return charge;
}

// ------------------------------------------------------------ moteur
async function moteur(methode, chemin, qui, corps) {
  const r = await fetch(`${MOTEUR}${chemin}`, {
    method: methode,
    headers: { Authorization: `Bearer ${MOTEUR_CLE}`, "X-Qui": qui, "Content-Type": "application/json" },
    body: corps ? JSON.stringify(corps) : undefined,
  });
  return { statut: r.status, corps: await r.text() };
}

// ------------------------------------------------------------ pages fixes
const fichiers = {
  "/panel.css": ["text/css; charset=utf-8", "panel.css"],
  "/panel.js": ["text/javascript; charset=utf-8", "panel.js"],
};
const polices = /^\/polices\/[a-z0-9-]+\.woff2$/;

async function pagePause(res, hote) {
  const nom = hote.split(".")[0];
  let etat = "inconnu";
  try {
    const r = await moteur("GET", "/clients", "page-pause");
    const c = JSON.parse(r.corps).clients?.find((x) => x.nom === nom);
    if (c) etat = c.suspendu ? "pause" : "demarre";
  } catch {
    etat = "inconnu";
  }
  const textes = {
    pause: ["Ce RecipeLog est en pause", "Le site est mis en pause pour le moment. Les recettes et les données sont gardées : contacte RecipeLog pour le réactiver."],
    demarre: ["RecipeLog redémarre", "Une mise à jour est en cours. Cette page se recharge toute seule dans quelques secondes."],
    inconnu: ["Adresse inconnue", "Aucun RecipeLog n'existe à cette adresse. Vérifie l'adresse qu'on t'a donnée."],
  }[etat];
  res.writeHead(etat === "inconnu" ? 404 : 503, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...(etat === "demarre" ? { Refresh: "10" } : {}) });
  res.end(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${echapper(textes[0])}</title><link rel="stylesheet" href="https://${HOTE_PANEL}/panel.css"></head>
<body class="pause"><main class="carte-pause"><p class="marque">RecipeLog</p><h1>${echapper(textes[0])}</h1><p>${echapper(textes[1])}</p>
<p class="petit">${echapper(hote)}</p></main></body></html>`);
}

function pageErreur(res, statut, titre, texte) {
  res.writeHead(statut, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  res.end(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${echapper(titre)}</title><link rel="stylesheet" href="/panel.css"></head><body class="pause"><main class="carte-pause">
<p class="marque">RecipeLog · panel</p><h1>${echapper(titre)}</h1><p>${echapper(texte)}</p><p><a class="btn" href="/auth/connexion">Se reconnecter</a></p></main></body></html>`);
}

// ------------------------------------------------------------ serveur
createServer(async (req, res) => {
  const hote = (req.headers.host ?? "").toLowerCase().split(":")[0];
  const url = new URL(req.url, URL_PANEL);
  try {
    // Fichiers communs (aussi utilisés par la page « en pause »).
    if (req.method === "GET" && fichiers[url.pathname]) {
      const [type, f] = fichiers[url.pathname];
      res.writeHead(200, { "Content-Type": type, "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" });
      return res.end(await readFile(path.join(ICI, f)));
    }
    if (req.method === "GET" && polices.test(url.pathname)) {
      res.writeHead(200, { "Content-Type": "font/woff2", "Cache-Control": "public, max-age=31536000", "Access-Control-Allow-Origin": "*" });
      return res.end(await readFile(path.join(ICI, url.pathname)));
    }
    if (url.pathname === "/sante") return res.end("ok");

    if (hote !== HOTE_PANEL) return pagePause(res, hote);
    if (!pret) return pageErreur(res, 503, "Panel pas encore réglé", "Relance install.sh sur la machine : il crée l'accès du panel dans Authentik.");

    const jar = cookies(req);

    // --- connexion
    if (url.pathname === "/auth/connexion") {
      const d = await oidc();
      const flux = { state: b64u(randomBytes(24)), nonce: b64u(randomBytes(24)), verifier: b64u(randomBytes(32)), exp: Math.floor(Date.now() / 1000) + 600 };
      const defi = createHash("sha256").update(flux.verifier).digest("base64url");
      const vers = new URL(d.authorization_endpoint);
      Object.entries({
        response_type: "code",
        client_id: CLIENT_ID,
        redirect_uri: `${URL_PANEL}/auth/retour`,
        scope: "openid email profile",
        state: flux.state,
        nonce: flux.nonce,
        code_challenge: defi,
        code_challenge_method: "S256",
      }).forEach(([k, v]) => vers.searchParams.set(k, v));
      res.writeHead(302, { Location: vers.toString(), "Set-Cookie": cookie("rl_admin_flux", signer(flux), 600) });
      return res.end();
    }
    if (url.pathname === "/auth/retour") {
      const flux = lire(jar.rl_admin_flux);
      if (url.searchParams.get("error")) return pageErreur(res, 403, "Connexion refusée", "Seuls les super-admins entrent dans le panel.");
      if (!flux || flux.state !== url.searchParams.get("state")) return pageErreur(res, 400, "Connexion expirée", "Recommence la connexion.");
      const d = await oidc();
      const corps = new URLSearchParams({ grant_type: "authorization_code", code: url.searchParams.get("code") ?? "", redirect_uri: `${URL_PANEL}/auth/retour`, code_verifier: flux.verifier });
      const t = await appel(d.token_endpoint, {
        methode: "POST",
        corps: corps.toString(),
        entetes: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}` },
      });
      if (t.statut !== 200 || !t.json?.id_token) return pageErreur(res, 400, "Connexion impossible", "Authentik a refusé le code. Recommence.");
      const charge = verifierJeton(t.json.id_token, d, flux.nonce);
      const groupes = charge.groups ?? [];
      if (!groupes.includes(GROUPE)) return pageErreur(res, 403, "Accès refusé", "Ce panel est réservé aux super-admins.");
      const session = { email: String(charge.email ?? "").toLowerCase(), exp: Math.floor(Date.now() / 1000) + DUREE_SESSION };
      res.writeHead(302, { Location: "/", "Set-Cookie": [cookie("rl_admin", signer(session), DUREE_SESSION), cookie("rl_admin_flux", "", 0)] });
      return res.end();
    }
    if (url.pathname === "/auth/deconnexion") {
      let vers = "/";
      try {
        const d = await oidc();
        if (d.end_session_endpoint) vers = d.end_session_endpoint;
      } catch {
        /* rien */
      }
      res.writeHead(302, { Location: vers, "Set-Cookie": cookie("rl_admin", "", 0) });
      return res.end();
    }

    // --- tout le reste demande une session
    const session = lire(jar.rl_admin);
    if (!session) {
      if (url.pathname.startsWith("/api/")) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "session", message: "Session expirée : recharge la page." }));
      }
      res.writeHead(302, { Location: "/auth/connexion" });
      return res.end();
    }

    if (url.pathname === "/" && req.method === "GET") {
      const page = (await readFile(path.join(ICI, "panel.html"), "utf8")).replaceAll("{{EMAIL}}", echapper(session.email)).replaceAll("{{DOMAINE}}", echapper(DOMAINE));
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'",
      });
      return res.end(page);
    }

    // Téléchargement d'une sauvegarde (lien simple : pas d'en-tête X-Panel, donc GET seulement).
    const tele = url.pathname.match(/^\/telecharger\/([a-z0-9-]+)\/([0-9]{8}-[0-9]{6})$/);
    if (tele && req.method === "GET") {
      const r = await fetch(`${MOTEUR}/clients/${tele[1]}/sauvegardes/${tele[2]}/export`, {
        headers: { Authorization: `Bearer ${MOTEUR_CLE}`, "X-Qui": session.email },
      });
      if (!r.ok || !r.body) return pageErreur(res, 404, "Sauvegarde introuvable", "Cette sauvegarde n'existe plus.");
      res.writeHead(200, {
        "Content-Type": "application/gzip",
        "Content-Disposition": r.headers.get("content-disposition") ?? "attachment",
        "Cache-Control": "no-store",
      });
      for await (const morceau of r.body) res.write(morceau);
      return res.end();
    }

    if (url.pathname.startsWith("/api/")) {
      // Une page d'un autre site ne peut pas envoyer cet en-tête sans y être autorisée.
      if (req.method !== "GET" && req.headers["x-panel"] !== "1") {
        res.writeHead(403);
        return res.end();
      }
      const chemin = url.pathname.slice(4);
      const permis = /^\/(clients(\/[a-z0-9-]+\/[a-z-]+)?|journal|tous\/mettre-a-jour)$/;
      if (!permis.test(chemin)) {
        res.writeHead(404);
        return res.end();
      }
      let corps;
      if (req.method === "POST") {
        const m = [];
        for await (const x of req) m.push(x);
        corps = m.length ? JSON.parse(Buffer.concat(m).toString("utf8")) : {};
      }
      const r = await moteur(req.method, chemin, session.email, corps);
      res.writeHead(r.statut, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(r.corps);
    }

    res.writeHead(404);
    res.end();
  } catch (e) {
    console.error(e);
    if (!res.headersSent) pageErreur(res, 500, "Erreur", "Un problème est survenu. Réessaie dans un instant.");
  }
}).listen(3000, () => console.log(`Panel sur le port 3000 (${URL_PANEL})${pret ? "" : " — PAS ENCORE RÉGLÉ"}.`));
