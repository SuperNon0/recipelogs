// Surveillance (lot 5) : le moteur vérifie chaque minute que chaque site répond,
// note les pannes, prévient Noë (Discord par BotPanel, et la cloche du panel) et mesure la
// machine et les clients (processeur, mémoire, disque, usage).
import { appendFile, readFile, readdir, statfs, stat } from "node:fs/promises";
import os from "node:os";
import { notifier, reglages } from "./notifications.mjs";

const DONNEES = process.env.DONNEES || "/srv/recipelog";
const DOMAINE = process.env.DOMAINE || "recipelog.cc";
const EVENEMENTS = `${DONNEES}/surveillance.jsonl`;
const PANNE_APRES = 2; // vérifications ratées de suite (une par minute) avant de prévenir

// ------------------------------------------------------------ alertes
// Tout passe par notifications.mjs : Discord (BotPanel) et la cloche du panel.
// Plus d'email ni de Telegram pour Noë (quota Brevo gardé pour les clients).
export const alerter = (type, titre, texte, details) => notifier(type, titre, texte, details);

// Sans attendre : une alerte lente (BotPanel qui traîne) ne doit jamais retarder la surveillance.
const prevenir = (type, titre, texte, details) => void alerter(type, titre, texte, details).catch(() => {});

export const canauxAlerte = async () => {
  const r = await reglages().catch(() => ({ botpanel: "" }));
  return { discord: Boolean(r.botpanel), panel: true };
};

// Pour les notifications : nom court (« Accès depuis internet (Cloudflare et tunnel) » →
// « Accès depuis internet ») et sorte de cible.
const court = (nom) => String(nom).replace(/\s*\([^)]*\)\s*$/, "");
const genre = (cible) => (cible.startsWith("client:") ? "Client" : "Service");

// ------------------------------------------------------------ vérifications
// Le moteur n'est PAS sur le réseau des clients (un site piraté ne peut pas lui parler) :
// il lit l'état de santé que Docker calcule déjà pour chaque conteneur (contrôle toutes
// les 30 s). true = en forme, false = en panne, null = en train de démarrer (on attend).
const enForme = (etat) => (etat === "healthy" || etat === "running" ? true : etat === "starting" ? null : false);

// Services de la plateforme vérifiés en plus des clients (identifiant, nom affiché, conteneur).
const SERVICES = [
  ["connexion", "Connexion (Authentik)", "recipelog-authentik"],
  ["passerelle", "Passerelle", "recipelog-passerelle"],
  ["vitrine", "Site vitrine", "recipelog-vitrine"],
  ["base", "Base de données", "recipelog-postgres"],
  ["aiguilleur", "Aiguilleur (Traefik)", "recipelog-traefik"],
  ["pdf", "Fabrication des PDF", "recipelog-pdf"],
];
// Vu de l'extérieur : Cloudflare → tunnel → Traefik → panel. Sans ce contrôle, un tunnel
// tombé coupe tous les sites sans qu'aucune alerte ne parte.
const PUBLIC = process.env.SURVEILLANCE_PUBLIQUE === "oui" ? `https://status.${DOMAINE}/sante` : "";

async function repond(url, delai = 10000) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(delai), redirect: "manual" });
    return r.status < 500;
  } catch {
    return false;
  }
}

const etat = new Map(); // cible -> { ok, rates, depuis }

async function noterEvenement(cible, ok, extra = {}) {
  const ligne = { date: new Date().toISOString(), cible, ok, ...extra };
  await appendFile(EVENEMENTS, JSON.stringify(ligne) + "\n", { mode: 0o600 }).catch((e) => console.error("Surveillance :", e.message));
}

const duree = (ms) => {
  const m = Math.round(ms / 60000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
};

let initialise = false;
let jourAlerteDisque = null; // à part de `etat` : ce n'est pas une cible surveillée
const DEMARRE = Date.now();
const REPIT_MS = 4 * 60000; // après le démarrage du moteur (donc de la machine) : tout redémarre en même temps

/**
 * Un tour de vérification.
 * clients = liste --json ; conteneurs = { nom du conteneur: état Docker } ;
 * occupes(nom) = vrai si le moteur travaille sur ce client (mise à jour, restauration…) :
 * il redémarre exprès, ce n'est pas une panne.
 */
export async function verifier(clients, conteneurs, noter, occupes = () => false) {
  // Après un redémarrage du moteur : reprendre les pannes encore ouvertes.
  if (!initialise) {
    initialise = true;
    const dernier = new Map();
    for (const e of await evenements()) dernier.set(e.cible, e);
    for (const [cible, e] of dernier) if (!e.ok) etat.set(cible, { ok: false, rates: PANNE_APRES, depuis: Date.parse(e.date) });
  }
  const repit = Date.now() - DEMARRE < REPIT_MS;
  const cibles = [
    ...clients.filter((c) => !c.suspendu).map((c) => [`client:${c.nom}`, c.nom, () => (occupes(c.nom) ? null : enForme(conteneurs[`rl-${c.nom}`] ?? "absent"))]),
    ...SERVICES.map(([id, nom, conteneur]) => [`service:${id}`, nom, () => enForme(conteneurs[conteneur] ?? "absent")]),
    ...(PUBLIC ? [["service:acces", "Accès depuis internet (Cloudflare et tunnel)", () => repond(PUBLIC)]] : []),
  ];
  // Un client mis en pause ou supprimé n'est plus surveillé : sa panne en cours est close.
  for (const cible of etat.keys()) {
    if (!cibles.some(([c]) => c === cible)) {
      if (etat.get(cible).ok === false) await noterEvenement(cible, true, { raison: "plus surveillé" });
      etat.delete(cible);
    }
  }
  await Promise.all(
    cibles.map(async ([cible, nom, controle]) => {
      const ok = await controle();
      const e = etat.get(cible) ?? { ok: true, rates: 0, depuis: Date.now() };
      if (ok === null) return etat.set(cible, e); // démarre, ou le moteur travaille dessus : ni bon ni mauvais
      if (ok) {
        if (e.ok === false) {
          const panne = Date.now() - e.depuis;
          await noterEvenement(cible, true);
          prevenir("panne", `✅ ${court(nom)} est revenu`, `Panne de ${duree(panne)}.`, {
            niveau: "ok",
            champs: { qui: court(nom), genre: genre(cible), duree: duree(panne) },
          });
          await noter("automatique", "retour", nom, { ok: true, sortie: `Répond de nouveau après ${duree(panne)}.` });
          e.depuis = Date.now();
        }
        e.ok = true;
        e.rates = 0;
      } else if (!repit || e.ok === false) {
        e.rates += 1;
        if (e.ok !== false && e.rates >= PANNE_APRES) {
          e.ok = false;
          e.depuis = Date.now() - (PANNE_APRES - 1) * 60000;
          await noterEvenement(cible, false);
          const conseil = cible.startsWith("client:")
            ? `Panel → ${court(nom)} → Journaux, ou « Redémarrer ».`
            : cible === "service:acces"
              ? "Vérifie le tunnel dans Cloudflare, et dans la VM : `recipelog-plateforme ps`."
              : "Dans la VM : `recipelog-plateforme ps`.";
          prevenir("panne", `🔴 ${court(nom)} ne répond plus`, `Depuis ${PANNE_APRES} minutes. ${conseil}`, {
            champs: { qui: court(nom), genre: genre(cible), depuis: `${PANNE_APRES} min`, conseil },
          });
          await noter("automatique", "panne", nom, { ok: false, sortie: `Ne répond plus depuis ${PANNE_APRES} minutes.` });
        }
      }
      etat.set(cible, e);
    }),
  );
  // Disque : une alerte par jour au plus, dès 85 % (à 95 %, les sauvegardes s'arrêtent).
  const d = await disque();
  if (d && d.pourcent >= 85) {
    const jour = new Date().toISOString().slice(0, 10);
    if (jourAlerteDisque !== jour) {
      jourAlerteDisque = jour;
      prevenir(
        "disque",
        d.pourcent >= 95 ? `🔴 Disque plein à ${d.pourcent} %` : `💽 Disque presque plein (${d.pourcent} %)`,
        `${Math.round(d.libre / 1e9)} Go libres. ${d.pourcent >= 95 ? "Les sauvegardes sont arrêtées. " : ""}Agrandis le disque de la VM dans Proxmox, ou supprime de vieilles sauvegardes.`,
        {
          champs: {
            pourcent: `${d.pourcent} %`,
            libre: `${Math.round(d.libre / 1e9)} Go`,
            etat: d.pourcent >= 95 ? "🔴 Sauvegardes arrêtées" : "⚠️ Bientôt plein",
          },
        },
      );
    }
  }
}

/** État courant (pour le panel) : cible -> en ligne ou non, depuis quand. */
export const etatCourant = () =>
  Object.fromEntries([...etat].map(([k, v]) => [k, { ok: v.ok !== false, depuis: new Date(v.depuis).toISOString() }]));

// ------------------------------------------------------------ disponibilité
async function evenements() {
  try {
    // Ligne par ligne : une ligne abîmée (coupure pendant l'écriture) ne vide pas tout l'historique.
    return (await readFile(EVENEMENTS, "utf8")).split("\n").flatMap((l) => {
      try {
        return l.trim() ? [JSON.parse(l)] : [];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

/** Minutes de panne par cible et par jour (AAAA-MM-JJ), sur les `jours` derniers jours. */
export async function pannesParJour(jours = 90) {
  const debut = Date.now() - jours * 86400000;
  const ouvertes = new Map();
  const res = {}; // cible -> { jour -> minutes }
  const ajouter = (cible, de, a) => {
    for (let t = Math.max(de, debut); t < a; ) {
      const j = new Date(t).toISOString().slice(0, 10);
      const finJour = Date.parse(`${j}T00:00:00Z`) + 86400000;
      const fin = Math.min(a, finJour);
      res[cible] ??= {};
      res[cible][j] = (res[cible][j] ?? 0) + (fin - t) / 60000;
      t = fin;
    }
  };
  for (const e of await evenements()) {
    const t = Date.parse(e.date);
    if (!e.ok) ouvertes.set(e.cible, t);
    else if (ouvertes.has(e.cible)) {
      ajouter(e.cible, ouvertes.get(e.cible), t);
      ouvertes.delete(e.cible);
    }
  }
  for (const [cible, t] of ouvertes) ajouter(cible, t, Date.now());
  return res;
}

/** Disponibilité en % sur `jours` jours, par cible. */
export async function disponibilites(jours = 30) {
  const p = await pannesParJour(jours);
  const total = jours * 1440;
  return Object.fromEntries(Object.entries(p).map(([cible, j]) => [cible, Math.max(0, 100 - (Object.values(j).reduce((s, m) => s + m, 0) / total) * 100)]));
}

// ------------------------------------------------------------ mesures
export async function disque() {
  try {
    const s = await statfs(DONNEES);
    const total = s.blocks * s.bsize;
    const libre = s.bavail * s.bsize;
    return { total, libre, pourcent: Math.round(((total - libre) / total) * 100) };
  } catch {
    return null;
  }
}

/** Charge, mémoire et disque de la machine (le conteneur voit ceux de la VM). */
export async function machine() {
  let memoire = { total: os.totalmem(), libre: os.freemem() };
  try {
    // MemAvailable compte le cache que Linux rend dès qu'on en a besoin.
    const m = await readFile("/proc/meminfo", "utf8");
    const v = (k) => Number(m.match(new RegExp(`^${k}:\\s+(\\d+)`, "m"))?.[1] ?? 0) * 1024;
    memoire = { total: v("MemTotal"), libre: v("MemAvailable") };
  } catch {
    /* os.freemem suffit */
  }
  let demarre = null;
  try {
    demarre = new Date(Date.now() - Number((await readFile("/proc/uptime", "utf8")).split(" ")[0]) * 1000).toISOString();
  } catch {
    demarre = null;
  }
  return { coeurs: os.cpus().length, charge: os.loadavg(), memoire, disque: await disque(), demarre };
}

/**
 * Taille d'un dossier (octets), sans suivre les liens. Un fichier présent dans plusieurs
 * sauvegardes (lien vers le même contenu) n'est compté qu'une fois : c'est la place réelle.
 */
export async function taille(chemin) {
  let total = 0;
  const vus = new Set();
  const pile = [chemin];
  while (pile.length) {
    const d = pile.pop();
    let entrees = [];
    try {
      entrees = await readdir(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entrees) {
      const p = `${d}/${e.name}`;
      if (e.isDirectory()) pile.push(p);
      else if (e.isFile()) {
        const f = await stat(p).catch(() => null);
        if (!f) continue;
        if (f.nlink > 1) {
          const cle = `${f.dev}:${f.ino}`;
          if (vus.has(cle)) continue;
          vus.add(cle);
        }
        total += f.size;
      }
    }
  }
  return total;
}
