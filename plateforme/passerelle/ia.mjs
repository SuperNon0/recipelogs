// Lecture des factures par IA (lot 7) avec la clé de la plateforme.
// L'appli d'un client appelle Claude avec le SDK officiel, en prenant la
// passerelle comme adresse de l'API : ici on vérifie la demande, on compte
// une lecture dans le quota du mois du client, on remplace sa clé de
// passerelle par la clé Anthropic de RecipeLog (IA_ANTHROPIC_CLE) et on
// renvoie la réponse telle quelle. La clé Anthropic ne quitte jamais la
// passerelle : un client ne la voit pas.
//
// Fichiers (dossier /ia, partagé avec le moteur du panel) :
//   reglages.json        écrit par le panel : { defaut: 30, clients: { maison: 100 } }
//   usage/<client>.json  écrit ici : { "2026-11": { lectures, entree, sortie } }
//   etat.json            écrit ici au démarrage : la clé est-elle réglée ? (le panel l'affiche)
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";

const RACINE = process.env.IA_DIR || "/ia";
const CLE = (process.env.IA_ANTHROPIC_CLE || "").trim();
const AMONT = (process.env.IA_ANTHROPIC_URL || "https://api.anthropic.com").replace(/\/+$/, "");
const MODELES = new Set((process.env.IA_MODELES || "claude-opus-5-5").split(",").map((m) => m.trim()).filter(Boolean));
const QUOTA_DEFAUT = Number.isFinite(Number(process.env.IA_QUOTA_DEFAUT)) ? Number(process.env.IA_QUOTA_DEFAUT) : 30;
const MAX_CORPS = 16 * 1024 * 1024; // un PDF de 10 Mo fait ~13,4 Mo en base64
// Lecture en continu : jusqu'à 64 000 jetons de réponse (une mercuriale de plusieurs pages).
// Sans lecture en continu, on reste à 16 000 (au-delà, la réponse met trop de temps à arriver d'un bloc).
const MAX_SORTIE = 64000;
const MAX_SORTIE_BLOC = 16000;
const BETAS = new Set(["server-side-fallback-2026-07-01"]);
const DELAI_MS = 5 * 60_000;
const DELAI_FLUX_MS = 15 * 60_000;
// Une lecture ne compte dans le quota du client que si l'IA est allée au bout de sa réponse :
// un document trop long (réponse coupée) ou refusé n'est pas compté.
const FINS_COMPTEES = new Set(["end_turn", "stop_sequence"]);

const enCours = new Map(); // client → lectures en cours (pour ne pas dépasser le quota en parallèle)
const verrous = new Map(); // client → promesse : les mises à jour du fichier d'usage passent une par une

export const mois = (d = new Date()) => d.toISOString().slice(0, 7);

async function lireJson(fichier, defaut) {
  try {
    return JSON.parse(await readFile(fichier, "utf8"));
  } catch {
    return defaut;
  }
}

async function ecrireJson(fichier, valeur) {
  await mkdir(fichier.slice(0, fichier.lastIndexOf("/")), { recursive: true });
  const tmp = `${fichier}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(tmp, JSON.stringify(valeur, null, 1), { mode: 0o644 });
  await rename(tmp, fichier);
}

export async function noterEtat() {
  try {
    await ecrireJson(`${RACINE}/etat.json`, { cle: !!CLE, modeles: [...MODELES], depuis: new Date().toISOString() });
  } catch (e) {
    console.error(`IA : impossible d'écrire ${RACINE}/etat.json (${e.message})`);
  }
}

export async function limite(client) {
  const r = await lireJson(`${RACINE}/reglages.json`, {});
  const v = r?.clients?.[client];
  if (typeof v === "number" && v >= 0) return Math.floor(v);
  return typeof r?.defaut === "number" && r.defaut >= 0 ? Math.floor(r.defaut) : QUOTA_DEFAUT;
}

async function usage(client) {
  return lireJson(`${RACINE}/usage/${client}.json`, {});
}

/** GET /v1/ia/quota */
export async function quota(client) {
  const [l, u] = await Promise.all([limite(client), usage(client)]);
  const m = mois();
  return { disponible: !!CLE && l > 0, limite: l, utilise: u[m]?.lectures ?? 0, mois: m };
}

function compter(client, entree, sortie) {
  const avant = verrous.get(client) ?? Promise.resolve();
  const suite = avant.then(async () => {
    const u = await usage(client);
    const m = mois();
    const c = u[m] ?? { lectures: 0, entree: 0, sortie: 0 };
    u[m] = { lectures: c.lectures + 1, entree: c.entree + entree, sortie: c.sortie + sortie };
    // On garde 13 mois d'historique.
    for (const k of Object.keys(u).sort().slice(0, -13)) delete u[k];
    await ecrireJson(`${RACINE}/usage/${client}.json`, u);
  });
  verrous.set(client, suite.catch(() => {}));
  return suite;
}

function refuser(res, statut, code, message) {
  // x-should-retry : le SDK ne réessaie pas un refus de la passerelle (quota, demande interdite).
  res.writeHead(statut, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "x-should-retry": "false" });
  res.end(JSON.stringify({ type: "error", error: code, message }));
}

async function lireCorps(req) {
  let taille = 0;
  const morceaux = [];
  for await (const m of req) {
    taille += m.length;
    if (taille > MAX_CORPS) return null;
    morceaux.push(m);
  }
  return Buffer.concat(morceaux);
}

/** Vérifie que la demande est bien une lecture de facture, et rien d'autre. */
export function controler(corps, betas) {
  if (!corps || typeof corps !== "object" || Array.isArray(corps)) return "Demande illisible.";
  if (!MODELES.has(corps.model)) return "Ce modèle n'est pas proposé par la plateforme.";
  if (!(Number.isInteger(corps.max_tokens) && corps.max_tokens > 0 && corps.max_tokens <= MAX_SORTIE)) return `max_tokens doit aller de 1 à ${MAX_SORTIE}.`;
  if (corps.stream !== undefined && typeof corps.stream !== "boolean") return "Demande illisible.";
  if (!corps.stream && corps.max_tokens > MAX_SORTIE_BLOC) return `Sans lecture en continu, max_tokens doit aller de 1 à ${MAX_SORTIE_BLOC}.`;
  for (const interdit of ["tools", "tool_choice", "mcp_servers", "container", "system", "speed", "service_tier", "context_management"]) {
    if (corps[interdit] !== undefined) return `Champ « ${interdit} » refusé par la plateforme.`;
  }
  if (!Array.isArray(corps.messages) || corps.messages.length !== 1 || corps.messages[0]?.role !== "user") return "Une seule demande de lecture à la fois.";
  const contenu = corps.messages[0].content;
  if (!Array.isArray(contenu) || contenu.length > 4) return "Demande de lecture invalide.";
  for (const b of contenu) {
    if (!["text", "image", "document"].includes(b?.type)) return "Seuls un fichier et la consigne sont acceptés.";
    if (b.type !== "text" && b.source?.type !== "base64") return "Le fichier doit être joint à la demande.";
  }
  for (const b of betas) if (!BETAS.has(b)) return `Option « ${b} » refusée par la plateforme.`;
  if (corps.fallbacks !== undefined && corps.fallbacks !== "default") return "Seul le modèle de secours par défaut est accepté.";
  return null;
}

/** POST /v1/ia/anthropic/v1/messages : relais vers l'API Anthropic. */
export async function relayer(client, req, res, query) {
  if (!CLE) return refuser(res, 503, "ia_indisponible", "La lecture par IA n'est pas encore ouverte sur la plateforme.");
  const brut = await lireCorps(req);
  if (!brut) return refuser(res, 413, "trop_gros", "Fichier trop gros pour la lecture par IA (10 Mo au plus).");
  let corps;
  try {
    corps = JSON.parse(brut.toString("utf8"));
  } catch {
    return refuser(res, 400, "json_invalide", "Demande illisible.");
  }
  const betas = String(req.headers["anthropic-beta"] || "").split(",").map((b) => b.trim()).filter(Boolean);
  const probleme = controler(corps, betas);
  if (probleme) return refuser(res, 400, "demande_refusee", probleme);

  const q = await quota(client);
  const occupees = enCours.get(client) ?? 0;
  if (q.utilise + occupees >= q.limite) {
    return refuser(res, 429, "quota_ia", q.limite > 0
      ? `Les ${q.limite} lectures par IA du mois sont utilisées. Elles reviennent le 1er du mois ; tu peux aussi mettre ta propre clé d'IA dans les réglages.`
      : "La lecture par IA n'est pas ouverte sur ton offre. Demande-la à RecipeLog, ou mets ta propre clé d'IA dans les réglages.");
  }

  enCours.set(client, occupees + 1);
  try {
    const amont = await fetch(`${AMONT}/v1/messages${query.includes("beta=true") ? "?beta=true" : ""}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": CLE,
        "anthropic-version": String(req.headers["anthropic-version"] || "2023-06-01"),
        ...(betas.length ? { "anthropic-beta": betas.join(",") } : {}),
      },
      body: brut,
      signal: AbortSignal.timeout(corps.stream ? DELAI_FLUX_MS : DELAI_MS),
    });
    const noter = async (u, fin) => {
      if (!FINS_COMPTEES.has(fin)) {
        console.error(`IA : lecture de ${client} non comptée (fin : ${fin ?? "inconnue"}).`);
        return;
      }
      const entree = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
      await compter(client, entree, u.output_tokens ?? 0).catch((e) => console.error(`IA : usage de ${client} non noté (${e.message})`));
    };
    // Lecture en continu : la réponse est transmise au fil de l'eau ; on y lit au passage
    // la consommation et la raison de fin (événements message_start et message_delta).
    if (amont.ok && corps.stream && amont.body) {
      res.writeHead(200, { "Content-Type": amont.headers.get("content-type") || "text/event-stream", "Cache-Control": "no-store", "X-Accel-Buffering": "no" });
      const decodeur = new TextDecoder();
      let reste = "";
      let u = {};
      let fin = null;
      const lire = (bloc) => {
        for (const l of bloc.split("\n")) {
          if (!l.startsWith("data:")) continue;
          try {
            const j = JSON.parse(l.slice(5));
            if (j.type === "message_start") u = { ...u, ...(j.message?.usage ?? {}) };
            if (j.type === "message_delta") {
              u = { ...u, ...(j.usage ?? {}) };
              if (j.delta?.stop_reason) fin = j.delta.stop_reason;
            }
            if (j.type === "error") console.error(`IA : erreur d'Anthropic pendant la lecture de ${client} : ${JSON.stringify(j.error).slice(0, 500)}`);
          } catch {
            /* morceau illisible : transmis quand même */
          }
        }
      };
      try {
        for await (const m of amont.body) {
          res.write(m);
          reste += decodeur.decode(m, { stream: true }).replace(/\r/g, "");
          let i;
          while ((i = reste.indexOf("\n\n")) >= 0) {
            lire(reste.slice(0, i));
            reste = reste.slice(i + 2);
          }
        }
        if (reste) lire(reste);
      } catch (e) {
        console.error(`IA : lecture de ${client} coupée en route (${e.message})`);
        res.destroy();
        return;
      }
      res.end();
      await noter(u, fin);
      return;
    }
    const texte = await amont.text();
    if (amont.ok) {
      let j = {};
      try {
        j = JSON.parse(texte);
      } catch {
        /* réponse rendue telle quelle */
      }
      await noter(j.usage ?? {}, j.stop_reason ?? null);
    } else {
      // La vraie raison dans les journaux (recipelog-plateforme logs passerelle) : crédit épuisé,
      // modèle inconnu, fichier refusé… Sans ça, toute erreur ressemblait à « fichier illisible ».
      console.error(`IA : Anthropic a répondu ${amont.status} pour ${client} : ${texte.slice(0, 800)}`);
      if (amont.status === 401 || amont.status === 403) {
        // Clé de la plateforme refusée : ce n'est pas la faute du client, on ne lui renvoie pas l'erreur d'Anthropic.
        return refuser(res, 503, "ia_indisponible", "La lecture par IA de la plateforme est en panne. RecipeLog est prévenu ; réessaie plus tard.");
      }
    }
    res.writeHead(amont.status, {
      "Content-Type": amont.headers.get("content-type") || "application/json",
      "Cache-Control": "no-store",
      ...(amont.headers.get("retry-after") ? { "retry-after": amont.headers.get("retry-after") } : {}),
    });
    res.end(texte);
  } catch (e) {
    console.error(`IA : Anthropic injoignable (${e.message})`);
    if (res.headersSent) res.destroy();
    else refuser(res, 502, "ia_injoignable", "L'IA ne répond pas pour l'instant. Réessaie dans quelques minutes.");
  } finally {
    enCours.set(client, Math.max(0, (enCours.get(client) ?? 1) - 1));
  }
}
