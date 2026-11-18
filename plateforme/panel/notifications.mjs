// Notifications pour Noë : tout ce que la plateforme doit lui dire (panne, sauvegarde ratée,
// demande de support…) part sur Discord par BotPanel et reste dans le panel (cloche,
// historique, lu / non lu). Plus aucun email ni Telegram pour Noë : le quota Brevo
// (300 emails par mois) est gardé pour les emails importants envoyés aux clients.
//
// BotPanel : POST <adresse>/api/notify { id: <slug>, vars: { titre, texte, lien, type } }.
// Chaque type de notification a son slug (recipelog_panne, recipelog_support…) créé une fois
// dans BotPanel : le salon, la couleur et la mise en forme se règlent là-bas.
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";

const DONNEES = process.env.DONNEES || "/srv/recipelog";
const DOMAINE = process.env.DOMAINE || "recipelog.cc";
const DOSSIER = `${DONNEES}/notifications`;
const HISTORIQUE = `${DOSSIER}/historique.jsonl`;
const GARDER = 1000; // notifications gardées dans le panel (les plus récentes)

export class RefusNotif extends Error {}

// Les types, dans l'ordre affiché dans le panel. aide = texte du « ? ».
export const TYPES = [
  ["panne", "Site ou service en panne", "Un client ou un service (connexion, passerelle, vitrine, base…) ne répond plus depuis 2 minutes, puis quand il répond de nouveau (avec la durée de la panne)."],
  ["disque", "Disque presque plein", "Le disque des données dépasse 85 % (une fois par jour au plus). À 95 %, les sauvegardes s'arrêtent."],
  ["sauvegarde", "Sauvegardes", "Sauvegarde de la nuit ratée, client sans sauvegarde depuis plus de 36 heures, ou test de restauration de la semaine raté."],
  ["support", "Support", "Une nouvelle demande d'un client (Réglages → Signaler un problème), ou un nouveau message dans une demande en cours."],
  ["vitrine", "Demande sur la vitrine", "Quelqu'un a rempli le formulaire de contact du site vitrine (demande d'essai ou question)."],
  ["essai", "Fin d'essai", "L'essai gratuit d'un client est fini : son site vient de passer en pause."],
  ["maj", "Nouvelle version", "Une nouvelle version est prête pour tes clients, la plateforme ou la vitrine. Une seule fois par version. Rien ne s'installe tout seul."],
  ["maintenance", "Maintenance", "Le préavis de maintenance n'a pu partir chez aucun client (5 essais)."],
  ["demo", "Démo", "La démo n'a pas pu être remise à zéro cette nuit."],
].map(([id, nom, aide]) => ({ id, nom, aide, slug: `recipelog_${id}` }));
const IDS = new Set(TYPES.map((t) => t.id));
const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

// ------------------------------------------------------------ fichiers
async function lireJson(f, defaut) {
  try {
    return JSON.parse(await readFile(`${DOSSIER}/${f}`, "utf8"));
  } catch {
    return defaut;
  }
}
async function ecrireJson(f, v) {
  await mkdir(DOSSIER, { recursive: true });
  const tmp = `${DOSSIER}/${f}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(tmp, JSON.stringify(v, null, 1));
  await rename(tmp, `${DOSSIER}/${f}`);
}

// ------------------------------------------------------------ réglages
// { botpanel: "http://192.168.0.x:8080", types: { panne: { discord, panel, slug } } }
// Par défaut : tout va sur Discord et dans le panel. BOTPANEL_URL (.env) sert d'adresse
// tant qu'aucune n'est enregistrée depuis le panel.
export async function reglages() {
  const r = await lireJson("reglages.json", {});
  const types = {};
  for (const t of TYPES) {
    const x = r.types?.[t.id] ?? {};
    types[t.id] = { discord: x.discord !== false, panel: x.panel !== false, slug: SLUG_RE.test(x.slug ?? "") ? x.slug : t.slug };
  }
  const botpanel = typeof r.botpanel === "string" ? r.botpanel : (process.env.BOTPANEL_URL || "").trim();
  return { botpanel: botpanel.replace(/\/+$/, ""), types };
}

function adresseValide(v) {
  if (v === "") return true;
  try {
    const u = new URL(v);
    return (u.protocol === "http:" || u.protocol === "https:") && !u.username && !u.password && !u.search && !u.hash;
  } catch {
    return false;
  }
}

export async function regler(corps) {
  const actuel = await reglages();
  const suite = { botpanel: actuel.botpanel, types: { ...actuel.types } };
  if ("botpanel" in (corps ?? {})) {
    const a = typeof corps.botpanel === "string" ? corps.botpanel.trim().replace(/\/+$/, "") : null;
    if (a === null || a.length > 300 || !adresseValide(a)) throw new RefusNotif("Adresse de BotPanel invalide : elle commence par http:// ou https://, par exemple http://192.168.0.20:8080");
    suite.botpanel = a;
  }
  if (corps?.types !== undefined) {
    if (typeof corps.types !== "object" || corps.types === null) throw new RefusNotif("Réglages invalides.");
    for (const [id, v] of Object.entries(corps.types)) {
      if (!IDS.has(id) || typeof v !== "object" || v === null) throw new RefusNotif(`Type de notification inconnu : ${id}`);
      const t = { ...suite.types[id] };
      if ("discord" in v) {
        if (typeof v.discord !== "boolean") throw new RefusNotif("Réglages invalides.");
        t.discord = v.discord;
      }
      if ("panel" in v) {
        if (typeof v.panel !== "boolean") throw new RefusNotif("Réglages invalides.");
        t.panel = v.panel;
      }
      if ("slug" in v) {
        const s = typeof v.slug === "string" ? v.slug.trim().toLowerCase() : "";
        if (!SLUG_RE.test(s)) throw new RefusNotif(`Nom BotPanel invalide pour « ${TYPES.find((x) => x.id === id).nom} » : lettres minuscules, chiffres, _ ou -.`);
        t.slug = s;
      }
      suite.types[id] = t;
    }
  }
  await ecrireJson("reglages.json", suite);
  return reglages();
}

// ------------------------------------------------------------ envoi BotPanel
async function versBotpanel(adresse, slug, vars) {
  const r = await fetch(`${adresse}/api/notify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: slug, vars }),
    signal: AbortSignal.timeout(10000),
  });
  if (r.status === 404) throw new Error(`BotPanel ne connaît pas la notification « ${slug} » (ou n'a pas pu l'envoyer sur Discord) : crée-la dans BotPanel avec ce nom.`);
  if (!r.ok) throw new Error(`BotPanel a refusé (${r.status}) ${(await r.text().catch(() => "")).slice(0, 120)}`);
}

// ------------------------------------------------------------ historique du panel
let derniereEcriture = Promise.resolve();
let lignesDepuisNettoyage = 0;
async function garder(entree) {
  await mkdir(DOSSIER, { recursive: true });
  await appendFile(HISTORIQUE, `${JSON.stringify(entree)}\n`);
  lignesDepuisNettoyage += 1;
  // De temps en temps : on ne garde que les GARDER plus récentes.
  if (lignesDepuisNettoyage >= 100) {
    lignesDepuisNettoyage = 0;
    const tout = await toutes();
    if (tout.length > GARDER) {
      const tmp = `${HISTORIQUE}.${randomBytes(4).toString("hex")}.tmp`;
      await writeFile(tmp, tout.slice(-GARDER).map((x) => JSON.stringify(x)).join("\n") + "\n");
      await rename(tmp, HISTORIQUE);
    }
  }
}
async function toutes() {
  const brut = await readFile(HISTORIQUE, "utf8").catch(() => "");
  const l = [];
  for (const ligne of brut.split("\n")) {
    if (!ligne.trim()) continue;
    try {
      l.push(JSON.parse(ligne)); // une ligne abîmée (coupure pendant l'écriture) est sautée
    } catch {
      /* ligne abîmée */
    }
  }
  return l;
}

/**
 * Prévient Noë. Ne lève jamais d'erreur. type : un des TYPES (ou "test", toujours envoyé).
 * Rend { ok, canaux: { discord, panel } } : true (parti), un texte (pourquoi ça a raté),
 * ou null (coupé dans les réglages / BotPanel pas réglé).
 */
export async function notifier(type, titre, texte, lien = `https://admin.${DOMAINE}`) {
  const canaux = { discord: null, panel: null };
  let r;
  try {
    r = await reglages();
  } catch {
    r = { botpanel: "", types: {} };
  }
  const essai = type === "test";
  const t = essai ? { discord: true, panel: true, slug: "recipelog_test" } : r.types[type] ?? { discord: true, panel: true, slug: `recipelog_${type}` };
  const entree = { id: `${Date.now().toString(36)}${randomBytes(3).toString("hex")}`, date: new Date().toISOString(), type, titre: String(titre).slice(0, 200), texte: String(texte).slice(0, 2000) };
  if (t.discord && r.botpanel) {
    try {
      await versBotpanel(r.botpanel, t.slug, { titre: entree.titre, texte: entree.texte.slice(0, 1800), lien, type });
      canaux.discord = true;
    } catch (e) {
      const code = e?.cause?.code ?? e?.cause?.errors?.[0]?.code ?? e?.cause?.message;
      canaux.discord = String(
        e?.name === "TimeoutError" ? `BotPanel ne répond pas (10 s) à ${r.botpanel}` : e?.message === "fetch failed" ? `BotPanel injoignable à ${r.botpanel}${code ? ` (${code})` : ""}` : e?.message ?? e,
      ).slice(0, 300);
      console.error(`Notification non envoyée sur Discord (${type}) :`, canaux.discord);
    }
  }
  if (t.panel) {
    entree.discord = canaux.discord;
    // Les écritures se suivent : deux notifications en même temps ne s'emmêlent pas.
    derniereEcriture = derniereEcriture.then(() => garder(entree)).catch((e) => console.error("Notification non gardée dans le panel :", e.message));
    await derniereEcriture;
    canaux.panel = true;
  }
  return { ok: Object.values(canaux).some((v) => v === true), canaux };
}

// ------------------------------------------------------------ pour le panel
async function lues() {
  const l = await lireJson("lues.json", {});
  return { avant: typeof l.avant === "string" ? l.avant : "", ids: Array.isArray(l.ids) ? l.ids : [] };
}
const estLue = (n, l) => (l.avant && n.date <= l.avant) || l.ids.includes(n.id);

export async function resume(n = 200) {
  const [tout, l, r] = await Promise.all([toutes(), lues(), reglages()]);
  const liste = tout.slice(-n).reverse().map((x) => ({ ...x, lu: estLue(x, l) }));
  return {
    reglages: r,
    types: TYPES,
    liste,
    nonLues: tout.filter((x) => !estLue(x, l)).length,
    total: tout.length,
  };
}

export async function marquer(corps) {
  const l = await lues();
  if (corps?.tout === true) {
    await ecrireJson("lues.json", { avant: new Date().toISOString(), ids: [] });
  } else if (Array.isArray(corps?.ids) && corps.ids.every((x) => typeof x === "string" && x.length <= 40)) {
    const ids = [...new Set([...l.ids, ...corps.ids])].slice(-GARDER);
    await ecrireJson("lues.json", { ...l, ids });
  } else {
    throw new RefusNotif("Quoi marquer comme lu ?");
  }
  return resume();
}

export async function vider() {
  await mkdir(DOSSIER, { recursive: true });
  await writeFile(HISTORIQUE, "");
  await ecrireJson("lues.json", { avant: "", ids: [] });
  return resume();
}
