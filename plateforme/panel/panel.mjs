// Panel admin de la plateforme RecipeLog (admin.<domaine>).
// - Connexion par Authentik (OIDC, code + PKCE), réservée au groupe super-admins.
// - N'a AUCUN accès à Docker : il demande tout au moteur (réseau Docker, clé).
// - Sert aussi la page « site en pause / adresse inconnue » pour les autres
//   adresses en *.<domaine> qui n'ont pas de RecipeLog en ligne.
import { createServer, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { createHash, createHmac, createPublicKey, randomBytes, timingSafeEqual, verify as verifier } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PAGES as PAGES_VENTE, PAR_DEFAUT as VENTE_DEFAUT, page as pageVente } from "./vente.mjs";

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
const PANEL_OIDC = { issuer: ISSUER, clientId: CLIENT_ID };

// Bouton « Se connecter » du site vitrine (<domaine>/connexion) : application Authentik
// « rl-portail », ouverte à tous les comptes (passerelle : portail-creer).
const PORTAIL_OIDC = {
  issuer: process.env.PORTAIL_OIDC_ISSUER || "",
  clientId: process.env.PORTAIL_OIDC_CLIENT_ID || "",
  secret: process.env.PORTAIL_OIDC_CLIENT_SECRET || "",
};
const URL_PORTAIL = `https://${DOMAINE}`;
const portailPret = Boolean(PORTAIL_OIDC.issuer && PORTAIL_OIDC.clientId && PORTAIL_OIDC.secret && SECRET.length >= 32);

// ------------------------------------------------------------ outils
const b64u = (b) => Buffer.from(b).toString("base64url");
// Chaque cookie signé porte son rôle (`t`) : « session » (connecté) ou « flux » (connexion
// en cours). Sans ça, le cookie du flux, signé avec la même clé, passait pour une session.
const signer = (obj, type) => {
  const corps = b64u(JSON.stringify({ ...obj, t: type }));
  return `${corps}.${createHmac("sha256", SECRET).update(corps).digest("base64url")}`;
};
function lire(valeur, type) {
  if (!valeur) return null;
  const [corps, sig] = valeur.split(".");
  if (!corps || !sig) return null;
  const attendu = createHmac("sha256", SECRET).update(corps).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(attendu);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const o = JSON.parse(Buffer.from(corps, "base64url").toString("utf8"));
    return o && o.t === type && o.exp && o.exp * 1000 > Date.now() ? o : null;
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

// Découverte OIDC gardée 10 minutes, une par application (panel, portail).
const decouvertes = new Map();
async function oidc(issuer = ISSUER) {
  const garde = decouvertes.get(issuer);
  if (garde && garde.exp > Date.now()) return garde;
  const d = await appel(`${issuer}.well-known/openid-configuration`);
  if (d.statut !== 200 || !d.json?.authorization_endpoint) throw new Error("Authentik ne répond pas.");
  const k = await appel(d.json.jwks_uri);
  const decouverte = { ...d.json, cles: k.json?.keys ?? [], exp: Date.now() + 10 * 60 * 1000 };
  decouvertes.set(issuer, decouverte);
  return decouverte;
}

function verifierJeton(idToken, d, nonce, { issuer, clientId } = PANEL_OIDC) {
  const [h, p, s] = idToken.split(".");
  const entete = JSON.parse(Buffer.from(h, "base64url").toString("utf8"));
  const charge = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
  if (entete.alg !== "RS256") throw new Error("algorithme inattendu");
  const jwk = d.cles.find((c) => c.kid === entete.kid) ?? d.cles[0];
  if (!jwk) throw new Error("clé introuvable");
  const ok = verifier("RSA-SHA256", Buffer.from(`${h}.${p}`), createPublicKey({ key: jwk, format: "jwk" }), Buffer.from(s, "base64url"));
  if (!ok) throw new Error("signature invalide");
  const aud = Array.isArray(charge.aud) ? charge.aud : [charge.aud];
  if (charge.iss !== issuer) throw new Error("émetteur inattendu");
  if (!aud.includes(clientId)) throw new Error("destinataire inattendu");
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
  "/theme.js": ["text/javascript; charset=utf-8", "theme.js"],
  "/icones.svg": ["image/svg+xml; charset=utf-8", "icones.svg"],
};
const polices = /^\/polices\/[a-z0-9-]+\.woff2$/;
const PREFIXE_PUBLIC = "/_plateforme";

// État d'un site (pause, démarre, inconnu), gardé 20 s : cette page est servie à n'importe
// qui sur internet, elle ne doit pas réveiller le moteur à chaque visite.
const etats = new Map();
async function etatDe(nom) {
  if (!/^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$/.test(nom)) return "inconnu";
  const garde = etats.get(nom);
  if (garde && garde.jusqua > Date.now()) return garde.etat;
  const r = await moteur("GET", `/etat/${nom}`, "page-pause");
  if (r.statut !== 200) throw new Error("moteur");
  const etat = JSON.parse(r.corps).etat;
  if (etats.size > 500) etats.clear();
  etats.set(nom, { etat, jusqua: Date.now() + 20000 });
  return etat;
}

async function pagePause(res, hote) {
  const nom = hote.split(".")[0];
  let etat = "inconnu";
  try {
    etat = await etatDe(nom);
  } catch {
    etat = "indisponible";
  }
  const textes = {
    pause: ["Ce RecipeLog est en pause", "Le site est mis en pause pour le moment. Les recettes et les données sont gardées : contacte RecipeLog pour le réactiver."],
    demarre: ["RecipeLog redémarre", "Une mise à jour est en cours. Cette page se recharge toute seule dans quelques secondes."],
    inconnu: ["Adresse inconnue", "Aucun RecipeLog n'existe à cette adresse. Vérifie l'adresse qu'on t'a donnée."],
    indisponible: ["Site indisponible pour le moment", "Réessaie dans une minute. Cette page se recharge toute seule."],
  }[etat];
  const recharge = etat === "demarre" || etat === "indisponible";
  res.writeHead(etat === "inconnu" ? 404 : 503, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...(recharge ? { Refresh: "10" } : {}) });
  res.end(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${echapper(textes[0])}</title><link rel="stylesheet" href="/panel.css"></head>
<body class="pause"><main class="carte-pause"><p class="marque">RecipeLog</p><h1>${echapper(textes[0])}</h1><p>${echapper(textes[1])}</p>
<p class="petit">${echapper(hote)}</p></main></body></html>`);
}

// Page de statut publique (status.<domaine>) : aucun nom de client, aucune connexion.
async function pageStatut(res) {
  let statut = null;
  try {
    const r = await moteur("GET", "/statut", "page-statut");
    statut = r.statut === 200 ? JSON.parse(r.corps) : null;
  } catch {
    statut = null;
  }
  const jours = [...Array(90)].map((_, i) => new Date(Date.now() - (89 - i) * 86400000).toISOString().slice(0, 10));
  const tousOk = statut?.composants.every((c) => c.ok);
  const dispo = (c) => {
    const minutes = jours.reduce((s, j) => s + (c.jours[j] ?? 0), 0);
    return (100 - (minutes / (90 * 1440)) * 100).toFixed(2).replace(".", ",");
  };
  const barres = (c) =>
    jours
      .map((j) => {
        const m = c.jours[j] ?? 0;
        const cl = m === 0 ? "ok" : m < 30 ? "pause" : "ko";
        const d = new Date(`${j}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
        return `<i class="${cl}" title="${d} : ${m === 0 ? "aucune panne" : `${m} min de panne`}"></i>`;
      })
      .join("");
  // Maintenances de tout le parc seulement (celle d'un seul client ne regarde que lui).
  const quand = (iso) => new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  const prevues = (statut?.maintenances ?? []).filter((m) => m.tous);
  const enMaintenance = prevues.some((m) => m.etat === "en-cours");
  const maintenances = prevues
    .map((m) => `<section class="composant maintenance-statut"><div class="composant-tete"><b>${m.etat === "en-cours" ? "Maintenance en cours" : "Maintenance prévue"}</b><span class="etiquette pause">${m.fin ? `${quand(m.debut)} → ${quand(m.fin)}` : `depuis le ${quand(m.debut)}`}</span></div><p>${echapper(m.message)}</p></section>`)
    .join("");
  const corps = statut
    ? statut.composants
        .map(
          (c) => `<section class="composant"><div class="composant-tete"><b>${echapper(c.nom)}</b><span class="etiquette ${c.ok ? "ok" : "ko"}">${c.ok ? "Fonctionne" : "Perturbé"}</span></div>
      <div class="barres">${barres(c)}</div><div class="barres-legende"><span class="l90">il y a 90 jours</span><span class="l30">il y a 30 jours</span><span>${dispo(c)} % disponible</span><span>aujourd'hui</span></div></section>`,
        )
        .join("")
    : `<p class="sub">État indisponible pour le moment.</p>`;
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", Refresh: "60" });
  res.end(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>État de RecipeLog</title><link rel="stylesheet" href="/panel.css"></head>
<body class="statut"><main class="page-statut"><p class="marque-statut">RecipeLog · état du service</p>
<div class="bandeau-statut ${!statut ? "pause" : enMaintenance ? "pause" : tousOk ? "ok" : "ko"}">${!statut ? "État indisponible" : enMaintenance ? "Maintenance en cours" : tousOk ? "Tout fonctionne normalement" : "Un service est perturbé : nous nous en occupons"}</div>
${maintenances}${corps}<p class="petit">Mis à jour ${new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })} · vérifié chaque minute</p></main></body></html>`);
}

// Tarifs et textes légaux (lot 8), sur <domaine>/tarifs, /cgv… (routeur Traefik « vente »).
async function pageLegale(res, nom) {
  let v = VENTE_DEFAUT;
  try {
    const r = await moteur("GET", "/vente", "page-vente");
    if (r.statut === 200) v = JSON.parse(r.corps);
  } catch {
    v = VENTE_DEFAUT;
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=60" });
  // Feuille de style servie sur le domaine lui-même (routeur Traefik « vente ») : le panel
  // peut ainsi être fermé par Cloudflare Access sans casser ces pages publiques.
  res.end(pageVente(nom, v, { domaine: DOMAINE, cssUrl: `${PREFIXE_PUBLIC}/panel.css` }));
}

function pageErreur(res, statut, titre, texte) {
  res.writeHead(statut, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  res.end(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${echapper(titre)}</title><link rel="stylesheet" href="/panel.css"></head><body class="pause"><main class="carte-pause">
<p class="marque">RecipeLog · panel</p><h1>${echapper(titre)}</h1><p>${echapper(texte)}</p><p><a class="btn" href="/auth/connexion">Se reconnecter</a></p></main></body></html>`);
}

// ------------------------------------------------------------ « Se connecter » (site vitrine)
// <domaine>/connexion → Authentik → <domaine>/connexion/retour → le RecipeLog de la personne.
// Aucune liste de clients n'est lue ni montrée : seulement les groupes « client-<nom> » du
// compte qui vient de se connecter (jeton signé par Authentik). L'adresse de destination est
// toujours fabriquée ici (https://<nom>.<domaine>/), jamais reprise d'un paramètre : pas de
// redirection ouverte. Le RecipeLog revérifie l'accès auprès d'Authentik (sans redemander
// le mot de passe, la session Authentik est déjà ouverte).
const NOM_CLIENT = /^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$/;
const CSS_PUBLIC = `${PREFIXE_PUBLIC}/panel.css`;

function pagePortail(res, statut, titre, contenu) {
  res.writeHead(statut, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self' data:; frame-ancestors 'none'; form-action 'none'",
    "Referrer-Policy": "no-referrer",
  });
  res.end(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${echapper(titre)} · RecipeLog</title><link rel="stylesheet" href="${CSS_PUBLIC}"></head>
<body class="pause"><main class="carte-pause portail"><p class="marque">RecipeLog</p><h1>${echapper(titre)}</h1>${contenu}
<p class="petit"><a href="/">Retour au site RecipeLog</a></p></main></body></html>`);
}
const recommencer = `<p><a class="btn principal" href="/connexion">Se connecter</a></p>`;

async function portail(req, res, hote, url) {
  // Toujours sur l'adresse principale : le cookie du flux et l'adresse de retour y sont liés.
  if (hote !== DOMAINE) {
    res.writeHead(302, { Location: `${URL_PORTAIL}/connexion` });
    return res.end();
  }
  if (!portailPret)
    return pagePortail(res, 503, "Connexion bientôt disponible", "<p>La connexion depuis ce site n'est pas encore ouverte. Utilise l'adresse de ton RecipeLog (par exemple <b>ton-nom.recipelog.cc</b>).</p>");
  const jar = cookies(req);
  try {
    if (url.pathname === "/connexion") {
      const d = await oidc(PORTAIL_OIDC.issuer);
      const flux = { state: b64u(randomBytes(24)), nonce: b64u(randomBytes(24)), verifier: b64u(randomBytes(32)), exp: Math.floor(Date.now() / 1000) + 600 };
      const vers = new URL(d.authorization_endpoint);
      Object.entries({
        response_type: "code",
        client_id: PORTAIL_OIDC.clientId,
        redirect_uri: `${URL_PORTAIL}/connexion/retour`,
        scope: "openid email profile",
        state: flux.state,
        nonce: flux.nonce,
        code_challenge: createHash("sha256").update(flux.verifier).digest("base64url"),
        code_challenge_method: "S256",
      }).forEach(([k, v]) => vers.searchParams.set(k, v));
      res.writeHead(302, { Location: vers.toString(), "Set-Cookie": cookie("rl_portail_flux", signer(flux, "portail-flux"), 600), "Cache-Control": "no-store" });
      return res.end();
    }
    if (url.pathname !== "/connexion/retour") {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Page introuvable.");
    }
    const flux = lire(jar.rl_portail_flux, "portail-flux");
    const effacer = cookie("rl_portail_flux", "", 0);
    res.setHeader("Set-Cookie", effacer);
    if (url.searchParams.get("error")) return pagePortail(res, 403, "Connexion annulée", `<p>La connexion n'a pas abouti.</p>${recommencer}`);
    if (!flux || flux.state !== url.searchParams.get("state")) return pagePortail(res, 400, "Connexion expirée", `<p>La page de connexion est restée ouverte trop longtemps. Recommence.</p>${recommencer}`);
    const d = await oidc(PORTAIL_OIDC.issuer);
    const corps = new URLSearchParams({ grant_type: "authorization_code", code: url.searchParams.get("code") ?? "", redirect_uri: `${URL_PORTAIL}/connexion/retour`, code_verifier: flux.verifier });
    const t = await appel(d.token_endpoint, {
      methode: "POST",
      corps: corps.toString(),
      entetes: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${Buffer.from(`${PORTAIL_OIDC.clientId}:${PORTAIL_OIDC.secret}`).toString("base64")}` },
    });
    if (t.statut !== 200 || !t.json?.id_token) return pagePortail(res, 400, "Connexion impossible", `<p>La connexion a échoué. Recommence.</p>${recommencer}`);
    const charge = verifierJeton(t.json.id_token, d, flux.nonce, PORTAIL_OIDC);
    const groupes = Array.isArray(charge.groups) ? charge.groups.map(String) : [];
    const sites = [...new Set(groupes.filter((g) => g.startsWith("client-")).map((g) => g.slice(7)).filter((n) => NOM_CLIENT.test(n)))].sort();
    const superAdmin = groupes.includes(GROUPE);
    const adresse = (nom) => `https://${nom}.${DOMAINE}/`;

    // Un seul RecipeLog : on y va directement.
    if (sites.length === 1 && !superAdmin) {
      res.writeHead(302, { Location: adresse(sites[0]), "Set-Cookie": effacer, "Cache-Control": "no-store" });
      return res.end();
    }
    const email = String(charge.email ?? "");
    const quitter = d.end_session_endpoint ? `<p class="petit">Connecté avec <b>${echapper(email)}</b>. <a href="${echapper(d.end_session_endpoint)}">Changer de compte</a></p>` : "";
    if (!sites.length && !superAdmin)
      return pagePortail(
        res,
        200,
        "Aucun RecipeLog pour ce compte",
        `<p>Ce compte n'a encore accès à aucun RecipeLog. Si ton établissement utilise RecipeLog, demande à ton responsable de t'inviter : tu recevras un email pour choisir ton mot de passe.</p>${quitter}`,
      );
    const liens = sites.map((n) => `<a class="btn principal site" href="${adresse(n)}"><b>${echapper(n)}</b><span>${echapper(n)}.${echapper(DOMAINE)}</span></a>`);
    if (superAdmin) liens.push(`<a class="btn site" href="${echapper(URL_PANEL)}/"><b>Panel admin</b><span>${echapper(HOTE_PANEL)}</span></a>`);
    return pagePortail(
      res,
      200,
      "Choisis ton RecipeLog",
      `<details class="aide-portail"><summary aria-label="Aide">?</summary><p>Ton compte a accès à plusieurs RecipeLog (par exemple deux établissements). Choisis celui que tu veux ouvrir. Tu pourras aussi y aller directement par son adresse, à garder dans tes favoris.</p></details>
<nav class="choix-sites" aria-label="Tes RecipeLog">${liens.join("")}</nav>${quitter}`,
    );
  } catch (e) {
    console.error("Connexion depuis le site vitrine :", e.message);
    return pagePortail(res, 503, "Connexion indisponible", `<p>Le service de connexion ne répond pas pour le moment. Réessaie dans une minute.</p>${recommencer}`);
  }
}

// ------------------------------------------------------------ serveur
createServer(async (req, res) => {
  const hote = (req.headers.host ?? "").toLowerCase().split(":")[0];
  try {
    let url;
    try {
      url = new URL(req.url, URL_PANEL);
    } catch {
      res.writeHead(400);
      return res.end();
    }
    // Fichiers communs (aussi utilisés par la page « en pause », la page de statut et les
    // pages de vente, où ils sont demandés sous /_plateforme/…).
    const chemin = url.pathname.startsWith(`${PREFIXE_PUBLIC}/`) ? url.pathname.slice(PREFIXE_PUBLIC.length) : url.pathname;
    if (req.method === "GET" && Object.hasOwn(fichiers, chemin)) {
      const [type, f] = fichiers[chemin];
      const contenu = await readFile(path.join(ICI, f)); // lu avant l'en-tête : une erreur donne une vraie page d'erreur
      res.writeHead(200, { "Content-Type": type, "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" });
      return res.end(contenu);
    }
    if (req.method === "GET" && polices.test(chemin)) {
      const contenu = await readFile(path.join(ICI, chemin)).catch(() => null);
      if (!contenu) {
        res.writeHead(404);
        return res.end();
      }
      res.writeHead(200, { "Content-Type": "font/woff2", "Cache-Control": "public, max-age=31536000", "Access-Control-Allow-Origin": "*" });
      return res.end(contenu);
    }
    if (url.pathname === "/sante") return res.end("ok");

    if (hote === `status.${DOMAINE}`) {
      if (req.method === "GET" && url.pathname === "/") return pageStatut(res);
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Page introuvable.");
    }
    if ((hote === DOMAINE || hote === `www.${DOMAINE}`) && req.method === "GET" && url.pathname.startsWith("/connexion")) return portail(req, res, hote, url);
    if ((hote === DOMAINE || hote === `www.${DOMAINE}`) && req.method === "GET" && Object.hasOwn(PAGES_VENTE, url.pathname.slice(1))) return pageLegale(res, url.pathname.slice(1));
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
      res.writeHead(302, { Location: vers.toString(), "Set-Cookie": cookie("rl_admin_flux", signer(flux, "flux"), 600) });
      return res.end();
    }
    if (url.pathname === "/auth/retour") {
      const flux = lire(jar.rl_admin_flux, "flux");
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
      const email = String(charge.email ?? "").toLowerCase();
      if (!email) return pageErreur(res, 403, "Accès refusé", "Ce compte n'a pas d'adresse email.");
      const session = { email, exp: Math.floor(Date.now() / 1000) + DUREE_SESSION };
      res.writeHead(302, { Location: "/", "Set-Cookie": [cookie("rl_admin", signer(session, "session"), DUREE_SESSION), cookie("rl_admin_flux", "", 0)] });
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
    // Une session = un cookie de type « session », avec une adresse email (jamais le cookie du flux).
    const lue = lire(jar.rl_admin, "session");
    const session = lue && typeof lue.email === "string" && lue.email ? lue : null;
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
      // Au fil de l'eau, en respectant le débit du navigateur (une grosse archive ne remplit pas la mémoire).
      try {
        await pipeline(Readable.fromWeb(r.body), res);
      } catch (e) {
        console.error("Téléchargement interrompu :", e.message);
        res.destroy();
      }
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      // Une page d'un autre site ne peut pas envoyer cet en-tête sans y être autorisée.
      if (req.method !== "GET" && req.headers["x-panel"] !== "1") {
        res.writeHead(403);
        return res.end();
      }
      const chemin = url.pathname.slice(4);
      const permis = /^\/(clients(\/[a-z0-9-]+\/[a-z-]+)?|taches\/[0-9a-f]{16}|journal|tous\/mettre-a-jour|vitrine(\/(maj|bandeau|traitee))?|mesures|annonces(\/[a-z-]+(\/[0-9a-f]{8})?)?|support(\/[a-z0-9-]+\/[0-9]{8}-[0-9]{6}-[0-9a-f]{4}\/[a-z]+)?|ia(\/quota)?|vente|alertes\/essai|plateforme(\/maj)?)$/;
      if (!permis.test(chemin)) {
        res.writeHead(404);
        return res.end();
      }
      let corps;
      if (req.method === "POST") {
        const m = [];
        for await (const x of req) m.push(x);
        try {
          corps = m.length ? JSON.parse(Buffer.concat(m).toString("utf8")) : {};
        } catch {
          res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          return res.end(JSON.stringify({ error: "refus", message: "Demande illisible." }));
        }
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
