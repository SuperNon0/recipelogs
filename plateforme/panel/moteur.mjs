// Le moteur du panel : le SEUL service du panel qui pilote Docker.
// Il n'est joignable que sur le réseau Docker, par le panel, avec MOTEUR_CLE.
// Il ne fait rien lui-même : il lance recipelog-instance (le même outil qu'en
// ligne de commande) et la passerelle, puis note chaque action dans le journal.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { timingSafeEqual } from "node:crypto";

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
const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/;

if (CLE.length < 32) {
  console.error("MOTEUR_CLE manquante ou trop courte.");
  process.exit(1);
}

// ------------------------------------------------------------ commandes
const sansCouleurs = (t) => t.replace(/\x1b\[[0-9;]*m/g, "");

function lancer(cmd, args, delai = 15 * 60 * 1000) {
  return new Promise((ok) => {
    const p = spawn(cmd, args, { env: { ...process.env, DONNEES } });
    let sortie = "";
    p.stdout.on("data", (d) => (sortie += d));
    p.stderr.on("data", (d) => (sortie += d));
    const minuteur = setTimeout(() => p.kill("SIGTERM"), delai);
    p.on("close", (code) => {
      clearTimeout(minuteur);
      ok({ ok: code === 0, sortie: sansCouleurs(sortie).trim() });
    });
    p.on("error", (e) => {
      clearTimeout(minuteur);
      ok({ ok: false, sortie: String(e) });
    });
  });
}
const outil = (...args) => lancer(OUTIL, args);
const passerelle = (...args) => lancer("docker", ["exec", "recipelog-passerelle", "node", "cli.mjs", ...args], 60 * 1000);

// Une seule action qui modifie à la fois : deux créations en même temps se
// marcheraient dessus (bases, Authentik).
let file = Promise.resolve();
function unParUn(f) {
  const r = file.then(f, f);
  file = r.catch(() => {});
  return r;
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
    sortie: r.sortie.split("\n").slice(-30).join("\n"),
  };
  try {
    await appendFile(JOURNAL, JSON.stringify(ligne) + "\n", { mode: 0o600 });
  } catch (e) {
    console.error("Journal :", e.message);
  }
}

// ------------------------------------------------------------ lecture
async function versionDe(nom) {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 2500);
    const r = await fetch(`http://rl-${nom}:3000/api/health`, { signal: c.signal });
    clearTimeout(t);
    const j = await r.json();
    return j.version ?? null;
  } catch {
    return null;
  }
}

async function clients() {
  const [liste, resume] = await Promise.all([outil("liste", "--json"), passerelle("resume")]);
  if (!liste.ok) throw new Error(liste.sortie || "liste impossible");
  const tous = JSON.parse(liste.sortie || "[]");
  let places = {};
  try {
    places = resume.ok ? JSON.parse(resume.sortie) : {};
  } catch {
    places = {};
  }
  await Promise.all(
    tous.map(async (c) => {
      c.version = c.suspendu ? null : await versionDe(c.nom);
      c.places = places[c.nom] ?? null;
      c.sauvegarde = await resumeSauvegardes(c.nom);
    }),
  );
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

async function journal(n = 100) {
  try {
    const lignes = (await readFile(JOURNAL, "utf8")).trim().split("\n").filter(Boolean);
    return lignes.slice(-n).reverse().map((l) => JSON.parse(l));
  } catch {
    return [];
  }
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
  let r;
  let details = {};
  switch (act) {
    case "mettre-a-jour":
    case "redemarrer":
    case "suspendre":
    case "reactiver":
      r = await unParUn(() => outil(act, nom));
      break;
    case "quota":
      exiger(entier(corps.max, 0, 10000), "Nombre de places invalide.");
      details = { max: corps.max };
      r = await unParUn(() => outil("quota", nom, String(corps.max)));
      break;
    case "options":
      exiger(typeof corps.mcp === "boolean", "Option MCP manquante.");
      details = { mcp: corps.mcp };
      r = await unParUn(() => outil("options", nom, "--mcp", corps.mcp ? "oui" : "non"));
      break;
    case "essai":
      exiger(entier(corps.jours, 0, 3650), "Durée d'essai invalide.");
      details = { jours: corps.jours };
      r = await unParUn(() => outil("essai", nom, String(corps.jours)));
      break;
    case "inviter":
      exiger(EMAIL_RE.test(corps.email ?? ""), "Adresse email invalide.");
      details = { email: corps.email };
      r = await passerelle("inviter", nom, corps.email.trim().toLowerCase());
      break;
    case "renvoyer":
    case "retirer":
      exiger(EMAIL_RE.test(corps.email ?? ""), "Adresse email invalide.");
      details = { email: corps.email };
      r = await passerelle(act, nom, corps.email);
      break;
    case "sauvegarder":
      r = await unParUn(() => outil("sauvegarder", nom, "--etiquette", "manuelle"));
      break;
    case "tester-sauvegarde":
      r = await unParUn(() => outil("tester-sauvegarde", nom));
      break;
    case "restaurer":
      exiger(SAUV_RE.test(corps.sauvegarde ?? ""), "Sauvegarde inconnue.");
      exiger(corps.confirmation === nom, "Tape le nom du client pour confirmer.");
      details = { sauvegarde: corps.sauvegarde };
      r = await unParUn(() => outil("restaurer", nom, corps.sauvegarde, "--oui"));
      break;
    case "supprimer":
      exiger(corps.confirmation === nom, "Tape le nom du client pour confirmer.");
      r = await unParUn(() => outil("supprimer", nom, "--oui"));
      break;
    default:
      throw new Refus(404, "Action inconnue.");
  }
  await noter(qui, act, nom, r, details);
  return r;
}

async function creer(qui, c) {
  exiger(NOM_RE.test(c.nom ?? ""), "Nom invalide : 2 à 32 caractères, minuscules, chiffres et tirets.");
  exiger(!c.responsable || EMAIL_RE.test(c.responsable), "Adresse du responsable invalide.");
  exiger(entier(c.max ?? 0, 0, 10000), "Nombre de places invalide.");
  exiger(entier(c.essai ?? 0, 0, 3650), "Durée d'essai invalide.");
  exiger(["stable", "beta", "plateforme"].includes(c.canal ?? "stable"), "Canal inconnu.");
  const args = ["creer", c.nom, "--canal", c.canal ?? "stable", "--max", String(c.max ?? 0)];
  if (c.responsable) args.push("--responsable", c.responsable.trim().toLowerCase());
  if (c.essai) args.push("--essai", String(c.essai));
  if (c.mcp === false) args.push("--sans-mcp");
  const r = await unParUn(() => outil(...args));
  await noter(qui, "creer", c.nom, r, { responsable: c.responsable || null, max: c.max || null, essai: c.essai || null, canal: c.canal ?? "stable", mcp: c.mcp !== false });
  return r;
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
  const url = new URL(req.url, "http://moteur");
  const morceaux = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  try {
    if (url.pathname === "/sante") return repondre(res, 200, { ok: true });
    if (!cleOk(req)) return repondre(res, 401, { error: "cle_invalide" });
    const qui = String(req.headers["x-qui"] ?? "inconnu").slice(0, 254);

    if (req.method === "GET" && url.pathname === "/clients") return repondre(res, 200, { clients: await clients() });
    if (req.method === "GET" && url.pathname === "/journal") return repondre(res, 200, { journal: await journal() });
    if (req.method === "GET" && morceaux[0] === "clients" && morceaux[2] === "equipe" && morceaux.length === 3) {
      exiger(NOM_RE.test(morceaux[1]), "Nom de client invalide.");
      const r = await passerelle("equipe", morceaux[1]);
      if (!r.ok) return repondre(res, 502, { error: "passerelle", message: r.sortie });
      return repondre(res, 200, JSON.parse(r.sortie));
    }
    if (req.method === "GET" && morceaux[0] === "clients" && morceaux[2] === "sauvegardes" && morceaux.length === 3) {
      exiger(NOM_RE.test(morceaux[1]), "Nom de client invalide.");
      const r = await outil("sauvegardes", morceaux[1], "--json");
      if (!r.ok) return repondre(res, 500, { error: "sauvegardes", message: r.sortie });
      return repondre(res, 200, JSON.parse(r.sortie));
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
      req.on("close", () => p.kill("SIGTERM"));
      return;
    }
    if (req.method === "POST" && url.pathname === "/clients") {
      const r = await creer(qui, await lireCorps(req));
      return repondre(res, r.ok ? 200 : 500, r);
    }
    if (req.method === "POST" && url.pathname === "/tous/mettre-a-jour") {
      const r = await unParUn(() => outil("mettre-a-jour", "--tous"));
      await noter(qui, "mettre-a-jour", "tous", r);
      return repondre(res, r.ok ? 200 : 500, r);
    }
    if (req.method === "POST" && morceaux[0] === "clients" && morceaux.length === 3) {
      const r = await action(qui, morceaux[1], morceaux[2], await lireCorps(req));
      return repondre(res, r.ok ? 200 : 500, r);
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
  const r = await unParUn(() => outil("verifier-essais"));
  if (r.sortie) await noter("automatique", "fin-essai", "-", r);
}
setTimeout(essais, 60 * 1000);
setInterval(essais, 60 * 60 * 1000);

// Chaque nuit à HEURE_SAUVEGARDE : sauvegarde de tous les clients.
// Une fois par semaine (JOUR_TEST), une heure après : test de restauration.
// La date du dernier passage est gardée sur le disque pour ne pas refaire
// (ou rater) une sauvegarde quand le moteur redémarre.
const PLANNING = `${SAUVEGARDES}/planning.json`;
const jourDe = (d) => d.toLocaleDateString("sv-SE"); // AAAA-MM-JJ, heure locale
async function planning() {
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
  if (heure >= HEURE_SAUVEGARDE && fait.sauvegarde !== aujourdhui) {
    fait.sauvegarde = aujourdhui;
    await writeFile(PLANNING, JSON.stringify(fait), { mode: 0o600 }).catch(() => {});
    const r = await unParUn(() => outil("sauvegarder", "--tous", "--etiquette", "auto"));
    await noter("automatique", "sauvegardes-nuit", "tous", r);
  }
  if (maintenant.getDay() === JOUR_TEST && heure >= HEURE_SAUVEGARDE + 1 && fait.test !== aujourdhui) {
    fait.test = aujourdhui;
    await writeFile(PLANNING, JSON.stringify(fait), { mode: 0o600 }).catch(() => {});
    const r = await unParUn(() => outil("tester-sauvegarde", "--tous"));
    await noter("automatique", "test-sauvegardes", "tous", r);
  }
}
setTimeout(planning, 2 * 60 * 1000);
setInterval(planning, 5 * 60 * 1000);
