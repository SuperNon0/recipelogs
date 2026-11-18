// Mise à jour de la plateforme elle-même (panel, connexion, passerelle, outils) depuis le
// panel : le même install.sh que l'étape I1 de A-FAIRE.md, lancé sur la machine.
//
// Le moteur tourne dans un conteneur que la mise à jour va recréer : il ne peut pas suivre
// lui-même le script. Il démarre donc un petit conteneur qui entre dans la machine (nsenter)
// et y confie install.sh à systemd (service passager « recipelog-maj-plateforme ») : le script
// continue même quand Docker recrée le moteur et le panel. Le script écrit où il en est dans
// ${DONNEES}/maj-plateforme/ (etat.json, journal.txt) ; install.sh y écrit version.json à la fin.
import { readFile } from "node:fs/promises";
import { PREFIXES, historique, numero } from "./nouveautes.mjs";

const DONNEES = process.env.DONNEES || "/srv/recipelog";
const DOSSIER = `${DONNEES}/maj-plateforme`;
const UNITE = "recipelog-maj-plateforme";
// Au-delà, une mise à jour toujours « en cours » est considérée comme interrompue
// (machine redémarrée en plein milieu, par exemple).
const DUREE_MAX = 45 * 60 * 1000;

const lireJson = async (f) => {
  try {
    return JSON.parse(await readFile(`${DOSSIER}/${f}`, "utf8"));
  } catch {
    return null;
  }
};

// Ce que GitHub a de nouveau sur la branche depuis la version installée (gardé 10 minutes).
let nouveautes = { cle: "", jusqua: 0, valeur: null };
async function chercherNouveautes(v) {
  const m = /github\.com[/:]([^/]+)\/([^/.]+)(\.git)?\/?$/.exec(v?.depot ?? "");
  if (!m || !/^[0-9a-f]{40}$/.test(v.commit ?? "") || !/^[A-Za-z0-9._/-]+$/.test(v.branche ?? "")) return null;
  const cle = `${v.commit}…${v.branche}`;
  if (nouveautes.cle === cle && nouveautes.jusqua > Date.now()) return nouveautes.valeur;
  let valeur = null;
  try {
    const r = await fetch(`https://api.github.com/repos/${m[1]}/${m[2]}/compare/${v.commit}...${encodeURIComponent(v.branche)}`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "recipelog-plateforme" },
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) {
      const j = await r.json();
      valeur = {
        enRetard: j.ahead_by ?? 0,
        // Dernier commit de la branche : sert à ne prévenir qu'une fois par nouvelle version.
        dernier: (j.commits ?? []).at(-1)?.sha ?? null,
        changements: (j.commits ?? [])
          .map((c) => ({ titre: String(c.commit?.message ?? "").split("\n")[0].slice(0, 200), date: c.commit?.committer?.date ?? null }))
          .reverse()
          .slice(0, 15),
      };
    }
  } catch {
    valeur = null;
  }
  nouveautes = { cle, jusqua: Date.now() + (valeur ? 10 : 2) * 60 * 1000, valeur };
  return valeur;
}

// « Vérifier maintenant » dans le panel : redemander à GitHub sans attendre les 10 minutes.
export function oublierNouveautes() {
  nouveautes = { cle: "", jusqua: 0, valeur: null };
}

export async function etat() {
  const version = await lireJson("version.json");
  let maj = await lireJson("etat.json");
  if (maj?.etat === "en-cours" && Date.now() - Date.parse(maj.debut) > DUREE_MAX) maj = { ...maj, etat: "fini", ok: false, interrompue: true };
  let complet = "";
  try {
    complet = (await readFile(`${DOSSIER}/journal.txt`, "utf8")).replace(/\x1b\[[0-9;]*m/g, "").replace(/\r/g, "");
  } catch {
    complet = "";
  }
  const journal = complet.split("\n").slice(-300).join("\n");
  // Numéro lisible (P1.0.<dernière PR>) et dernières PR installées, demandés une fois par version.
  const h = version ? await historique(version.commit).catch(() => null) : null;
  return {
    version: version
      ? { commit: version.commit, court: String(version.commit ?? "").slice(0, 7), numero: numero(PREFIXES.plateforme, h), branche: version.branche, date: version.date, historique: h?.prs ?? [] }
      : null,
    maj,
    journal,
    avancement: avancement(complet, maj),
    nouveautes: version ? await chercherNouveautes(version) : null,
  };
}

// Les grandes étapes de la console du panel, lues dans tout le journal d'install.sh (ses
// lignes « ==> … ») : on garde l'avancement même quand le début du journal n'est plus affiché.
export const ETAPES = [
  { id: "telechargement", nom: "Téléchargement de la nouvelle version" },
  { id: "preparation", nom: "Préparation des réglages" },
  { id: "construction", nom: "Construction du panel et des outils" },
  { id: "redemarrage", nom: "Redémarrage des services" },
  { id: "connexion", nom: "Vérification de la connexion" },
];
const REPERES = [
  [/Téléchargement d'install|Paquets de base|Mémoire d'échange|Installation de Docker|Pare-feu|Fichiers de la plateforme/, 0],
  [/Réglages (écrits|existants)|Version par défaut|Démarrage de PostgreSQL|Site vitrine/, 1],
  [/Démarrage de Traefik|Redémarrage des services/, 2],
  [/Attente d'Authentik|Attente de la connexion|Page de connexion|super-admin|Accès du panel|Se connecter|Client de test/, 4],
];
// Lignes de Docker Compose quand il (re)lance les conteneurs, après la construction.
const CONTENEUR = /^\s*Container \S+\s+(Recreate|Recreated|Creating|Created|Starting|Started|Stopping|Stopped|Waiting|Healthy|Running)\b/;

export function avancement(texte, maj) {
  const lignes = String(texte ?? "").split("\n");
  let etape = 0;
  let detail = "";
  let relances = 0;
  const alertes = [];
  for (const brute of lignes) {
    const l = brute.trim();
    if (!l) continue;
    if (l.startsWith("==> ")) {
      const r = REPERES.find(([re]) => re.test(l));
      if (r && r[1] >= etape) etape = r[1];
      detail = l.slice(4).replace(/…$/, "").replace(/^✅\s*/, "");
      continue;
    }
    if (/^(⚠️|❌)/.test(l)) {
      alertes.push(l.replace(/^(⚠️|❌)\s*/, ""));
      continue;
    }
    if (etape === 2 || etape === 3) {
      const b = /^#\d+ \[([\w.-]+) (\d+)\/(\d+)\]/.exec(l);
      if (b && etape === 2) detail = `${b[1]} : étape ${b[2]} sur ${b[3]}`;
      if (CONTENEUR.test(l)) {
        etape = 3;
        if (/Recreate|Started|Created/.test(l)) relances += 1;
        detail = `Service ${l.replace(/^\s*Container\s+/, "").replace(/^recipelog-/, "").split(/\s+/)[0]}`;
      }
    }
  }
  const fini = maj?.etat === "fini";
  return { etapes: ETAPES, etape: fini && maj.ok ? ETAPES.length : etape, detail, relances, alertes: alertes.slice(-6) };
}

// Script lancé sur la machine (en root, hors de Docker). Variables : B (branche), D (dossier).
const SCRIPT = String.raw`
set -u
mkdir -p "$D"
debut="$(date -Iseconds)"
printf '{"etat":"en-cours","debut":"%s"}\n' "$debut" > "$D/etat.json"
{
  echo "==> Téléchargement d'install.sh (branche $B)…"
  curl -fsSL "https://raw.githubusercontent.com/SuperNon0/recipelogs/$B/plateforme/install.sh?maj=$(date +%s)" -o /root/recipelog-install.sh \
    && RECIPELOG_NONINTERACTIVE=1 RECIPELOG_MAJ=1 RECIPELOG_BRANCH="$B" bash /root/recipelog-install.sh
} > "$D/journal.txt" 2>&1 < /dev/null
code=$?
ok=false; [ "$code" = 0 ] && ok=true
printf '{"etat":"fini","ok":%s,"code":%s,"debut":"%s","fin":"%s"}\n' "$ok" "$code" "$debut" "$(date -Iseconds)" > "$D/etat.json"
`;

// lancer(cmd, args, délai) : celui du moteur (rend { ok, sortie }).
export async function demarrer(lancer) {
  const e = await etat();
  if (e.maj?.etat === "en-cours") return { ok: false, sortie: "Une mise à jour de la plateforme est déjà en cours." };
  const branche = e.version?.branche && /^[A-Za-z0-9._/-]+$/.test(e.version.branche) ? e.version.branche : "plateforme";
  // Image du panel : elle a nsenter (util-linux). --pid=host + privilégié : pour entrer dans la machine.
  return lancer(
    "docker",
    [
      "run", "--rm", "--name", "recipelog-maj-plateforme-lanceur", "--privileged", "--pid=host", "--network=none",
      "recipelog-panel:local",
      "nsenter", "-t", "1", "-m", "-u", "-i", "-n", "-p", "--",
      "systemd-run", `--unit=${UNITE}-${Date.now()}`, "--collect", "--quiet",
      `--setenv=B=${branche}`, `--setenv=D=${DOSSIER}`,
      "/bin/bash", "-c", SCRIPT,
    ],
    60000,
  );
}
