/*
 * RecipeLog : démarrage rapide (service worker).
 *
 * Quand l'iPhone ferme l'appli posée sur l'écran d'accueil, tout était
 * retéléchargé au lancement suivant. Ce fichier garde sur le téléphone :
 *
 * 1. L'interface : le code (/_next/static, fichiers à nom unique, jamais
 *    modifiés), les polices, les icônes et le design « encre ».
 * 2. La page d'accueil « / » telle qu'elle a été affichée la dernière fois.
 *    Au lancement, elle s'affiche tout de suite ; en même temps, la vraie page
 *    est redemandée au serveur. La page affichée est ensuite rafraîchie avec
 *    les données à jour (src/components/DemarrageRapide.tsx). Si la session est
 *    finie (redirection vers la connexion, 401, 403), la copie est effacée et
 *    l'appli recharge : on repasse par la connexion comme avant.
 *    Si le site a changé de version, son nouveau code est téléchargé en
 *    arrière-plan avant de recharger, pour que ce soit rapide.
 *
 * Jamais gardé : /api (dont /api/mcp), /auth, /acces, /share, /uploads, les
 * redirections, les pages en erreur, et toutes les autres pages (elles passent
 * par le réseau comme avant). Aller sur /auth/… (déconnexion) efface la copie.
 *
 * Changer VERSION quand ce fichier change de logique : les anciennes copies
 * sont alors effacées.
 */
const VERSION = "1";
const STATIQUE = `rl-statique-v${VERSION}`;
const PAGES = `rl-pages-v${VERSION}`;
const ACCUEIL = "/";
const MAX_STATIQUE = 400;
const MAX_AGE_ACCUEIL = 7 * 24 * 3600 * 1000;
const EN_TETE_BUILD = "x-recipelog-build";
const EN_TETE_GARDE = "x-recipelog-garde-le";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const noms = await caches.keys();
      await Promise.all(
        noms.filter((n) => n.startsWith("rl-") && n !== STATIQUE && n !== PAGES).map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

/** Fichiers de l'interface, à nom unique : jamais modifiés une fois publiés. */
function estCodeFige(chemin) {
  return chemin.startsWith("/_next/static/");
}

/** Fichiers de l'interface au nom fixe : servis tout de suite, puis revérifiés. */
function estFichierInterface(chemin) {
  return (
    chemin.startsWith("/encre/") ||
    chemin.startsWith("/polices/") ||
    chemin.startsWith("/icons/") ||
    chemin === "/icon.svg" ||
    chemin === "/favicon.ico" ||
    chemin === "/manifest.webmanifest"
  );
}

/** Chemins de connexion : y aller efface la copie de l'accueil. */
function estConnexion(chemin) {
  return chemin.startsWith("/auth/") || chemin.startsWith("/outpost.goauthentik.io/") || chemin.startsWith("/cdn-cgi/access/");
}

/** Réponse bonne à garder : 200, du site lui-même, sans redirection. */
function gardable(r) {
  return r && r.status === 200 && r.type === "basic" && !r.redirected;
}

async function rogner(cache) {
  const cles = await cache.keys();
  const trop = cles.length - MAX_STATIQUE;
  for (let i = 0; i < trop; i++) await cache.delete(cles[i]);
}

async function garderStatique(requete, reponse) {
  const cache = await caches.open(STATIQUE);
  await cache.put(requete, reponse);
  await rogner(cache);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.headers.has("range")) return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const chemin = url.pathname;

  if (req.mode === "navigate") {
    if (estConnexion(chemin)) {
      event.waitUntil(caches.delete(PAGES));
      return; // réseau, comme avant
    }
    if (chemin === ACCUEIL && !url.search) event.respondWith(accueil(event));
    return; // toutes les autres pages : réseau, comme avant
  }

  if (estCodeFige(chemin)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIQUE);
        const deja = await cache.match(req);
        if (deja) return deja;
        const r = await fetch(req);
        if (gardable(r)) event.waitUntil(garderStatique(req, r.clone()));
        return r;
      })(),
    );
    return;
  }

  if (estFichierInterface(chemin)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIQUE);
        const deja = await cache.match(req);
        const frais = fetch(req)
          .then((r) => {
            if (gardable(r)) return garderStatique(req, r.clone()).then(() => r);
            return r;
          })
          .catch(() => undefined);
        if (deja) {
          event.waitUntil(frais);
          return deja;
        }
        return (await frais) || Response.error();
      })(),
    );
  }
});

/* ---------- Page d'accueil ---------- */

/** Dernier lancement servi depuis la copie : la page demande ensuite le résultat. */
let lancement = null;
/** Demande de la vraie page en cours (un rechargement juste après l'attend). */
let enCours = null;

/** Redemande la vraie page d'accueil, sans suivre les redirections (connexion). */
async function redemanderAccueil() {
  const r = await fetch(ACCUEIL, {
    credentials: "include",
    redirect: "manual",
    cache: "no-store",
    headers: { accept: "text/html" },
  });
  const html = r.headers.get("content-type") || "";
  if (r.type === "opaqueredirect" || r.status === 401 || r.status === 403 || (r.ok && !html.includes("text/html"))) {
    await caches.delete(PAGES);
    return { etat: "deconnecte", reponse: null };
  }
  if (!gardable(r)) return { etat: "erreur", reponse: r };
  await garderAccueil(r.clone());
  return { etat: "ok", reponse: r };
}

async function garderAccueil(r) {
  const corps = await r.blob();
  const entetes = new Headers(r.headers);
  entetes.set(EN_TETE_GARDE, String(Date.now()));
  const cache = await caches.open(PAGES);
  await cache.put(ACCUEIL, new Response(corps, { status: 200, headers: entetes }));
}

/** Nouveau code d'une nouvelle version : téléchargé avant de recharger. */
async function prechargerCode(reponse) {
  try {
    const html = await reponse.text();
    const urls = [...new Set(html.match(/\/_next\/static\/[^"'\s)\\<>]+/g) || [])].slice(0, 120);
    const cache = await caches.open(STATIQUE);
    await Promise.all(
      urls.map(async (u) => {
        if (await cache.match(u)) return;
        try {
          const r = await fetch(u, { credentials: "include" });
          if (gardable(r)) await cache.put(u, r);
        } catch {
          /* tant pis, il viendra au rechargement */
        }
      }),
    );
    await rogner(cache);
  } catch {
    /* rien de grave */
  }
}

async function accueil(event) {
  // Un rechargement pendant que la vraie page arrive : on l'attend.
  if (enCours) {
    try {
      const { reponse } = await enCours;
      if (reponse) {
        const copie = await caches.open(PAGES).then((c) => c.match(ACCUEIL));
        if (copie) return copie;
      }
    } catch {
      /* on passe au réseau */
    }
    return fetch(event.request);
  }

  const cache = await caches.open(PAGES);
  const copie = await cache.match(ACCUEIL);
  const age = copie ? Date.now() - Number(copie.headers.get(EN_TETE_GARDE) || 0) : Infinity;

  if (!copie || age > MAX_AGE_ACCUEIL) {
    // Pas de copie (ou trop vieille) : réseau, comme avant, et on la garde.
    if (copie) await cache.delete(ACCUEIL);
    const r = await fetch(event.request);
    if (gardable(r) && (r.headers.get("content-type") || "").includes("text/html")) {
      event.waitUntil(garderAccueil(r.clone()));
    }
    return r;
  }

  const buildCopie = copie.headers.get(EN_TETE_BUILD) || "";
  const demande = redemanderAccueil();
  enCours = demande;
  const resultat = demande
    .then(async ({ etat, reponse }) => {
      if (etat !== "ok") return etat === "deconnecte" ? "deconnecte" : "hors-ligne";
      const build = reponse.headers.get(EN_TETE_BUILD) || "";
      if (build && buildCopie && build !== buildCopie) {
        await prechargerCode(reponse);
        return "nouvelle-version";
      }
      return "a-jour";
    })
    .catch(() => "hors-ligne")
    .finally(() => {
      if (enCours === demande) enCours = null;
    });
  lancement = { quand: Date.now(), resultat };
  event.waitUntil(resultat);
  return copie;
}

/* La page (DemarrageRapide) demande si elle vient de la copie et quoi faire. */
self.addEventListener("message", (event) => {
  const msg = event.data || {};
  const repondre = (data) => event.source && event.source.postMessage({ type: "recipelog-demarrage", ...data });
  if (msg.type === "etat") {
    const l = lancement;
    if (!l || Date.now() - l.quand > 60_000 || msg.chemin !== ACCUEIL) {
      repondre({ copie: false });
      return;
    }
    lancement = null; // une seule réponse par lancement
    event.waitUntil(l.resultat.then((resultat) => repondre({ copie: true, resultat })));
  } else if (msg.type === "oublier") {
    event.waitUntil(caches.delete(PAGES));
  }
});
