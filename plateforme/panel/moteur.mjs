// Le moteur du panel : le SEUL service du panel qui pilote Docker.
// Il n'est joignable que sur le réseau Docker, par le panel, avec MOTEUR_CLE.
// Il ne fait rien lui-même : il lance recipelog-instance (le même outil qu'en
// ligne de commande) et la passerelle, puis note chaque action dans le journal.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { appendFile, chown, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { timingSafeEqual, randomBytes } from "node:crypto";
import { alerter, canauxAlerte, disponibilites, etatCourant, machine, pannesParJour, taille, verifier } from "./surveillance.mjs";
import { courrielRegle, envoyerCourriel } from "./courriel.mjs";
import { RefusIA, reglerQuota, resume as resumeIA } from "./ia.mjs";
import { RefusVente, lire as lireVente, manques as manquesVente, regler as reglerVente } from "./vente.mjs";
import { demarrer as demarrerPlateforme, etat as etatPlateforme } from "./plateforme.mjs";
import { RefusAnnonce, action as actionAnnonce, pourStatut, resume as resumeAnnonces, tour as tourAnnonces } from "./annonces.mjs";

const CLE = process.env.MOTEUR_CLE || "";
const DONNEES = process.env.DONNEES || "/srv/recipelog";
const JOURNAL = `${DONNEES}/journal-panel.jsonl`;
const OUTIL = "/opt/recipelog/bin/recipelog-instance";
const NOM_RE = /^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$/;
const SAUV_RE = /^[0-9]{8}-[0-9]{6}$/;
const SAUVEGARDES = `${DONNEES}/sauvegardes`;
// Heure des sauvegardes de la nuit (heure de Paris, TZ du conteneur) et jour du test (0 = dimanche).
const HEURE_SAUVEGARDE = Number(process.env.SAUVEGARDE_HEURE ?? 3);
const JOUR_TEST = Number(process.env.SAUVEGARDE_JOUR_TEST ?? 0);
const HEURE_DEMO = Number(process.env.DEMO_HEURE ?? 4); // remise à zéro des démos à HEURE_DEMO h 30
const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/;

if (CLE.length < 32) {
  console.error("MOTEUR_CLE manquante ou trop courte.");
  process.exit(1);
}

// ------------------------------------------------------------ commandes
const sansCouleurs = (t) => t.replace(/\x1b\[[0-9;]*m/g, "");

// Rend { ok, sortie, stdout } : `sortie` mélange tout (pour le journal), `stdout` ne garde
// que la sortie standard (pour lire du JSON sans les avertissements).
// `suivi(ligne)` reçoit la dernière ligne affichée, pour montrer où en est une action longue.
function lancer(cmd, args, delai = 2 * 60 * 1000, suivi = null) {
  return new Promise((ok) => {
    const p = spawn(cmd, args, { env: { ...process.env, DONNEES } });
    let sortie = "";
    let stdout = "";
    let depasse = false;
    const recu = (d, standard) => {
      sortie += d;
      if (sortie.length > 400000) sortie = sortie.slice(-200000);
      if (standard) stdout += d;
      if (suivi) {
        const l = sansCouleurs(String(d)).trim().split("\n").at(-1);
        if (l) suivi(l.slice(0, 300));
      }
    };
    p.stdout.on("data", (d) => recu(d, true));
    p.stderr.on("data", (d) => recu(d, false));
    const minuteur = setTimeout(() => {
      depasse = true;
      p.kill("SIGTERM");
      setTimeout(() => p.kill("SIGKILL"), 15000).unref();
    }, delai);
    p.on("close", (code) => {
      clearTimeout(minuteur);
      const texte = sansCouleurs(sortie).trim() + (depasse ? `\n⏱️ Arrêté : la commande a dépassé ${Math.round(delai / 60000)} minutes.` : "");
      ok({ ok: code === 0 && !depasse, sortie: texte.trim(), stdout: sansCouleurs(stdout).trim() });
    });
    p.on("error", (e) => {
      clearTimeout(minuteur);
      ok({ ok: false, sortie: String(e), stdout: "" });
    });
  });
}
// Lectures rapides (liste, sauvegardes…) : 2 minutes au plus.
const outil = (...args) => lancer(OUTIL, args);
// Actions qui peuvent durer (sauvegarde, restauration, mise à jour d'un gros client) : 6 heures au plus.
const outilLong = (args, suivi = null) => lancer(OUTIL, args, 6 * 3600 * 1000, suivi);
const passerelle = (...args) => lancer("docker", ["exec", "recipelog-passerelle", "node", "cli.mjs", ...args], 60 * 1000);

// Une seule action qui modifie à la fois : deux créations en même temps se
// marcheraient dessus (bases, Authentik).
// `clients` = le ou les clients touchés (« * » = tous) : pendant l'action et 3 minutes après,
// la surveillance ne les compte pas en panne (ils redémarrent exprès).
let file = Promise.resolve();
let enCours = null; // { quoi, client } de l'action qui tourne
const travail = new Map(); // client -> jusqu'à quand il est « occupé »
function unParUn(f, clients = null, quoi = "") {
  const noms = clients ? [clients].flat() : [];
  const g = async () => {
    enCours = { quoi, client: noms.join(", ") };
    for (const n of noms) travail.set(n, Infinity);
    try {
      return await f();
    } finally {
      enCours = null;
      listeCache = null;
      for (const n of noms) travail.set(n, Date.now() + 3 * 60000);
    }
  };
  const r = file.then(g, g);
  file = r.catch(() => {});
  return r;
}
const occupe = (nom) => [nom, "*"].some((k) => (travail.get(k) ?? 0) > Date.now());

// Les actions du panel ne font pas attendre le navigateur (Cloudflare coupe après 100 s) :
// elles rendent tout de suite un numéro de tâche, que le panel interroge (GET /taches/<id>).
// L'action continue et est notée dans le journal même si la page est fermée.
const taches = new Map();
const NOMS_ACTIONS = {
  "mettre-a-jour": "mise à jour",
  sauvegarder: "sauvegarde",
  restaurer: "restauration",
  "tester-sauvegarde": "test de sauvegarde",
  creer: "création",
  supprimer: "suppression",
  redemarrer: "redémarrage",
  suspendre: "mise en pause",
  reactiver: "réactivation",
  "plateforme-maj": "mise à jour de la plateforme",
};
function enTache(quoi, client, f) {
  const t = { id: randomBytes(8).toString("hex"), quoi, client, etat: "attente", etape: "", resultat: null, fin: 0 };
  taches.set(t.id, t);
  unParUn(
    () => {
      t.etat = "cours";
      return f((l) => (t.etape = l));
    },
    client,
    NOMS_ACTIONS[quoi] ?? quoi,
  )
    .catch((e) => {
      console.error(e);
      return { ok: false, sortie: String(e?.message ?? e) };
    })
    .then((r) => {
      t.etat = "fini";
      t.resultat = r;
      t.fin = Date.now();
    });
  for (const [id, x] of taches) if (x.fin && x.fin < Date.now() - 3600000) taches.delete(id);
  return { tache: t.id };
}
function etatTache(id) {
  const t = taches.get(id);
  if (!t) return null;
  if (t.etat === "fini") return { etat: "fini", ...t.resultat, stdout: undefined };
  const autre = t.etat === "attente" && enCours ? `${enCours.quoi}${enCours.client ? ` (${enCours.client === "*" ? "tous les clients" : enCours.client})` : ""}` : null;
  return { etat: t.etat, etape: t.etape, attend: autre };
}

async function noter(qui, action, client, r, details = {}) {
  const ligne = {
    date: new Date().toISOString(),
    qui,
    action,
    client,
    ok: r.ok,
    details,
    // Les 30 dernières lignes suffisent pour comprendre un échec.
    sortie: String(r.sortie ?? "").split("\n").slice(-30).join("\n"),
  };
  try {
    await appendFile(JOURNAL, JSON.stringify(ligne) + "\n", { mode: 0o600 });
  } catch (e) {
    console.error("Journal :", e.message);
  }
}

// ------------------------------------------------------------ lecture
// La liste des clients (recipelog-instance liste --json), gardée 15 s : le panel, la page
// « en pause » et la surveillance la demandent sans cesse. Vidée après chaque action.
let listeCache = null;
async function clientsBruts() {
  if (listeCache && listeCache.jusqua > Date.now()) return listeCache.valeur;
  const r = await outil("liste", "--json");
  if (!r.ok) throw new Error(r.sortie || "liste impossible");
  const valeur = JSON.parse(r.stdout || "[]");
  listeCache = { valeur, jusqua: Date.now() + 15000 };
  return valeur;
}

// État de tous les conteneurs en un seul appel à Docker : { nom: healthy | unhealthy |
// starting | running | exited… } et une clé qui change quand le conteneur est recréé ou relancé.
async function conteneurs() {
  const format = "{{.Name}}|{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}|{{.Image}}|{{.State.StartedAt}}";
  const r = await lancer("sh", ["-c", `ids=$(docker ps -aq) || exit 1; [ -z "$ids" ] || docker inspect --format '${format}' $ids`], 20000);
  const etats = {};
  const cles = {};
  for (const l of r.stdout.split("\n")) {
    const [n, statut, sante, image, debut] = l.split("|");
    if (!n || !statut) continue;
    const nom = n.replace(/^\//, "");
    etats[nom] = statut !== "running" ? statut : sante || "running";
    cles[nom] = `${image}|${debut}`;
  }
  return { ok: r.ok || Object.keys(etats).length > 0, etats, cles };
}

// Le moteur n'est pas sur le réseau des clients : il demande la version dans le conteneur
// lui-même, une seule fois tant que le conteneur n'a pas été relancé.
const versions = new Map(); // nom -> { cle, version }
const LIRE_VERSION = `fetch("http://127.0.0.1:3000/api/health").then((r) => r.json()).then((j) => process.stdout.write(String(j.version ?? "")))`;
async function versionDe(nom, cle) {
  const v = versions.get(nom);
  if (v && cle && v.cle === cle) return v.version;
  const r = await lancer("docker", ["exec", `rl-${nom}`, "node", "-e", LIRE_VERSION], 8000);
  const version = r.ok && r.stdout ? r.stdout.slice(0, 40) : null;
  if (version && cle) versions.set(nom, { cle, version });
  return version;
}

async function parPaquets(liste, n, f) {
  for (let i = 0; i < liste.length; i += n) await Promise.all(liste.slice(i, i + n).map(f));
}

async function clients() {
  const [bruts, resume, cont] = await Promise.all([clientsBruts(), passerelle("resume"), conteneurs()]);
  const tous = bruts.map((c) => ({ ...c }));
  let places = {};
  try {
    places = resume.ok ? JSON.parse(resume.stdout) : {};
  } catch {
    places = {};
  }
  await parPaquets(tous, 6, async (c) => {
    const etat = cont.etats[`rl-${c.nom}`];
    c.version = c.suspendu || (etat !== "healthy" && etat !== "running") ? null : await versionDe(c.nom, cont.cles[`rl-${c.nom}`]);
    c.places = places[c.nom] ?? null;
    c.sauvegarde = await resumeSauvegardes(c.nom);
    c.occupe = occupe(c.nom);
  });
  return tous;
}

// Dernière sauvegarde et dernier test, lus directement sur le disque.
async function resumeSauvegardes(nom) {
  const dossier = `${SAUVEGARDES}/${nom}`;
  let ids = [];
  try {
    ids = (await readdir(dossier)).filter((x) => SAUV_RE.test(x)).sort().reverse();
  } catch {
    return { nombre: 0, derniere: null, test: null };
  }
  let derniere = null;
  let test = null;
  try {
    derniere = ids[0] ? JSON.parse(await readFile(`${dossier}/${ids[0]}/infos.json`, "utf8")) : null;
  } catch {
    derniere = null;
  }
  try {
    test = JSON.parse(await readFile(`${dossier}/dernier-test.json`, "utf8"));
  } catch {
    test = null;
  }
  return { nombre: ids.length, derniere, test };
}

// Vitrine : demandes reçues par le formulaire, bandeau, version du code.
async function vitrine() {
  const r = await outil("vitrine", "demandes", "--json");
  let donnees = { demandes: [], traitees: [] };
  try {
    donnees = JSON.parse(r.stdout);
  } catch {
    /* pas encore de vitrine */
  }
  const lire = async (f) => (await readFile(`${DONNEES}/vitrine/${f}`, "utf8").catch(() => "")).trim();
  const traitees = new Set(donnees.traitees);
  return {
    version: (await lire("code/.version")) || null,
    bandeau: await lire("reglages/bandeau.txt"),
    demandes: donnees.demandes.reverse().map((d) => ({ ...d, cle: `${d.date}|${d.email}`, traitee: traitees.has(`${d.date}|${d.email}`) })),
  };
}

async function journal(n = 100) {
  try {
    // Ligne par ligne : une ligne abîmée (coupure pendant l'écriture) ne vide pas tout le journal.
    return (await readFile(JOURNAL, "utf8"))
      .split("\n")
      .flatMap((l) => {
        try {
          return l.trim() ? [JSON.parse(l)] : [];
        } catch {
          return [];
        }
      })
      .slice(-n)
      .reverse();
  } catch {
    return [];
  }
}

// ------------------------------------------------------------ santé et usage (lot 5)
const DOMAINE = process.env.DOMAINE || "recipelog.cc";
const CANAL_DEFAUT = process.env.CANAL_DEFAUT || "plateforme";
let santeCache = null;

const octets = (t) => {
  const m = String(t).trim().match(/^([\d.]+)\s*([KMGT]?i?B)$/i);
  if (!m) return null;
  const u = { B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12, KIB: 1024, MIB: 1024 ** 2, GIB: 1024 ** 3, TIB: 1024 ** 4 }[m[2].toUpperCase()] ?? 1;
  return Math.round(Number(m[1]) * u);
};

// Usage de l'appli d'un client, lu dans sa base (lecture seule).
async function usage(nom) {
  const db = `rl_${nom.replace(/-/g, "_")}`;
  const sql = `SELECT (SELECT count(*) FROM recipes), (SELECT count(*) FROM recipes WHERE updated_at > now() - interval '30 days'), (SELECT count(*) FROM accounts WHERE status = 'active'), (SELECT to_char(max(last_seen_at), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') FROM accounts), (SELECT count(*) FROM purchase_orders), pg_database_size(current_database())`;
  const r = await lancer("docker", ["exec", "recipelog-postgres", "psql", "-U", "postgres", "-d", db, "-tA", "-F", "|", "-c", sql], 20000);
  if (!r.ok) return null;
  const [recettes, recettes30, comptes, derniere, factures, base] = r.sortie.split("|");
  return { recettes: Number(recettes), recettes30: Number(recettes30), comptes: Number(comptes), derniereActivite: derniere || null, factures: Number(factures), base: Number(base) };
}

async function sante() {
  if (santeCache && santeCache.jusqua > Date.now()) return santeCache.valeur;
  const tous = await clientsBruts().catch(() => []);
  const stats = await lancer("docker", ["stats", "--no-stream", "--format", "{{json .}}"], 30000);
  const parConteneur = {};
  for (const l of stats.ok ? stats.sortie.split("\n") : []) {
    try {
      const j = JSON.parse(l);
      const [mem, max] = String(j.MemUsage).split("/");
      parConteneur[j.Name] = { cpu: Number.parseFloat(j.CPUPerc) || 0, memoire: octets(mem), memoireMax: octets(max) };
    } catch {
      /* ligne illisible */
    }
  }
  const clients = {};
  await Promise.all(
    tous.map(async (c) => {
      clients[c.nom] = {
        ...(parConteneur[`rl-${c.nom}`] ?? { cpu: null, memoire: null, memoireMax: null }),
        fichiers: await taille(`${DONNEES}/instances/${c.nom}/uploads`),
        sauvegardes: await taille(`${DONNEES}/sauvegardes/${c.nom}`),
        usage: await usage(c.nom),
      };
    }),
  );
  const plateforme = Object.entries(parConteneur)
    .filter(([n]) => !n.startsWith("rl-"))
    .reduce((s, [, v]) => ({ cpu: s.cpu + v.cpu, memoire: s.memoire + (v.memoire ?? 0) }), { cpu: 0, memoire: 0 });
  const valeur = {
    date: new Date().toISOString(),
    machine: await machine(),
    plateforme,
    clients,
    services: etatCourant(),
    disponibilite: await disponibilites(30),
    alertes: canauxAlerte(),
  };
  santeCache = { valeur, jusqua: Date.now() + 60000 };
  return valeur;
}

// Page de statut publique : par composant, minutes de panne par jour (90 jours), sans nom de client.
async function statutPublic() {
  const p = await pannesParJour(90);
  const fusion = (filtre) => {
    const jours = {};
    for (const [cible, j] of Object.entries(p)) if (filtre(cible)) for (const [d, m] of Object.entries(j)) jours[d] = Math.max(jours[d] ?? 0, Math.round(m));
    return jours;
  };
  const courant = etatCourant();
  const enPanne = (filtre) => Object.entries(courant).some(([c, v]) => filtre(c) && !v.ok);
  // Une panne de la base, de l'aiguilleur ou de l'accès depuis internet coupe aussi les sites.
  const sites = (c) => (c.startsWith("client:") && c !== "client:demo") || ["service:base", "service:aiguilleur", "service:acces"].includes(c);
  const composants = [
    ["Sites RecipeLog des clients", sites],
    ["Connexion", (c) => c === "service:connexion"],
    ["Site vitrine", (c) => c === "service:vitrine"],
    ["Démo en ligne", (c) => c === "client:demo"],
  ].map(([nom, f]) => ({ nom, ok: !enPanne(f), jours: fusion(f) }));
  return { date: new Date().toISOString(), composants };
}

// ------------------------------------------------------------ support (lot 5)
const SUPPORT = `${DONNEES}/support`;
const ID_TICKET = /^[0-9]{8}-[0-9]{6}-[0-9a-f]{4}$/;

async function tickets() {
  const tous = [];
  let clients = [];
  try {
    clients = (await readdir(SUPPORT, { withFileTypes: true })).filter((d) => d.isDirectory() && NOM_RE.test(d.name)).map((d) => d.name);
  } catch {
    return [];
  }
  for (const c of clients) {
    for (const f of (await readdir(`${SUPPORT}/${c}`).catch(() => [])).filter((n) => n.endsWith(".json"))) {
      try {
        tous.push(JSON.parse(await readFile(`${SUPPORT}/${c}/${f}`, "utf8")));
      } catch {
        /* en cours d'écriture */
      }
    }
  }
  return tous.sort((a, b) => String(b.maj).localeCompare(String(a.maj)));
}

async function ecrireTicket(t) {
  const f = `${SUPPORT}/${t.client}/${t.id}.json`;
  const tmp = `${f}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(tmp, JSON.stringify(t, null, 1), { mode: 0o644 });
  await chown(tmp, 1000, 1000).catch(() => {});
  await rename(tmp, f);
}

async function actionTicket(qui, nom, id, act, corps) {
  exiger(NOM_RE.test(nom) && ID_TICKET.test(id), "Demande inconnue.");
  let t;
  try {
    t = JSON.parse(await readFile(`${SUPPORT}/${nom}/${id}.json`, "utf8"));
  } catch {
    throw new Refus(404, "Demande introuvable.");
  }
  const date = new Date().toISOString();
  let courriel = null;
  switch (act) {
    case "repondre": {
      const texte = typeof corps.texte === "string" ? corps.texte.replace(/\r/g, "").trim().slice(0, 5000) : "";
      exiger(texte.length > 0, "La réponse est vide.");
      t.messages.push({ de: "support", qui, texte, date });
      t.statut = corps.fermer ? "ferme" : "repondu";
      t.luClient = false;
      t.luSupport = true;
      t.maj = date;
      courriel = texte;
      break;
    }
    case "fermer":
      t.statut = "ferme";
      t.luSupport = true;
      t.maj = date;
      break;
    case "rouvrir":
      t.statut = "ouvert";
      t.maj = date;
      break;
    case "lu":
      t.luSupport = true;
      break;
    case "note": {
      const texte = typeof corps.texte === "string" ? corps.texte.trim().slice(0, 2000) : "";
      t.notes = texte;
      break;
    }
    default:
      throw new Refus(404, "Action inconnue.");
  }
  await ecrireTicket(t);
  let envoi = null;
  if (courriel && courrielRegle()) {
    envoi = await envoyerCourriel({
      a: t.email,
      sujet: "RecipeLog : réponse à ta demande",
      texte: `Bonjour,\n\n${courriel}\n\n—\nRetrouve la conversation dans RecipeLog : https://${nom}.${DOMAINE}/settings/support\n(Réglages → Signaler un problème). Pour répondre, écris-y directement.`,
    })
      .then(() => "envoye")
      .catch((e) => {
        console.error("Réponse non envoyée par email :", e.message);
        return "echec";
      });
  }
  if (act !== "lu" && act !== "note") await noter(qui, `support-${act}`, nom, { ok: true, sortie: "" }, { demande: id, ...(envoi ? { courriel: envoi } : {}) });
  return { ok: true, demande: t, email: envoi };
}

// ------------------------------------------------------------ maintenance et messages (lot 6)
async function contexteAnnonces(qui) {
  const noms = (await clientsBruts().catch(() => [])).map((c) => c.nom);
  const equipe = async (nom) => {
    const r = await passerelle("equipe", nom);
    return r.ok ? (JSON.parse(r.stdout).membres ?? []) : null;
  };
  return { qui, clients: noms, equipe, noter, alerter };
}

// ------------------------------------------------------------ routes
class Refus extends Error {
  constructor(statut, message) {
    super(message);
    this.statut = statut;
  }
}
const exiger = (cond, message) => {
  if (!cond) throw new Refus(400, message);
};
const entier = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

async function action(qui, nom, act, corps) {
  exiger(NOM_RE.test(nom), "Nom de client invalide.");
  let details = {};
  let args; // action de recipelog-instance : passe par la file d'attente, rend un numéro de tâche
  switch (act) {
    case "mettre-a-jour":
    case "redemarrer":
    case "suspendre":
    case "demo-figer":
    case "demo-remettre":
    case "tester-sauvegarde":
      args = [act, nom];
      break;
    case "reactiver":
      args = ["reactiver", nom];
      // Essai terminé : on le prolonge de N jours, ou (sans `essai`) le client devient un client normal.
      if (corps.essai !== undefined && corps.essai !== null && corps.essai !== 0) {
        exiger(entier(corps.essai, 1, 3650), "Durée d'essai invalide.");
        details = { essai: corps.essai };
        args.push("--essai", String(corps.essai));
      }
      break;
    case "quota":
      exiger(entier(corps.max, 0, 10000), "Nombre de places invalide.");
      details = { max: corps.max };
      args = ["quota", nom, String(corps.max)];
      break;
    case "options":
      exiger(typeof corps.mcp === "boolean", "Option MCP manquante.");
      details = { mcp: corps.mcp };
      args = ["options", nom, "--mcp", corps.mcp ? "oui" : "non"];
      break;
    case "essai":
      exiger(entier(corps.jours, 0, 3650), "Durée d'essai invalide.");
      details = { jours: corps.jours };
      args = ["essai", nom, String(corps.jours)];
      break;
    case "inviter":
    case "renvoyer":
    case "retirer": {
      exiger(EMAIL_RE.test(corps.email ?? ""), "Adresse email invalide.");
      const email = corps.email.trim().toLowerCase();
      details = { email };
      const r = await passerelle(act, nom, email);
      await noter(qui, act, nom, r, details);
      return r;
    }
    case "sauvegarder":
      args = ["sauvegarder", nom, "--etiquette", "manuelle"];
      break;
    case "restaurer":
      exiger(SAUV_RE.test(corps.sauvegarde ?? ""), "Sauvegarde inconnue.");
      exiger(corps.confirmation === nom, "Tape le nom du client pour confirmer.");
      details = { sauvegarde: corps.sauvegarde };
      args = ["restaurer", nom, corps.sauvegarde, "--oui"];
      break;
    case "supprimer":
      exiger(corps.confirmation === nom, "Tape le nom du client pour confirmer.");
      args = ["supprimer", nom, "--oui"];
      break;
    default:
      throw new Refus(404, "Action inconnue.");
  }
  return enTache(act, nom, async (suivi) => {
    const r = await outilLong(args, suivi);
    await noter(qui, act, nom, r, details);
    return r;
  });
}

function creer(qui, c) {
  exiger(NOM_RE.test(c.nom ?? ""), "Nom invalide : 2 à 32 caractères, minuscules, chiffres et tirets.");
  exiger(!c.responsable || EMAIL_RE.test(c.responsable), "Adresse du responsable invalide.");
  exiger(entier(c.max ?? 0, 0, 10000), "Nombre de places invalide.");
  exiger(entier(c.essai ?? 0, 0, 3650), "Durée d'essai invalide.");
  const canal = c.canal ?? CANAL_DEFAUT;
  exiger(["stable", "beta", "plateforme"].includes(canal), "Canal inconnu.");
  const args = ["creer", c.nom, "--canal", canal, "--max", String(c.max ?? 0)];
  if (c.responsable) args.push("--responsable", c.responsable.trim().toLowerCase());
  if (c.essai) args.push("--essai", String(c.essai));
  if (c.mcp === false) args.push("--sans-mcp");
  return enTache("creer", c.nom, async (suivi) => {
    const r = await outilLong(args, suivi);
    await noter(qui, "creer", c.nom, r, { responsable: c.responsable || null, max: c.max || null, essai: c.essai || null, canal, mcp: c.mcp !== false });
    return r;
  });
}

// « Tout mettre à jour » : client après client. Au premier qui rate (il est remis tout seul
// sur sa version d'avant), on s'arrête : les suivants gardent leur version.
function toutMettreAJour(qui) {
  return enTache("mettre-a-jour", "*", async (suivi) => {
    const noms = (await clientsBruts()).map((c) => c.nom);
    let sortie = "";
    let ok = true;
    for (const [i, nom] of noms.entries()) {
      suivi(`${nom} (${i + 1} sur ${noms.length})…`);
      const r = await outilLong(["mettre-a-jour", nom, "--lot"], (l) => suivi(`${nom} (${i + 1} sur ${noms.length}) : ${l}`));
      sortie += `${r.sortie}\n`;
      if (!r.ok) {
        ok = false;
        const reste = noms.slice(i + 1);
        sortie += `Arrêt après l'échec de ${nom}.${reste.length ? ` Pas mis à jour : ${reste.join(", ")}.` : ""}\n`;
        break;
      }
    }
    await outilLong(["menage"]);
    const r = { ok, sortie: sortie.trim() };
    await noter(qui, "mettre-a-jour", "tous", r);
    return r;
  });
}

async function lireCorps(req) {
  const morceaux = [];
  let taille = 0;
  for await (const m of req) {
    taille += m.length;
    if (taille > 64 * 1024) throw new Refus(413, "Trop gros.");
    morceaux.push(m);
  }
  if (!morceaux.length) return {};
  try {
    return JSON.parse(Buffer.concat(morceaux).toString("utf8"));
  } catch {
    throw new Refus(400, "JSON invalide.");
  }
}

function cleOk(req) {
  const donnee = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(donnee);
  const b = Buffer.from(CLE);
  return a.length === b.length && timingSafeEqual(a, b);
}

const repondre = (res, statut, corps) => {
  res.writeHead(statut, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(corps));
};

createServer(async (req, res) => {
  let url;
  let morceaux;
  try {
    // Dans le « try » : une adresse mal écrite (%zz) rend une erreur 400 au lieu d'arrêter le moteur.
    try {
      url = new URL(req.url, "http://moteur");
      morceaux = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    } catch {
      return repondre(res, 400, { error: "refus", message: "Adresse invalide." });
    }
    if (url.pathname === "/sante") return repondre(res, 200, { ok: true });
    if (!cleOk(req)) return repondre(res, 401, { error: "cle_invalide" });
    const qui = String(req.headers["x-qui"] ?? "inconnu").slice(0, 254);

    // Rend 202 + un numéro de tâche pour les actions passées par la file d'attente.
    const rendre = (r) => (r.tache ? repondre(res, 202, r) : repondre(res, r.ok ? 200 : 500, { ok: r.ok, sortie: r.sortie }));

    if (req.method === "GET" && url.pathname === "/clients") return repondre(res, 200, { clients: await clients(), canal: CANAL_DEFAUT });
    if (req.method === "GET" && morceaux[0] === "taches" && morceaux.length === 2) {
      const t = etatTache(morceaux[1]);
      return t ? repondre(res, 200, t) : repondre(res, 404, { error: "refus", message: "Action introuvable : le moteur a redémarré. Regarde le journal pour savoir si elle a abouti." });
    }
    // Pour la page « en pause / redémarre / adresse inconnue » : rien d'autre que l'état.
    if (req.method === "GET" && morceaux[0] === "etat" && morceaux.length === 2) {
      const c = NOM_RE.test(morceaux[1]) ? (await clientsBruts()).find((x) => x.nom === morceaux[1]) : null;
      return repondre(res, 200, { etat: !c ? "inconnu" : c.suspendu ? "pause" : "demarre" });
    }
    if (req.method === "GET" && url.pathname === "/journal") return repondre(res, 200, { journal: await journal() });
    if (req.method === "GET" && morceaux[0] === "clients" && morceaux[2] === "equipe" && morceaux.length === 3) {
      exiger(NOM_RE.test(morceaux[1]), "Nom de client invalide.");
      const r = await passerelle("equipe", morceaux[1]);
      if (!r.ok) return repondre(res, 502, { error: "passerelle", message: r.sortie });
      return repondre(res, 200, JSON.parse(r.stdout));
    }
    if (req.method === "GET" && morceaux[0] === "clients" && morceaux[2] === "sauvegardes" && morceaux.length === 3) {
      exiger(NOM_RE.test(morceaux[1]), "Nom de client invalide.");
      const r = await outil("sauvegardes", morceaux[1], "--json");
      if (!r.ok) return repondre(res, 500, { error: "sauvegardes", message: r.sortie });
      return repondre(res, 200, JSON.parse(r.stdout));
    }
    // Téléchargement : archive .tar.gz envoyée au fil de l'eau (base + fichiers, sans mots de passe).
    if (req.method === "GET" && morceaux[0] === "clients" && morceaux[2] === "sauvegardes" && morceaux[4] === "export" && morceaux.length === 5) {
      const [, nom, , id] = morceaux;
      exiger(NOM_RE.test(nom) && SAUV_RE.test(id), "Sauvegarde inconnue.");
      try {
        await readFile(`${SAUVEGARDES}/${nom}/${id}/infos.json`);
      } catch {
        return repondre(res, 404, { error: "introuvable" });
      }
      await noter(qui, "telecharger", nom, { ok: true, sortie: "" }, { sauvegarde: id });
      res.writeHead(200, {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="recipelog-${nom}-${id}.tar.gz"`,
      });
      const p = spawn(OUTIL, ["exporter", nom, id], { env: { ...process.env, DONNEES } });
      p.stdout.pipe(res);
      p.stderr.on("data", (d) => console.error("export :", String(d).trim()));
      p.on("error", (e) => {
        console.error("export :", e.message);
        res.destroy();
      });
      // Une archive coupée en route ne doit pas passer pour complète : on casse la connexion.
      p.on("close", (code) => {
        if (code !== 0) res.destroy();
      });
      res.on("close", () => p.kill("SIGTERM"));
      return;
    }
    if (req.method === "GET" && url.pathname === "/vitrine") return repondre(res, 200, await vitrine());
    if (req.method === "GET" && url.pathname === "/mesures") return repondre(res, 200, await sante());
    if (req.method === "GET" && url.pathname === "/statut") return repondre(res, 200, { ...(await statutPublic()), maintenances: await pourStatut() });
    if (req.method === "GET" && url.pathname === "/annonces") return repondre(res, 200, await resumeAnnonces());
    if (req.method === "POST" && morceaux[0] === "annonces" && morceaux.length >= 2 && morceaux.length <= 3) {
      try {
        const corps = await lireCorps(req);
        return repondre(res, 200, await actionAnnonce(morceaux[1], morceaux[2] ?? null, corps, await contexteAnnonces(qui)));
      } catch (e) {
        if (e instanceof RefusAnnonce) throw new Refus(e.statut, e.message);
        throw e;
      }
    }
    // Lecture des factures par IA (lot 7) : quotas par client et lectures du mois.
    if (req.method === "GET" && url.pathname === "/ia") return repondre(res, 200, await resumeIA(DONNEES));
    if (req.method === "POST" && url.pathname === "/ia/quota") {
      const corps = await lireCorps(req);
      try {
        await reglerQuota(DONNEES, corps);
      } catch (e) {
        if (e instanceof RefusIA) throw new Refus(400, e.message);
        throw e;
      }
      await noter(qui, "ia-quota", corps.client === "*" ? "tous" : corps.client, { ok: true, sortie: "" }, { limite: corps.limite });
      return repondre(res, 200, await resumeIA(DONNEES));
    }
    // Vente (lot 8) : identité de l'éditeur, offres et prix, pages publiques.
    if (req.method === "GET" && url.pathname === "/vente") {
      const v = await lireVente(DONNEES);
      return repondre(res, 200, { ...v, manques: manquesVente(v) });
    }
    if (req.method === "POST" && url.pathname === "/vente") {
      const corps = await lireCorps(req);
      let v;
      try {
        v = await reglerVente(DONNEES, corps);
      } catch (e) {
        if (e instanceof RefusVente) throw new Refus(400, e.message);
        throw e;
      }
      await noter(qui, "vente", "vitrine", { ok: true, sortie: "" }, { publie: v.publie, offres: v.offres.length });
      return repondre(res, 200, v);
    }
    if (req.method === "GET" && url.pathname === "/support") return repondre(res, 200, { demandes: await tickets() });
    if (req.method === "POST" && morceaux[0] === "support" && morceaux.length === 4) {
      return repondre(res, 200, await actionTicket(qui, morceaux[1], morceaux[2], morceaux[3], await lireCorps(req)));
    }
    if (req.method === "POST" && url.pathname === "/alertes/essai") {
      const r = await alerter("🔔 Essai d'alerte RecipeLog", `Envoyé depuis le panel par ${qui}. Si tu lis ceci, les alertes marchent.`);
      const noms = { telegram: "Telegram", discord: "Discord", email: "Email" };
      const lignes = Object.entries(r.canaux).map(([k, v]) => `${noms[k]} : ${v === null ? "pas réglé" : v === true ? "envoyé ✅" : `échec ❌ (${v})`}`);
      if (!r.ok) lignes.push("Aucun canal n'a marché (voir A-FAIRE.md, étape F).");
      await noter(qui, "alerte-essai", "-", { ok: r.ok, sortie: lignes.join("\n") });
      return repondre(res, r.ok ? 200 : 500, { ok: r.ok, canaux: r.canaux, sortie: lignes.join("\n") });
    }
    if (req.method === "GET" && morceaux[0] === "clients" && morceaux[2] === "journaux" && morceaux.length === 3) {
      exiger(NOM_RE.test(morceaux[1]), "Nom de client invalide.");
      const r = await lancer("docker", ["logs", "--tail", "300", "--timestamps", `rl-${morceaux[1]}`], 15000);
      return repondre(res, 200, { ok: r.ok, lignes: r.sortie });
    }
    if (req.method === "POST" && url.pathname === "/vitrine/maj") {
      return rendre(
        enTache("mise à jour de la vitrine", null, async (suivi) => {
          const r = await outilLong(["vitrine", "maj"], suivi);
          await noter(qui, "vitrine-maj", "vitrine", r);
          return r;
        }),
      );
    }
    if (req.method === "POST" && url.pathname === "/vitrine/bandeau") {
      const c = await lireCorps(req);
      exiger(typeof c.texte === "string" && c.texte.length <= 300 && !/[\r\n]/.test(c.texte), "Bandeau : une ligne, 300 caractères au plus.");
      return rendre(
        enTache("bandeau de la vitrine", null, async () => {
          const r = await outilLong(["vitrine", "bandeau", c.texte.trim()]);
          await noter(qui, "vitrine-bandeau", "vitrine", r, { texte: c.texte.trim() || null });
          return r;
        }),
      );
    }
    if (req.method === "POST" && url.pathname === "/vitrine/traitee") {
      const c = await lireCorps(req);
      exiger(typeof c.cle === "string" && c.cle.length < 300, "Demande inconnue.");
      return rendre(enTache("demande de la vitrine", null, () => outilLong(["vitrine", "traitee", c.cle])));
    }
    if (req.method === "POST" && url.pathname === "/clients") return rendre(creer(qui, await lireCorps(req)));
    if (req.method === "POST" && url.pathname === "/tous/mettre-a-jour") return rendre(toutMettreAJour(qui));
    // Mise à jour de la plateforme elle-même (plateforme.mjs) : lancée sur la machine, hors de Docker.
    if (req.method === "GET" && url.pathname === "/plateforme") return repondre(res, 200, await etatPlateforme());
    if (req.method === "POST" && url.pathname === "/plateforme/maj") {
      const r = await demarrerPlateforme(lancer);
      await noter(qui, "plateforme-maj", "plateforme", r);
      return repondre(res, r.ok ? 200 : 500, { ok: r.ok, sortie: r.sortie });
    }
    if (req.method === "POST" && morceaux[0] === "clients" && morceaux.length === 3) {
      return rendre(await action(qui, morceaux[1], morceaux[2], await lireCorps(req)));
    }
    return repondre(res, 404, { error: "introuvable" });
  } catch (e) {
    const statut = e instanceof Refus ? e.statut : 500;
    if (statut === 500) console.error(e);
    return repondre(res, statut, { error: "refus", message: e.message });
  }
}).listen(8000, () => console.log("Moteur du panel sur le port 8000."));

// Toutes les heures : les essais terminés passent en pause.
async function essais() {
  const r = await unParUn(() => outilLong(["verifier-essais"]), null, "fin des essais");
  if (r.sortie) await noter("automatique", "fin-essai", "-", r);
}
setTimeout(() => essais().catch((e) => console.error("Essais :", e.message)), 60 * 1000);
setInterval(() => essais().catch((e) => console.error("Essais :", e.message)), 60 * 60 * 1000);

// Chaque nuit à HEURE_SAUVEGARDE : sauvegarde de chaque client, puis de la plateforme
// (comptes et réglages). Une fois par semaine (JOUR_TEST), une heure après : test de restauration.
// Le planning est gardé sur le disque pour ne pas refaire (ou rater) une sauvegarde quand
// le moteur redémarre. Une nuit n'est marquée « faite » que si TOUT a réussi : sinon, nouvel
// essai une heure plus tard (3 essais au plus), et une alerte part.
const PLANNING = `${SAUVEGARDES}/planning.json`;
const PLATEFORME = "_plateforme";
const jourDe = (d) => d.toLocaleDateString("sv-SE"); // AAAA-MM-JJ, heure locale
async function ecrirePlanning(fait) {
  const tmp = `${PLANNING}.tmp`;
  await writeFile(tmp, JSON.stringify(fait), { mode: 0o600 })
    .then(() => rename(tmp, PLANNING))
    .catch((e) => console.error("Planning :", e.message));
}
const fin = (r) => r.sortie.split("\n").slice(-3).join(" / ").slice(0, 400);

async function tourPlanning() {
  await mkdir(SAUVEGARDES, { recursive: true, mode: 0o700 }).catch(() => {});
  let fait = {};
  try {
    fait = JSON.parse(await readFile(PLANNING, "utf8"));
  } catch {
    fait = {};
  }
  const maintenant = new Date();
  const aujourdhui = jourDe(maintenant);
  const heure = maintenant.getHours();

  // --- sauvegardes de la nuit
  const s = fait.essais?.jour === aujourdhui ? fait.essais : { jour: aujourdhui, n: 0, dernier: 0, rates: null };
  if (heure >= HEURE_SAUVEGARDE && fait.sauvegarde !== aujourdhui && s.n < 3 && Date.now() - s.dernier > 55 * 60000) {
    s.n += 1;
    s.dernier = Date.now();
    fait.essais = s;
    await ecrirePlanning(fait);
    const noms = (await clientsBruts()).filter((c) => !c.demo).map((c) => c.nom); // la démo a sa référence (demo-figer)
    // Au 2e et 3e essai : seulement ce qui a raté.
    const cibles = s.rates ? s.rates.filter((n) => n === PLATEFORME || noms.includes(n)) : [...noms, PLATEFORME];
    const rates = [];
    const lignes = [];
    for (const nom of cibles) {
      const args = nom === PLATEFORME ? ["sauvegarder-plateforme"] : ["sauvegarder", nom, "--etiquette", "auto"];
      const r = await unParUn(() => outilLong(args), null, "sauvegardes de la nuit");
      if (r.ok) lignes.push(`✅ ${nom === PLATEFORME ? "plateforme (comptes et réglages)" : nom}`);
      else {
        rates.push(nom);
        lignes.push(`❌ ${nom === PLATEFORME ? "plateforme (comptes et réglages)" : nom} : ${fin(r)}`);
      }
    }
    s.rates = rates;
    if (!rates.length) fait.sauvegarde = aujourdhui;
    await ecrirePlanning(fait);
    await noter("automatique", "sauvegardes-nuit", "tous", { ok: !rates.length, sortie: lignes.join("\n") }, { essai: s.n });
    if (rates.length) {
      const suite = s.n < 3 ? "Nouvel essai dans une heure." : "Trois essais ratés cette nuit : regarde le journal du panel (souvent : disque plein).";
      void alerter("🔴 Sauvegarde de la nuit ratée", `Pas sauvegardé : ${rates.map((n) => (n === PLATEFORME ? "la plateforme" : n)).join(", ")}. ${suite}`);
    }
  }

  // --- contrôle du matin : chaque client a-t-il une sauvegarde de moins de 36 heures ?
  if (heure >= HEURE_SAUVEGARDE + 4 && fait.controle !== aujourdhui) {
    fait.controle = aujourdhui;
    await ecrirePlanning(fait);
    const vieux = [];
    for (const c of (await clientsBruts()).filter((x) => !x.demo)) {
      const d = (await resumeSauvegardes(c.nom)).derniere?.date;
      if (!d || Date.now() - Date.parse(d) > 36 * 3600000) vieux.push(c.nom);
    }
    if (vieux.length) {
      await noter("automatique", "sauvegardes-controle", "tous", { ok: false, sortie: `Pas de sauvegarde depuis plus de 36 heures : ${vieux.join(", ")}.` });
      void alerter("🔴 Clients sans sauvegarde récente", `Pas de sauvegarde depuis plus de 36 heures : ${vieux.join(", ")}. Regarde le journal du panel.`);
    }
  }

  // --- démos : retour à leur état de référence chaque nuit (4 h 30 par défaut).
  const minutes = heure * 60 + maintenant.getMinutes();
  // Premier démarrage du moteur : pas de remise à zéro surprise en pleine journée.
  if (fait.demo === undefined) {
    fait.demo = aujourdhui;
    await ecrirePlanning(fait);
  }
  if (minutes >= HEURE_DEMO * 60 + 30 && fait.demo !== aujourdhui) {
    fait.demo = aujourdhui;
    await ecrirePlanning(fait);
    const demos = (await clientsBruts()).filter((c) => c.demo).map((c) => c.nom);
    const r = await unParUn(() => outilLong(["demo-remettre", "--toutes"]), demos, "remise à zéro des démos");
    if (r.sortie) await noter("automatique", "demo-remettre", "démos", r);
    if (!r.ok) void alerter("⚠️ Démo non remise à zéro", fin(r));
  }

  // --- test de restauration de la semaine
  if (maintenant.getDay() === JOUR_TEST && heure >= HEURE_SAUVEGARDE + 1 && fait.test !== aujourdhui) {
    fait.test = aujourdhui;
    await ecrirePlanning(fait);
    const noms = (await clientsBruts()).filter((c) => !c.demo).map((c) => c.nom);
    const rates = [];
    const lignes = [];
    for (const nom of [...noms, PLATEFORME]) {
      const r = await unParUn(() => outilLong(["tester-sauvegarde", nom]), null, "test des sauvegardes");
      const affiche = nom === PLATEFORME ? "plateforme (comptes et réglages)" : nom;
      if (r.ok) lignes.push(`✅ ${affiche}`);
      else {
        rates.push(affiche);
        lignes.push(`❌ ${affiche} : ${fin(r)}`);
      }
    }
    await noter("automatique", "test-sauvegardes", "tous", { ok: !rates.length, sortie: lignes.join("\n") });
    if (rates.length) void alerter("🔴 Test de restauration raté", `Ces sauvegardes ne se restaurent pas : ${rates.join(", ")}. Regarde le journal du panel.`);
  }
}
// Un seul tour à la fois : des sauvegardes longues (plus de 5 minutes) ne se chevauchent pas.
let planningEnCours = false;
async function planning() {
  if (planningEnCours) return;
  planningEnCours = true;
  try {
    await tourPlanning();
  } catch (e) {
    console.error("Planning :", e.message);
  } finally {
    planningEnCours = false;
  }
}
setTimeout(planning, 2 * 60 * 1000);
setInterval(planning, 5 * 60 * 1000);

// Chaque minute : chaque site et service est-il en forme ? Nouvelles demandes de support ?
const ticketsVus = new Set();
let ticketsInitialises = false;
let surveillanceEnCours = false;
async function surveiller() {
  if (surveillanceEnCours) return;
  surveillanceEnCours = true;
  try {
    const [liste, cont] = await Promise.all([clientsBruts(), conteneurs()]);
    // Docker ne répond pas : on ne déclare pas tout le monde en panne sur un état illisible.
    if (cont.ok) await verifier(liste, cont.etats, noter, occupe);
    else console.error("Surveillance : Docker ne répond pas.");
  } catch (e) {
    console.error("Surveillance :", e.message);
  }
  try {
    await tourAnnonces(await contexteAnnonces("automatique"));
  } catch (e) {
    console.error("Maintenance :", e.message);
  }
  try {
    const nouveaux = (await tickets()).filter((t) => !t.luSupport && !ticketsVus.has(`${t.id}:${t.messages.length}`));
    for (const t of nouveaux) {
      ticketsVus.add(`${t.id}:${t.messages.length}`);
      if (!ticketsInitialises) continue; // au démarrage : pas de rafale pour les anciennes
      const dernier = t.messages.at(-1);
      void alerter(`📩 ${t.messages.length > 1 ? "Nouveau message" : "Nouvelle demande"} de ${t.client}`, `${t.email} : ${String(dernier?.texte ?? "").slice(0, 300)}`);
    }
    ticketsInitialises = true;
  } catch (e) {
    console.error("Support :", e.message);
  }
  surveillanceEnCours = false;
}
// Une erreur oubliée quelque part ne doit jamais arrêter le moteur (donc les sauvegardes de la nuit).
process.on("unhandledRejection", (e) => console.error("Erreur non rattrapée :", e));
await mkdir(SUPPORT, { recursive: true }).catch(() => {});
await mkdir(`${DONNEES}/annonces`, { recursive: true }).catch(() => {});
await mkdir(`${DONNEES}/ia/usage`, { recursive: true }).then(() => chown(`${DONNEES}/ia/usage`, 1000, 1000)).catch(() => {});
await chown(`${DONNEES}/ia`, 1000, 1000).catch(() => {});
await chown(SUPPORT, 1000, 1000).catch(() => {});
setTimeout(surveiller, 30 * 1000);
setInterval(surveiller, 60 * 1000);
