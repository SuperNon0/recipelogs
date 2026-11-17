// Nouvelles versions disponibles (réservé au panel : les clients ne voient jamais rien de tout ça).
//
// Toutes les heures, le moteur demande à GitHub :
//   - pour chaque canal des clients (Standard = branche instance, Bêta = beta-instance…) :
//     le dernier commit dont l'image Docker a bien été publiée (dernier build « Image Docker »
//     réussi sur la branche). C'est exactement ce que « Mettre à jour » installerait ;
//   - pour la vitrine : le dernier commit de la branche site-vitrine.
// La plateforme elle-même (panel, connexion…) a déjà sa vérification (plateforme.mjs).
//
// La version installée de chaque client est lue sur son conteneur (étiquette
// org.opencontainers.image.revision mise par GitHub Actions), celle de la vitrine dans
// vitrine/code/.commit (écrit par « recipelog-instance vitrine maj »).
//
// Rien n'est jamais installé tout seul : on affiche et on prévient (Telegram, Discord, email,
// les canaux réglés pour les alertes), une seule fois par nouvelle version.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";

const DONNEES = process.env.DONNEES || "/srv/recipelog";
const DOSSIER = `${DONNEES}/mises-a-jour`;
const DEPOT = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(process.env.DEPOT_GITHUB ?? "") ? process.env.DEPOT_GITHUB : "SuperNon0/recipelogs";
const VITRINE_BRANCHE = /^[A-Za-z0-9._/-]+$/.test(process.env.VITRINE_BRANCHE ?? "") ? process.env.VITRINE_BRANCHE : "site-vitrine";
// Branche GitHub de chaque canal (voir .github/workflows/docker-image.yml).
export const BRANCHE_CANAL = { instance: "instance", "beta-instance": "beta-instance", plateforme: "plateforme", beta: "main", stable: "stable" };
const SHA = /^[0-9a-f]{40}$/;

// ------------------------------------------------------------ GitHub
// Sans jeton, GitHub permet 60 demandes par heure : une vérification en fait 3 ou 4.
// GITHUB_JETON (facultatif, lecture seule) lève cette limite.
async function github(chemin) {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "recipelog-plateforme" };
  if (process.env.GITHUB_JETON) headers.Authorization = `Bearer ${process.env.GITHUB_JETON}`;
  const r = await fetch(`https://api.github.com/repos/${DEPOT}${chemin}`, { headers, signal: AbortSignal.timeout(10000) });
  if (r.status === 403 || r.status === 429) throw new Error("GitHub refuse pour l'instant (trop de demandes). Nouvel essai à la prochaine vérification.");
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub a répondu ${r.status}.`);
  return r.json();
}

// Titre lisible d'un commit. Pour « Merge pull request #12 from … », le titre de la PR (ligne 3).
function titre(c) {
  const lignes = String(c.commit?.message ?? "").split("\n").map((l) => l.trim());
  const m = /^Merge pull request (#\d+)/.exec(lignes[0]);
  const t = m && lignes.slice(1).find(Boolean) ? `${lignes.slice(1).find(Boolean)} (${m[1]})` : lignes[0];
  return { titre: t.slice(0, 200), date: c.commit?.committer?.date ?? null };
}

// Ce qui a changé entre deux commits. Un résultat ne change jamais : gardé pour toujours
// (200 au plus). Un échec est gardé 10 minutes, pour ne pas rappeler GitHub toutes les 30 s.
const comparaisons = new Map();
async function comparer(de, vers) {
  if (!SHA.test(de) || !SHA.test(vers)) return null;
  if (de === vers) return { enRetard: 0, changements: [] };
  const cle = `${de}...${vers}`;
  const c = comparaisons.get(cle);
  if (c && (c.valeur || c.jusqua > Date.now())) return c.valeur;
  let valeur = null;
  try {
    const j = await github(`/compare/${de}...${vers}`);
    // ahead_by : commits de « vers » absents de « de ». 0 = déjà à jour (ou plus récent).
    if (j) valeur = { enRetard: j.ahead_by ?? 0, changements: (j.commits ?? []).map(titre).reverse().slice(0, 15) };
  } catch {
    valeur = null;
  }
  if (comparaisons.size > 200) comparaisons.delete(comparaisons.keys().next().value);
  comparaisons.set(cle, { valeur, jusqua: Date.now() + 10 * 60 * 1000 });
  return valeur;
}

// Vitrine téléchargée avant que son commit soit noté (pas de code/.commit) : on compte les
// commits de la branche arrivés après la date du téléchargement. Gardé comme comparer().
async function depuisDate(date, vers) {
  const t = Date.parse(date ?? "");
  if (!Number.isFinite(t) || !SHA.test(vers)) return null;
  const cle = `${new Date(t).toISOString()}|${vers}`;
  const c = comparaisons.get(cle);
  if (c && (c.valeur || c.jusqua > Date.now())) return c.valeur;
  let valeur = null;
  try {
    const j = await github(`/commits?sha=${vers}&since=${encodeURIComponent(new Date(t).toISOString())}&per_page=30`);
    if (Array.isArray(j)) valeur = { enRetard: j.length, changements: j.slice(0, 15).map(titre) };
  } catch {
    valeur = null;
  }
  comparaisons.set(cle, { valeur, jusqua: Date.now() + 10 * 60 * 1000 });
  return valeur;
}

// ------------------------------------------------------------ numéro de version et historique
// Numéro lisible d'une version installée, sur le modèle de l'appli (V<majeur>.<mineur>.<PR>) :
// le dernier nombre est celui de la dernière PR fusionnée dans ce commit. Plateforme : P1.0.<PR>,
// vitrine : 1.0.<PR>. Avec, les dernières PR fusionnées (« Version et nouveautés » du panel).
export const PREFIXES = { plateforme: "P1.0", vitrine: "1.0" };
const historiques = new Map();
export async function historique(commit) {
  if (!SHA.test(commit ?? "")) return null;
  const c = historiques.get(commit);
  if (c && (c.valeur || c.jusqua > Date.now())) return c.valeur;
  let valeur = null;
  try {
    const j = await github(`/commits?sha=${commit}&per_page=60`);
    if (Array.isArray(j)) {
      const vus = new Set();
      const prs = [];
      for (const x of j) {
        const premiere = String(x.commit?.message ?? "").split("\n")[0];
        const m = /^Merge pull request #(\d+)/.exec(premiere) ?? /\(#(\d+)\)\s*$/.exec(premiere);
        if (!m || vus.has(m[1])) continue;
        vus.add(m[1]);
        const t = titre(x);
        prs.push({ numero: Number(m[1]), titre: t.titre.replace(/\s*\(#\d+\)\s*$/, ""), date: t.date });
      }
      valeur = { pr: prs[0]?.numero ?? null, prs: prs.slice(0, 25) };
    }
  } catch {
    valeur = null;
  }
  if (historiques.size > 50) historiques.delete(historiques.keys().next().value);
  historiques.set(commit, { valeur, jusqua: Date.now() + 10 * 60 * 1000 });
  return valeur;
}
export const numero = (prefixe, h) => (h?.pr ? `${prefixe}.${h.pr}` : null);

// ------------------------------------------------------------ ce que GitHub propose
// { date, erreur, canaux: { instance: { commit, date } }, vitrine: { commit, date } }
let distant = null;

async function lireJson(f, defaut) {
  try {
    return JSON.parse(await readFile(`${DOSSIER}/${f}`, "utf8"));
  } catch {
    return defaut;
  }
}
async function ecrireJson(f, v) {
  await mkdir(DOSSIER, { recursive: true });
  const tmp = `${DOSSIER}/${f}.tmp`;
  await writeFile(tmp, JSON.stringify(v, null, 1));
  await rename(tmp, `${DOSSIER}/${f}`);
}

async function chercher(canaux) {
  const erreurs = [];
  const res = { date: new Date().toISOString(), erreur: null, canaux: {}, vitrine: null };
  await Promise.all([
    ...canaux.map(async (canal) => {
      try {
        const j = await github(`/actions/workflows/docker-image.yml/runs?branch=${encodeURIComponent(BRANCHE_CANAL[canal])}&event=push&status=success&per_page=1`);
        const run = j?.workflow_runs?.[0];
        if (run && SHA.test(run.head_sha)) res.canaux[canal] = { commit: run.head_sha, date: run.updated_at ?? run.created_at ?? null };
      } catch (e) {
        erreurs.push(e.message);
      }
    }),
    (async () => {
      try {
        const j = await github(`/commits/${encodeURIComponent(VITRINE_BRANCHE)}`);
        if (j && SHA.test(j.sha)) res.vitrine = { commit: j.sha, date: j.commit?.committer?.date ?? null };
      } catch (e) {
        erreurs.push(e.message);
      }
    })(),
  ]);
  if (erreurs.length) {
    res.erreur = erreurs[0];
    // Une vérification ratée garde ce qu'on savait déjà (mieux qu'une page vide).
    for (const [k, v] of Object.entries(distant?.canaux ?? {})) res.canaux[k] ??= v;
    res.vitrine ??= distant?.vitrine ?? null;
  }
  distant = res;
  await ecrireJson("distant.json", res).catch(() => {});
  return res;
}

// ------------------------------------------------------------ calcul
// entree : { clients: [{ nom, canal, revision, suspendu, demo }], vitrine: commit installé ou null,
//            plateforme: résultat de plateforme.mjs etat() }
export async function resume(entree) {
  distant ??= await lireJson("distant.json", null);
  const reglages = await lireReglages();
  const canaux = {};
  for (const c of entree.clients) {
    if (!BRANCHE_CANAL[c.canal]) continue;
    canaux[c.canal] ??= { disponible: distant?.canaux?.[c.canal] ?? null, clients: [] };
  }
  const parClient = {};
  await Promise.all(
    entree.clients.map(async (c) => {
      const k = canaux[c.canal];
      if (!k) return;
      const dispo = k.disponible?.commit;
      const installe = SHA.test(c.revision ?? "") ? c.revision : null;
      const cmp = dispo && installe ? await comparer(installe, dispo) : null;
      const info = {
        nom: c.nom,
        installe,
        // null = on ne sait pas (pas d'étiquette, GitHub injoignable, site arrêté…)
        enRetard: cmp ? cmp.enRetard : null,
        changements: cmp?.changements ?? [],
        suspendu: Boolean(c.suspendu),
        demo: Boolean(c.demo),
      };
      parClient[c.nom] = { canal: c.canal, enRetard: info.enRetard, disponible: dispo ?? null };
      k.clients.push(info);
    }),
  );
  for (const k of Object.values(canaux)) {
    k.clients.sort((a, b) => a.nom.localeCompare(b.nom));
    // Les clients en pause prennent la nouvelle version à leur réactivation : pas à compter.
    k.aMettreAJour = k.clients.filter((c) => !c.suspendu && c.enRetard > 0).map((c) => c.nom);
    // La liste de changements la plus longue (celle du client le plus en retard).
    const pire = k.clients.filter((c) => c.enRetard > 0).sort((a, b) => b.enRetard - a.enRetard)[0];
    k.enRetard = pire?.enRetard ?? 0;
    k.changements = pire?.changements ?? [];
  }
  let vitrine = null;
  const vi = SHA.test(entree.vitrine ?? "") ? entree.vitrine : null;
  if (distant?.vitrine) {
    const cmp = vi ? await comparer(vi, distant.vitrine.commit) : await depuisDate(entree.vitrineDate, distant.vitrine.commit);
    vitrine = { installe: vi, installeLe: entree.vitrineDate ?? null, disponible: distant.vitrine, enRetard: cmp ? cmp.enRetard : null, changements: cmp?.changements ?? [] };
  } else vitrine = { installe: vi, installeLe: entree.vitrineDate ?? null, disponible: null, enRetard: null, changements: [] };
  if (vitrine.installe) {
    const h = await historique(vitrine.installe);
    vitrine.numero = numero(PREFIXES.vitrine, h);
    vitrine.historique = h?.prs ?? [];
  }
  const p = entree.plateforme?.nouveautes;
  return {
    date: distant?.date ?? null,
    erreur: distant?.erreur ?? null,
    alerte: reglages.alerte,
    canaux,
    vitrine,
    plateforme: p ? { enRetard: p.enRetard, dernier: p.dernier ?? null } : null,
    parClient,
  };
}

// ------------------------------------------------------------ réglages et alertes
async function lireReglages() {
  const r = await lireJson("reglages.json", {});
  return { alerte: r.alerte !== false };
}
export async function regler(corps) {
  if (typeof corps?.alerte !== "boolean") throw new Error("Réglage inconnu.");
  await ecrireJson("reglages.json", { alerte: corps.alerte });
  return lireReglages();
}

const NOMS = { instance: "Standard", "beta-instance": "Bêta", plateforme: "Ancienne (plateforme)", beta: "Bêta des sites LXC", stable: "Stable des sites LXC" };
const liste = (ch) => ch.slice(0, 5).map((c) => `  • ${c.titre}`).join("\n");

// Vérifie maintenant. entree() rend { clients, vitrine, plateforme } (lu au dernier moment).
// alerter(titre, texte) : celui de surveillance.mjs. Une seule alerte par nouvelle version.
export async function verifier(entree, alerter) {
  const e0 = await entree();
  const canaux = [...new Set(["instance", "beta-instance", ...e0.clients.map((c) => c.canal)])].filter((c) => BRANCHE_CANAL[c]);
  await chercher(canaux);
  const e = await entree();
  const r = await resume(e);
  const prevenu = await lireJson("prevenu.json", {});
  const morceaux = [];
  const nouveau = { ...prevenu };
  for (const [canal, k] of Object.entries(r.canaux)) {
    const dispo = k.disponible?.commit;
    if (!dispo || !k.aMettreAJour.length || prevenu[`canal:${canal}`] === dispo) continue;
    nouveau[`canal:${canal}`] = dispo;
    morceaux.push(
      `Clients ${NOMS[canal] ?? canal} : nouvelle version (${k.enRetard} changement${k.enRetard > 1 ? "s" : ""}), ${k.aMettreAJour.length} client${k.aMettreAJour.length > 1 ? "s" : ""} à mettre à jour (${k.aMettreAJour.slice(0, 8).join(", ")}${k.aMettreAJour.length > 8 ? "…" : ""}).\n${liste(k.changements)}`,
    );
  }
  const pf = e.plateforme?.nouveautes;
  if (pf?.enRetard > 0 && pf.dernier && prevenu.plateforme !== pf.dernier) {
    nouveau.plateforme = pf.dernier;
    morceaux.push(`Plateforme (panel, connexion, outils) : ${pf.enRetard} changement${pf.enRetard > 1 ? "s" : ""}.\n${liste(pf.changements ?? [])}`);
  }
  if (r.vitrine?.enRetard > 0 && prevenu.vitrine !== r.vitrine.disponible.commit) {
    nouveau.vitrine = r.vitrine.disponible.commit;
    morceaux.push(`Site vitrine : ${r.vitrine.enRetard} changement${r.vitrine.enRetard > 1 ? "s" : ""}.\n${liste(r.vitrine.changements)}`);
  }
  let envoi = null;
  if (morceaux.length) {
    // Même alerte coupée, on retient ce qui a été vu : la rallumer ne renvoie pas les vieilles versions.
    await ecrireJson("prevenu.json", nouveau).catch(() => {});
    if (r.alerte) {
      envoi = await alerter(
        "🆕 Mise à jour disponible",
        `${morceaux.join("\n\n")}\n\nRien n'est installé tout seul : c'est toi qui lances la mise à jour depuis le panel (Accueil → Mises à jour).`,
      );
    }
  }
  return { ...r, prevenu: morceaux.length, envoi };
}
