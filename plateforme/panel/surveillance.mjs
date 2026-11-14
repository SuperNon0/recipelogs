// Surveillance (lot 5) : le moteur vérifie chaque minute que chaque site répond,
// note les pannes, prévient Noë (Telegram, Discord et/ou email) et mesure la
// machine et les clients (processeur, mémoire, disque, usage).
import { appendFile, readFile, readdir, statfs, stat } from "node:fs/promises";
import os from "node:os";
import { courrielRegle, envoyerCourriel } from "./courriel.mjs";

const DONNEES = process.env.DONNEES || "/srv/recipelog";
const DOMAINE = process.env.DOMAINE || "recipelog.cc";
const EVENEMENTS = `${DONNEES}/surveillance.jsonl`;
const PANNE_APRES = 2; // vérifications ratées de suite (une par minute) avant de prévenir

// ------------------------------------------------------------ alertes
const ADMINS = (process.env.ADMIN_EMAILS || "").split(/[,;\s]+/).filter(Boolean);

/** Envoie une alerte par tous les canaux réglés. Ne lève jamais d'erreur. */
export async function alerter(titre, texte) {
  const essais = [];
  const tg = process.env.ALERTE_TELEGRAM_JETON;
  const chat = process.env.ALERTE_TELEGRAM_CHAT;
  if (tg && chat) {
    essais.push(
      fetch(`https://api.telegram.org/bot${tg}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chat, text: `${titre}\n${texte}`, disable_web_page_preview: true }),
        signal: AbortSignal.timeout(10000),
      }),
    );
  }
  if (process.env.ALERTE_DISCORD_URL) {
    essais.push(
      fetch(process.env.ALERTE_DISCORD_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: `**${titre}**\n${texte}`.slice(0, 1900) }),
        signal: AbortSignal.timeout(10000),
      }),
    );
  }
  if (process.env.ALERTE_EMAIL !== "non" && courrielRegle() && ADMINS.length) {
    essais.push(envoyerCourriel({ a: ADMINS, sujet: `[RecipeLog] ${titre}`, texte: `${texte}\n\nPanel : https://admin.${DOMAINE}` }));
  }
  const r = await Promise.allSettled(essais);
  for (const x of r) if (x.status === "rejected") console.error("Alerte non envoyée :", x.reason?.message ?? x.reason);
  return r.some((x) => x.status === "fulfilled");
}

export const canauxAlerte = () => ({
  telegram: Boolean(process.env.ALERTE_TELEGRAM_JETON && process.env.ALERTE_TELEGRAM_CHAT),
  discord: Boolean(process.env.ALERTE_DISCORD_URL),
  email: process.env.ALERTE_EMAIL !== "non" && courrielRegle() && ADMINS.length > 0,
});

// ------------------------------------------------------------ vérifications
async function repond(url, delai = 5000) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(delai), redirect: "manual" });
    return r.status < 500;
  } catch {
    return false;
  }
}

// Services de la plateforme vérifiés en plus des clients (nom affiché, adresse interne).
const SERVICES = [
  ["connexion", "Connexion (Authentik)", "http://recipelog-authentik:9000/-/health/live/"],
  ["passerelle", "Passerelle", "http://recipelog-passerelle:8000/sante"],
  ["vitrine", "Site vitrine", "http://recipelog-vitrine/config.js"],
];

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

/** Un tour de vérification. clients = liste --json (déjà lue par le moteur). */
export async function verifier(clients, noter) {
  // Après un redémarrage du moteur : reprendre les pannes encore ouvertes.
  if (!initialise) {
    initialise = true;
    const dernier = new Map();
    for (const e of await evenements()) dernier.set(e.cible, e);
    for (const [cible, e] of dernier) if (!e.ok) etat.set(cible, { ok: false, rates: PANNE_APRES, depuis: Date.parse(e.date) });
  }
  const cibles = [
    ...clients.filter((c) => !c.suspendu).map((c) => [`client:${c.nom}`, c.nom, `http://rl-${c.nom}:3000/api/health`]),
    ...SERVICES.map(([id, nom, url]) => [`service:${id}`, nom, url]),
  ];
  // Un client mis en pause ou supprimé n'est plus surveillé : sa panne en cours est close.
  for (const cible of etat.keys()) {
    if (!cibles.some(([c]) => c === cible)) {
      if (etat.get(cible).ok === false) await noterEvenement(cible, true, { raison: "plus surveillé" });
      etat.delete(cible);
    }
  }
  await Promise.all(
    cibles.map(async ([cible, nom, url]) => {
      const ok = await repond(url);
      const e = etat.get(cible) ?? { ok: true, rates: 0, depuis: Date.now() };
      if (ok) {
        if (e.ok === false) {
          const panne = Date.now() - e.depuis;
          await noterEvenement(cible, true);
          await alerter(`✅ ${nom} répond de nouveau`, `Panne de ${duree(panne)}.`);
          await noter("automatique", "retour", nom, { ok: true, sortie: `Répond de nouveau après ${duree(panne)}.` });
          e.depuis = Date.now();
        }
        e.ok = true;
        e.rates = 0;
      } else {
        e.rates += 1;
        if (e.ok !== false && e.rates >= PANNE_APRES) {
          e.ok = false;
          e.depuis = Date.now() - (PANNE_APRES - 1) * 60000;
          await noterEvenement(cible, false);
          const conseil = cible.startsWith("client:") ? `Panel → ${nom} → Journaux, ou « Mettre à jour » pour le relancer.` : "Dans la VM : recipelog-plateforme ps";
          await alerter(`🔴 ${nom} ne répond plus`, `Depuis ${PANNE_APRES} minutes. ${conseil}`);
          await noter("automatique", "panne", nom, { ok: false, sortie: `Ne répond plus depuis ${PANNE_APRES} minutes.` });
        }
      }
      etat.set(cible, e);
    }),
  );
  // Disque presque plein : une alerte par jour au plus.
  const d = await disque();
  if (d && d.pourcent >= 90) {
    const jour = new Date().toISOString().slice(0, 10);
    if (jourAlerteDisque !== jour) {
      jourAlerteDisque = jour;
      await alerter("⚠️ Disque presque plein", `${d.pourcent} % utilisés sur la machine (${Math.round(d.libre / 1e9)} Go libres).`);
    }
  }
}

/** État courant (pour le panel) : cible -> en ligne ou non, depuis quand. */
export const etatCourant = () =>
  Object.fromEntries([...etat].map(([k, v]) => [k, { ok: v.ok !== false, depuis: new Date(v.depuis).toISOString() }]));

// ------------------------------------------------------------ disponibilité
async function evenements() {
  try {
    return (await readFile(EVENEMENTS, "utf8"))
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
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

/** Taille d'un dossier (octets), sans suivre les liens. */
export async function taille(chemin) {
  let total = 0;
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
      else if (e.isFile()) total += (await stat(p).catch(() => ({ size: 0 }))).size;
    }
  }
  return total;
}
