// Maintenance et messages (lot 6) : fenêtres de maintenance (tout le parc, un client, la
// vitrine), bandeaux affichés dans les RecipeLog des clients, et emails aux équipes.
//
// Tout tient dans /srv/recipelog/annonces/annonces.json, écrit ici seulement (moteur) :
// - la passerelle le lit (en lecture seule) et dit à chaque RecipeLog, à chaque instant,
//   s'il est en maintenance et quels bandeaux montrer. Le passage en maintenance et la
//   réouverture se font donc d'eux-mêmes à l'heure dite, sans tâche planifiée ;
// - le moteur s'en sert chaque minute pour les emails de préavis et la vitrine.
// Les envois d'emails sont notés dans annonces/envois.jsonl.
import { appendFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { courrielRegle, envoyerCourriel } from "./courriel.mjs";

const DONNEES = process.env.DONNEES || "/srv/recipelog";
const DOMAINE = process.env.DOMAINE || "recipelog.cc";
const DOSSIER = `${DONNEES}/annonces`;
const FICHIER = `${DOSSIER}/annonces.json`;
const ENVOIS = `${DOSSIER}/envois.jsonl`;
const VITRINE_MAINTENANCE = `${DONNEES}/vitrine/reglages/maintenance.html`;
const NOM_RE = /^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$/;
const ID_RE = /^[0-9a-f]{8}$/;

export class RefusAnnonce extends Error {
  constructor(message, statut = 400) {
    super(message);
    this.statut = statut;
  }
}
const exiger = (c, m) => {
  if (!c) throw new RefusAnnonce(m);
};
const texte = (v, max) => (typeof v === "string" ? v.replace(/\r/g, "").trim().slice(0, max) : "");
const date = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const t = Date.parse(v);
  exiger(Number.isFinite(t), "Date invalide.");
  return new Date(t).toISOString();
};
// Cibles : « * » (tous les clients), des noms de clients, et « vitrine » (maintenance seulement).
function cibles(v, vitrinePermise) {
  const liste = Array.isArray(v) ? v.map(String) : [];
  if (liste.includes("*")) return ["*", ...(vitrinePermise && liste.includes("vitrine") ? ["vitrine"] : [])];
  const ok = liste.filter((c) => NOM_RE.test(c) && (c !== "vitrine" || vitrinePermise));
  exiger(ok.length, "Choisis au moins une cible.");
  return [...new Set(ok)].slice(0, 200);
}
const vise = (a, nom) => a.cibles.includes("*") ? nom !== "vitrine" || a.cibles.includes("vitrine") : a.cibles.includes(nom);

// ------------------------------------------------------------ fichier
export async function lire() {
  try {
    const j = JSON.parse(await readFile(FICHIER, "utf8"));
    return { maintenances: j.maintenances ?? [], bandeaux: j.bandeaux ?? [] };
  } catch {
    return { maintenances: [], bandeaux: [] };
  }
}
async function ecrire(a) {
  await mkdir(DOSSIER, { recursive: true });
  const tmp = `${FICHIER}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(tmp, JSON.stringify(a, null, 1), { mode: 0o644 });
  await rename(tmp, FICHIER);
}
// Une modification à la fois (le tour de chaque minute écrit aussi).
let verrou = Promise.resolve();
function modifier(f) {
  const r = verrou.then(async () => {
    const a = await lire();
    const x = await f(a);
    await ecrire(a);
    return x;
  });
  verrou = r.catch(() => {});
  return r;
}

async function envois(n = 50) {
  try {
    return (await readFile(ENVOIS, "utf8")).trim().split("\n").filter(Boolean).slice(-n).reverse().map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

const etatMaintenance = (m, t = Date.now()) => {
  if (m.terminee || (m.fin && Date.parse(m.fin) <= t)) return "finie";
  return Date.parse(m.debut) <= t ? "en-cours" : "prevue";
};

/** Pour le panel : tout, avec l'état de chaque maintenance et les derniers envois. */
export async function resume() {
  const a = await lire();
  const t = Date.now();
  const recent = (m) => etatMaintenance(m, t) !== "finie" || Date.parse(m.terminee ?? m.fin) > t - 14 * 86400000;
  return {
    maintenances: a.maintenances.filter(recent).map((m) => ({ ...m, etat: etatMaintenance(m, t) })),
    bandeaux: a.bandeaux.filter((b) => !b.jusqua || Date.parse(b.jusqua) > t),
    envois: await envois(),
    email: courrielRegle(),
  };
}

// ------------------------------------------------------------ destinataires et envois
/** Adresses des équipes visées (comptes actifs dans Authentik), sans doublon. */
async function destinataires(cibleListe, clientsConnus, equipe) {
  const noms = cibleListe.includes("*") ? clientsConnus : cibleListe.filter((c) => clientsConnus.includes(c));
  const adresses = new Map(); // email -> client
  const sans = [];
  for (const nom of noms) {
    const membres = await equipe(nom).catch(() => null);
    if (!membres) {
      sans.push(nom);
      continue;
    }
    for (const m of membres) if (m.actif !== false && m.email) adresses.set(m.email.toLowerCase(), nom);
  }
  return { adresses, sans };
}

// Un email par personne (personne ne voit les autres adresses), sans bloquer le panel :
// le résultat arrive dans le journal des envois.
async function envoyer(qui, sujet, corps, cibleListe, clientsConnus, equipe, raison) {
  const { adresses, sans } = await destinataires(cibleListe, clientsConnus, equipe);
  let ok = 0;
  const echecs = [];
  for (const [email, nom] of adresses) {
    try {
      await envoyerCourriel({ a: email, sujet, texte: `${corps}\n\n—\nL'équipe RecipeLog · https://${nom}.${DOMAINE}` });
      ok += 1;
    } catch (e) {
      echecs.push(`${email} : ${e.message}`);
    }
  }
  const ligne = { date: new Date().toISOString(), qui, raison, cibles: cibleListe, sujet, envoyes: ok, echecs: echecs.length, details: [...echecs.slice(0, 10), ...sans.map((s) => `${s} : équipe illisible`)] };
  await mkdir(DOSSIER, { recursive: true });
  await appendFile(ENVOIS, JSON.stringify(ligne) + "\n", { mode: 0o600 });
  return ligne;
}

const quand = (iso) =>
  new Date(iso).toLocaleString("fr-FR", { timeZone: process.env.TZ || "Europe/Paris", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
const plage = (m) => (m.fin ? `du ${quand(m.debut)} au ${quand(m.fin)}` : `à partir du ${quand(m.debut)}`);

// ------------------------------------------------------------ actions du panel
/**
 * act : maintenance | terminer | annuler | bandeau | retirer-bandeau | message
 * ctx : { qui, clients: noms connus, equipe: (nom) => membres, noter }
 */
export async function action(act, id, corps, ctx) {
  const { qui, clients, equipe, noter } = ctx;
  switch (act) {
    case "maintenance": {
      const debut = date(corps.debut) ?? new Date().toISOString();
      const fin = date(corps.fin);
      exiger(!fin || Date.parse(fin) > Date.parse(debut), "La fin doit être après le début.");
      exiger(!fin || Date.parse(fin) > Date.now(), "La fin est déjà passée.");
      const m = {
        id: randomBytes(4).toString("hex"),
        cibles: cibles(corps.cibles, true),
        debut,
        fin,
        message: texte(corps.message, 1000) || "RecipeLog est en maintenance pour quelques minutes. Merci de ta patience.",
        preavisHeures: Math.max(0, Math.min(168, Number(corps.preavisHeures ?? 24) || 0)),
        emailPreavis: corps.emailPreavis !== false && Date.parse(debut) > Date.now() + 5 * 60000,
        preavisEnvoye: false,
        cree: new Date().toISOString(),
        qui,
      };
      await modifier((a) => a.maintenances.push(m));
      await noter(qui, "maintenance-prevue", m.cibles.includes("*") ? "tous" : m.cibles.join(", "), { ok: true, sortie: `Maintenance ${plage(m)}.` });
      await tour(ctx); // une maintenance immédiate s'applique tout de suite (vitrine)
      return { ok: true, maintenance: m };
    }
    case "terminer":
    case "annuler": {
      exiger(ID_RE.test(id), "Maintenance inconnue.");
      const m = await modifier((a) => {
        const x = a.maintenances.find((y) => y.id === id);
        if (!x) throw new RefusAnnonce("Maintenance introuvable.", 404);
        if (act === "annuler") a.maintenances = a.maintenances.filter((y) => y.id !== id);
        else x.terminee = new Date().toISOString();
        return x;
      });
      await noter(qui, `maintenance-${act === "annuler" ? "annulee" : "finie"}`, m.cibles.includes("*") ? "tous" : m.cibles.join(", "), { ok: true, sortie: "" });
      await tour(ctx);
      return { ok: true };
    }
    case "bandeau": {
      const b = {
        id: randomBytes(4).toString("hex"),
        cibles: cibles(corps.cibles, false),
        texte: texte(corps.texte, 300),
        niveau: corps.niveau === "alerte" ? "alerte" : "info",
        jusqua: corps.jours ? new Date(Date.now() + Math.min(90, Math.max(1, Number(corps.jours))) * 86400000).toISOString() : null,
        cree: new Date().toISOString(),
        qui,
      };
      exiger(b.texte.length >= 3, "Le bandeau est vide.");
      await modifier((a) => a.bandeaux.push(b));
      await noter(qui, "bandeau", b.cibles.includes("*") ? "tous" : b.cibles.join(", "), { ok: true, sortie: b.texte });
      return { ok: true, bandeau: b };
    }
    case "retirer-bandeau": {
      exiger(ID_RE.test(id), "Bandeau inconnu.");
      await modifier((a) => (a.bandeaux = a.bandeaux.filter((b) => b.id !== id)));
      return { ok: true };
    }
    case "message": {
      exiger(courrielRegle(), "Les emails ne sont pas réglés (SMTP_HOTE vide dans /srv/recipelog/.env).");
      const c = cibles(corps.cibles, false);
      const sujet = texte(corps.sujet, 200);
      const message = texte(corps.texte, 10000);
      exiger(sujet.length >= 3, "Le sujet est vide.");
      exiger(message.length >= 3, "Le message est vide.");
      if (corps.bandeau) await action("bandeau", null, { cibles: c, texte: corps.texteBandeau || sujet, niveau: corps.niveau, jours: corps.jours || 3 }, ctx);
      // Réponse tout de suite : l'envoi continue derrière (Cloudflare coupe après 100 s).
      envoyer(qui, sujet, message, c, clients, equipe, "message")
        .then((l) => noter(qui, "message", c.includes("*") ? "tous" : c.join(", "), { ok: l.echecs === 0, sortie: `${sujet}\n${l.envoyes} email(s) envoyé(s), ${l.echecs} échec(s).\n${l.details.join("\n")}` }, { texte: sujet }))
        .catch((e) => console.error("Message :", e.message));
      return { ok: true, sortie: "Envoi lancé : le résultat s'affiche dans le journal des envois d'ici une minute." };
    }
    default:
      throw new RefusAnnonce("Action inconnue.", 404);
  }
}

// ------------------------------------------------------------ chaque minute
/** Emails de préavis, nettoyage, page de maintenance de la vitrine. */
export async function tour(ctx) {
  const t = Date.now();
  const a = await lire();
  // Préavis : une fois, dès qu'on entre dans la fenêtre de préavis.
  for (const m of a.maintenances) {
    if (m.preavisEnvoye || !m.emailPreavis || etatMaintenance(m, t) !== "prevue") continue;
    if (Date.parse(m.debut) - m.preavisHeures * 3600000 > t) continue;
    await modifier((b) => {
      const x = b.maintenances.find((y) => y.id === m.id);
      if (x) x.preavisEnvoye = true;
    });
    if (!courrielRegle()) continue;
    const corps = `Bonjour,\n\nRecipeLog sera en maintenance ${plage(m)}. Pendant ce temps, le site affichera une page d'attente : pense à enregistrer ton travail avant.\n\n${m.message}`;
    const l = await envoyer("automatique", "RecipeLog : maintenance prévue", corps, m.cibles.filter((c) => c !== "vitrine"), ctx.clients, ctx.equipe, "preavis");
    await ctx.noter("automatique", "preavis", m.cibles.includes("*") ? "tous" : m.cibles.join(", "), { ok: l.echecs === 0, sortie: `${l.envoyes} email(s) de préavis envoyé(s).` });
  }
  // Ménage : maintenances finies depuis plus de 60 jours, bandeaux expirés depuis 30.
  const vieux = (iso, j) => iso && Date.parse(iso) < t - j * 86400000;
  if (a.maintenances.some((m) => etatMaintenance(m, t) === "finie" && vieux(m.terminee ?? m.fin, 60)) || a.bandeaux.some((b) => vieux(b.jusqua, 30))) {
    await modifier((b) => {
      b.maintenances = b.maintenances.filter((m) => !(etatMaintenance(m, t) === "finie" && vieux(m.terminee ?? m.fin, 60)));
      b.bandeaux = b.bandeaux.filter((x) => !vieux(x.jusqua, 30));
    });
  }
  // Vitrine : nginx affiche maintenance.html tant que le fichier existe.
  const mv = (await lire()).maintenances.find((m) => etatMaintenance(m, t) === "en-cours" && vise(m, "vitrine"));
  if (mv) await writeFile(VITRINE_MAINTENANCE, pageVitrine(mv), { mode: 0o644 }).catch((e) => console.error("Vitrine :", e.message));
  else await rm(VITRINE_MAINTENANCE, { force: true }).catch(() => {});
}

const echapper = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
function pageVitrine(m) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RecipeLog · maintenance</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f5f3ee;color:#1b1d22;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:16px}
main{max-width:460px;background:#fff;border:1px solid #e7e2d7;border-radius:14px;padding:30px 28px;text-align:center}h1{font-family:Georgia,serif;font-weight:400;margin:8px 0 10px}p{color:#454a55;line-height:1.5}small{color:#666b77}</style></head>
<body><main><small>RECIPELOG</small><h1>Petite pause technique</h1><p>${echapper(m.message)}</p>${m.fin ? `<p><small>Retour prévu le ${echapper(quand(m.fin))}.</small></p>` : ""}</main></body></html>`;
}

/** Pour la page de statut publique : maintenances en cours ou prévues, sans nom de client. */
export async function pourStatut() {
  const a = await lire();
  const t = Date.now();
  return a.maintenances
    .map((m) => ({ ...m, etat: etatMaintenance(m, t) }))
    .filter((m) => m.etat === "en-cours" || (m.etat === "prevue" && Date.parse(m.debut) - t < 7 * 86400000))
    .map((m) => ({ etat: m.etat, tous: m.cibles.includes("*"), debut: m.debut, fin: m.fin, message: m.message }));
}
