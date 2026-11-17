// ============================================================
// Service PDF de la plateforme RecipeLog : un seul Chromium pour tous les clients.
//
// Chaque site client envoie sa page déjà prête (POST /pdf, en JSON : html, format,
// en-tête et pied de page) et reçoit le PDF. Avant, chaque site lançait son propre
// Chromium (300 à 500 Mo de plus pendant chaque PDF).
//
// Isolement entre clients :
//  - chaque demande s'ouvre dans un contexte de navigation neuf (comme une fenêtre de
//    navigation privée), fermé juste après : rien ne reste d'un client à l'autre ;
//  - la page ne peut rien charger sur le réseau : seules les adresses data: passent
//    (les polices sont déjà intégrées par l'appli). Une page piégée ne peut donc
//    joindre ni la base, ni un autre client, ni internet ;
//  - le JavaScript des pages est coupé (les PDF de RecipeLog n'en ont pas besoin).
// Le service n'a aucun accès aux données des clients : il ne voit que la page envoyée.
//
// Charge : 2 PDF à la fois, 30 en attente au plus, 2 minutes au plus par PDF.
// ============================================================
import { createServer } from "node:http";
import puppeteer from "puppeteer-core";

const PORT = Number(process.env.PORT || 3000);
const CHROMIUM = process.env.CHROMIUM || "/usr/bin/chromium";
const EN_MEME_TEMPS = Math.max(1, Number(process.env.PDF_EN_MEME_TEMPS || 2));
const ATTENTE_MAX = Number(process.env.PDF_ATTENTE_MAX || 30);
const DUREE_MAX_MS = Number(process.env.PDF_DUREE_MAX_MS || 120_000);
const CORPS_MAX = 40 * 1024 * 1024; // une page avec ses polices et images intégrées
const INACTIF_MS = 5 * 60_000; // Chromium fermé après 5 min sans PDF (mémoire rendue)
const RELANCE_APRES = 200; // Chromium relancé tous les 200 PDF (évite les fuites de mémoire)

const FORMATS = new Set(["A4", "A5"]);
const journal = (...m) => console.log(new Date().toISOString(), ...m);

// ------------------------------------------------------------ Chromium partagé
let navigateur = null; // Promise<Browser> | null
let rendus = 0;
let minuterie = null;

function lancerNavigateur() {
  const p = puppeteer.launch({
    executablePath: CHROMIUM,
    headless: true,
    // Pas de bac à sable Chromium dans un conteneur sans privilèges : c'est le conteneur
    // (lecture seule, sans droits, mémoire limitée) et le blocage réseau qui isolent.
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-sync",
      "--metrics-recording-only",
      "--mute-audio",
    ],
  });
  p.then(
    (b) =>
      b.on("disconnected", () => {
        if (navigateur === p) navigateur = null;
        journal("Chromium arrêté (il sera relancé au prochain PDF).");
      }),
    (e) => {
      if (navigateur === p) navigateur = null;
      journal("Chromium ne démarre pas :", e.message);
    },
  );
  return p;
}

async function obtenirNavigateur() {
  clearTimeout(minuterie);
  if (navigateur && rendus >= RELANCE_APRES && enCours === 0) {
    const ancien = navigateur;
    navigateur = null;
    rendus = 0;
    ancien.then((b) => b.close()).catch(() => {});
  }
  navigateur ??= lancerNavigateur();
  return navigateur;
}

function fermerPlusTard() {
  clearTimeout(minuterie);
  minuterie = setTimeout(() => {
    if (enCours > 0 || !navigateur) return;
    const b = navigateur;
    navigateur = null;
    rendus = 0;
    b.then((x) => x.close()).catch(() => {});
  }, INACTIF_MS);
  minuterie.unref?.();
}

// ------------------------------------------------------------ file d'attente
let enCours = 0;
const file = [];

function passerSonTour() {
  return new Promise((ok, non) => {
    if (enCours < EN_MEME_TEMPS) {
      enCours++;
      return ok();
    }
    if (file.length >= ATTENTE_MAX) return non(new Refus(503, "Trop de PDF en attente : réessaie dans une minute."));
    file.push(ok);
  });
}
function finirSonTour() {
  const suivant = file.shift();
  if (suivant) suivant();
  else enCours--;
}

class Refus extends Error {
  constructor(statut, message) {
    super(message);
    this.statut = statut;
  }
}

// ------------------------------------------------------------ rendu
const texte = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");

async function rendre(demande) {
  const html = demande.html;
  if (typeof html !== "string" || !html) throw new Refus(400, "Page vide.");
  const format = FORMATS.has(demande.format) ? demande.format : "A4";
  const enTete = texte(demande.enTete, 20_000);
  const piedDePage = texte(demande.piedDePage, 20_000);
  const bandeaux = demande.bandeaux === true;

  await passerSonTour();
  const debut = Date.now();
  let contexte = null;
  try {
    const b = await obtenirNavigateur();
    contexte = await b.createBrowserContext();
    const page = await contexte.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on("request", (r) => {
      const u = r.url();
      if (u.startsWith("data:") || u === "about:blank") r.continue().catch(() => {});
      else r.abort("blockedbyclient").catch(() => {});
    });
    const travail = (async () => {
      await page.setContent(html, { waitUntil: "load", timeout: DUREE_MAX_MS });
      // Les polices intégrées sont prêtes une fois la page chargée ; cette attente
      // reste courte même si une police ne se charge pas.
      await page.evaluate(() => document.fonts.ready.then(() => undefined)).catch(() => undefined);
      return page.pdf({
        format,
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: bandeaux,
        headerTemplate: enTete || '<span style="display:none"></span>',
        footerTemplate: piedDePage || '<span style="display:none"></span>',
        timeout: DUREE_MAX_MS,
      });
    })();
    let minuteur;
    const delai = new Promise((_, non) => {
      minuteur = setTimeout(() => non(new Refus(504, "Le PDF a pris trop de temps (plus de 2 minutes).")), DUREE_MAX_MS);
    });
    try {
      const pdf = await Promise.race([travail, delai]);
      rendus++;
      return { pdf, duree: Date.now() - debut };
    } finally {
      clearTimeout(minuteur);
    }
  } finally {
    // Fermer le contexte efface tout ce que la page a pu laisser (cache, stockage).
    if (contexte) await contexte.close().catch(() => {});
    finirSonTour();
    fermerPlusTard();
  }
}

// ------------------------------------------------------------ serveur
async function lireCorps(req) {
  let taille = 0;
  const morceaux = [];
  for await (const m of req) {
    taille += m.length;
    if (taille > CORPS_MAX) throw new Refus(413, "Page trop lourde pour un PDF (40 Mo au plus).");
    morceaux.push(m);
  }
  try {
    return JSON.parse(Buffer.concat(morceaux).toString("utf8"));
  } catch {
    throw new Refus(400, "Demande illisible.");
  }
}

function repondre(res, statut, objet) {
  res.writeHead(statut, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(objet));
}

const serveur = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/sante") {
      return repondre(res, 200, { ok: true, enCours, enAttente: file.length, chromium: !!navigateur });
    }
    if (req.method !== "POST" || req.url !== "/pdf") return repondre(res, 404, { error: "Adresse inconnue." });
    const client = texte(req.headers["x-recipelog-client"], 40).replace(/[^a-z0-9-]/g, "") || "?";
    const demande = await lireCorps(req);
    const { pdf, duree } = await rendre(demande);
    journal(`PDF pour ${client} : ${Math.round(pdf.length / 1024)} Ko en ${duree} ms.`);
    res.writeHead(200, { "Content-Type": "application/pdf", "Content-Length": pdf.length, "Cache-Control": "no-store" });
    res.end(pdf);
  } catch (e) {
    const statut = e instanceof Refus ? e.statut : 500;
    if (statut >= 500) journal("PDF raté :", e.message);
    if (res.headersSent) return res.destroy();
    repondre(res, statut, { error: e instanceof Refus ? e.message : "Le PDF n'a pas pu être fabriqué." });
  }
});
serveur.requestTimeout = DUREE_MAX_MS + 60_000;
serveur.listen(PORT, () => journal(`Service PDF sur le port ${PORT} (${EN_MEME_TEMPS} à la fois).`));

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, async () => {
    serveur.close();
    if (navigateur) await navigateur.then((b) => b.close()).catch(() => {});
    process.exit(0);
  });
}
