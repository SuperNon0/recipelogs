// Mise à jour de la plateforme elle-même (panel, connexion, passerelle, outils) depuis le
// panel : le même install.sh que l'étape I1 de A-FAIRE.md, lancé sur la machine.
//
// Le moteur tourne dans un conteneur que la mise à jour va recréer : il ne peut pas suivre
// lui-même le script. Il démarre donc un petit conteneur qui entre dans la machine (nsenter)
// et y confie install.sh à systemd (service passager « recipelog-maj-plateforme ») : le script
// continue même quand Docker recrée le moteur et le panel. Le script écrit où il en est dans
// ${DONNEES}/maj-plateforme/ (etat.json, journal.txt) ; install.sh y écrit version.json à la fin.
import { readFile } from "node:fs/promises";

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
  let journal = "";
  try {
    journal = (await readFile(`${DOSSIER}/journal.txt`, "utf8")).replace(/\x1b\[[0-9;]*m/g, "").split("\n").slice(-80).join("\n");
  } catch {
    journal = "";
  }
  return {
    version: version ? { commit: version.commit, court: String(version.commit ?? "").slice(0, 7), branche: version.branche, date: version.date } : null,
    maj,
    journal,
    nouveautes: version ? await chercherNouveautes(version) : null,
  };
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
