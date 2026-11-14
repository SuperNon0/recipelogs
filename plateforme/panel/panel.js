// Panel admin RecipeLog : tout se passe dans cette page, qui parle à /api/… .
"use strict";

const $ = (s, el = document) => el.querySelector(s);
const DOMAINE = document.body.dataset.domaine;
const e = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const dateFr = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—");
const heureFr = (iso) => new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

let CLIENTS = [];

// ------------------------------------------------------------ API
async function api(methode, chemin, corps) {
  const r = await fetch(`/api${chemin}`, {
    method: methode,
    headers: { "Content-Type": "application/json", "X-Panel": "1" },
    body: corps ? JSON.stringify(corps) : undefined,
  });
  let j = {};
  try {
    j = await r.json();
  } catch {
    j = {};
  }
  if (r.status === 401) {
    location.reload();
    throw new Error("Session expirée.");
  }
  return { ok: r.ok && j.ok !== false, statut: r.status, ...j };
}

// ------------------------------------------------------------ aide « ? »
document.addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-aide]");
  if (!b) return;
  const t = document.getElementById(b.dataset.aide);
  if (t) {
    t.classList.toggle("visible");
    b.setAttribute("aria-expanded", t.classList.contains("visible"));
  }
});
const aide = (id, texte) => `<button class="aide" type="button" data-aide="${id}" aria-label="Aide">?</button></label><p class="texte-aide" id="${id}">${texte}</p>`;

// ------------------------------------------------------------ fenêtre (croix seulement)
const voile = $("#voile");
let apresFermeture = null;
function ouvrir(titre, html, fermeture = null) {
  $("#fenetre-titre").textContent = titre;
  $("#fenetre-corps").innerHTML = html;
  apresFermeture = fermeture;
  voile.classList.add("ouvert");
  document.body.style.overflow = "hidden";
}
$("#croix").addEventListener("click", () => {
  voile.classList.remove("ouvert");
  document.body.style.overflow = "";
  const f = apresFermeture;
  apresFermeture = null;
  if (f) f();
});

// Action longue : attente, puis ce que l'outil a répondu.
async function executer(titre, requete) {
  ouvrir(titre, `<p class="attente"><span class="rond"></span>En cours… (une création ou une mise à jour prend 1 à 3 minutes)</p>`);
  $("#croix").disabled = true;
  let r;
  try {
    r = await requete();
  } catch (err) {
    r = { ok: false, sortie: String(err.message ?? err) };
  }
  $("#croix").disabled = false;
  const texte = r.sortie || r.message || (r.ok ? "Fait." : "Échec.");
  $("#fenetre-corps").innerHTML = `<p class="etiquette ${r.ok ? "ok" : "ko"}">${r.ok ? "Réussi" : "Échec"}</p><pre class="sortie">${e(texte)}</pre>`;
  apresFermeture = charger;
  return r;
}

// ------------------------------------------------------------ affichage
function etat(c) {
  if (c.suspendu) return `<span class="etiquette pause">En pause</span>`;
  if (c.etat === "healthy") return `<span class="etiquette ok">En ligne</span>`;
  if (c.etat === "starting") return `<span class="etiquette prog">Démarre</span>`;
  return `<span class="etiquette ko">${e(c.etat === "unhealthy" ? "En panne" : "Arrêté")}</span>`;
}
// Jours entre aujourd'hui et la fin de l'essai (le jour de fin compte encore).
const joursRestants = (fin) => Math.round((Date.parse(`${fin}T00:00:00Z`) - Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)) / 86400000);
function places(c) {
  if (c.connexion !== "authentik") return "Cloudflare";
  if (!c.places) return "—";
  return `${c.places.membres} / ${c.places.max ?? "∞"}`;
}
function offre(c) {
  if (!c.essaiFin) return `Client depuis le ${dateFr(c.creeLe)}`;
  const j = joursRestants(c.essaiFin);
  return j >= 0 ? `<span class="etiquette acc">Essai : ${j} j</span>` : `<span class="etiquette pause">Essai fini</span>`;
}

function afficher() {
  const n = CLIENTS.length;
  const enLigne = CLIENTS.filter((c) => !c.suspendu && c.etat === "healthy").length;
  const pause = CLIENTS.filter((c) => c.suspendu).length;
  const essais = CLIENTS.filter((c) => c.essaiFin && !c.suspendu).length;
  const comptes = CLIENTS.reduce((s, c) => s + (c.places?.membres ?? 0), 0);
  $("#chiffres").innerHTML = [
    [n, n > 1 ? "clients" : "client"],
    [enLigne, "en ligne"],
    [`${essais} · ${pause}`, "en essai · en pause"],
    [comptes, "comptes au total"],
  ]
    .map(([v, l]) => `<div class="chiffre"><b>${e(v)}</b><span>${e(l)}</span></div>`)
    .join("");

  const filtre = $("#recherche").value.trim().toLowerCase();
  const liste = CLIENTS.filter((c) => !filtre || c.nom.includes(filtre));
  if (!liste.length) {
    $("#clients").innerHTML = `<div class="vide">${n ? "Aucun client ne correspond." : "Pas encore de client. Crée le premier avec « Nouveau client »."}</div>`;
    return;
  }
  $("#clients").innerHTML = liste
    .map(
      (c) => `<article class="client" data-nom="${e(c.nom)}">
      <div class="nom"><b>${e(c.nom)}</b><a href="${e(c.adresse)}" target="_blank" rel="noopener">${e(c.adresse.replace("https://", ""))} ↗</a></div>
      <div class="info"><span class="lbl">État</span>${etat(c)}</div>
      <div class="info"><span class="lbl">Places</span>${places(c)}</div>
      <div class="info"><span class="lbl">Version</span>${e(c.version ?? "—")} <small class="canal">${e(c.canal)}</small></div>
      <div class="info"><span class="lbl">Offre</span>${offre(c)}${c.mcp ? "" : ` <span class="etiquette ko" title="Accès MCP coupé">sans MCP</span>`}</div>
      <div class="actions">
        <a class="btn petit" href="${e(c.adresse)}" target="_blank" rel="noopener">Ouvrir</a>
        ${c.connexion === "authentik" ? `<button class="btn petit" data-act="equipe">Équipe</button>` : ""}
        <button class="btn petit" data-act="reglages">Réglages</button>
        ${c.suspendu ? `<button class="btn petit" data-act="reactiver">Réactiver</button>` : `<button class="btn petit" data-act="mettre-a-jour">Mettre à jour</button><button class="btn petit" data-act="suspendre">Pause</button>`}
        <button class="btn petit danger" data-act="supprimer">Supprimer</button>
      </div>
    </article>`,
    )
    .join("");
}

const NOMS_ACTIONS = {
  creer: "a créé",
  "mettre-a-jour": "a mis à jour",
  redemarrer: "a redémarré",
  suspendre: "a mis en pause",
  reactiver: "a réactivé",
  quota: "a changé les places de",
  options: "a changé les options de",
  essai: "a changé l'essai de",
  inviter: "a invité dans",
  renvoyer: "a renvoyé l'invitation dans",
  retirer: "a retiré de l'équipe de",
  supprimer: "a supprimé",
  "fin-essai": "a mis en pause (essai fini)",
};
let JOURNAL = [];
function afficherJournal() {
  if (!JOURNAL.length) {
    $("#journal").innerHTML = `<div class="ligne"><span>Aucune action pour l'instant.</span></div>`;
    return;
  }
  $("#journal").innerHTML = JOURNAL.slice(0, 40)
    .map((l, i) => {
      const d = l.details ?? {};
      const plus = d.email ? ` (${e(d.email)})` : d.max !== undefined ? ` (${d.max || "pas de plafond"})` : d.jours !== undefined ? ` (${d.jours ? `${d.jours} j` : "fin"})` : d.mcp !== undefined ? ` (MCP ${d.mcp ? "permis" : "coupé"})` : "";
      return `<div class="ligne"><time>${heureFr(l.date)}</time><span class="qui">${e(l.qui)}</span>
        <span>${e(NOMS_ACTIONS[l.action] ?? l.action)} <b>${e(l.client)}</b>${plus} ${l.ok ? "" : `<span class="etiquette ko">échec</span>`}</span>
        <button type="button" data-journal="${i}">Détails</button></div>`;
    })
    .join("");
}
$("#journal").addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-journal]");
  if (!b) return;
  const l = JOURNAL[Number(b.dataset.journal)];
  ouvrir(`Détails : ${l.client}`, `<p class="sub">${e(heureFr(l.date))} · ${e(l.qui)}</p><pre class="sortie">${e(l.sortie || "(rien à afficher)")}</pre>`);
});

async function charger() {
  const [c, j] = await Promise.all([api("GET", "/clients"), api("GET", "/journal")]);
  if (c.clients) CLIENTS = c.clients.sort((a, b) => a.nom.localeCompare(b.nom));
  else $("#clients").innerHTML = `<div class="vide">Liste indisponible : ${e(c.message ?? "le moteur ne répond pas")}</div>`;
  JOURNAL = j.journal ?? [];
  if (c.clients) afficher();
  afficherJournal();
}
$("#recherche").addEventListener("input", afficher);

// ------------------------------------------------------------ nouveau client
$("#nouveau").addEventListener("click", () => {
  ouvrir(
    "Nouveau client",
    `<p class="sub">Crée son RecipeLog, sa base, son accès dans Authentik, puis envoie l'invitation au responsable.</p>
    <form id="f-nouveau" novalidate>
      <div class="champ"><label for="n-nom">Nom ${aide("a-nom", `Devient l'adresse du site : <b>nom.${e(DOMAINE)}</b>. Minuscules, chiffres et tirets, 2 à 32 caractères. Ne peut plus être changé ensuite.`)}
        <div class="suffixe"><input id="n-nom" type="text" required pattern="[a-z0-9][a-z0-9-]{0,30}[a-z0-9]" autocapitalize="none" spellcheck="false" placeholder="patisserie-martin"><span>.${e(DOMAINE)}</span></div></div>
      <div class="champ"><label for="n-resp">Email du responsable ${aide("a-resp", "Il reçoit l'email « Choisis ton mot de passe » et devient administrateur de son RecipeLog à sa première connexion. Il invite ensuite lui-même son équipe. Laisser vide : tu inviteras plus tard (bouton Équipe).")}
        <input id="n-resp" type="email" autocapitalize="none" placeholder="chef@patisserie.fr"></div>
      <div class="champ"><label for="n-max">Nombre de comptes ${aide("a-max", "Combien de personnes de son équipe peuvent se connecter (le responsable compte). 0 = pas de limite. Toi, tu ne comptes jamais.")}
        <input id="n-max" type="number" min="0" max="10000" value="10"></div>
      <div class="champ"><label for="n-essai">Essai gratuit ${aide("a-essai", "Nombre de jours d'essai. À la fin, le site se met en pause tout seul (les données sont gardées) jusqu'à ce que tu le réactives. 0 = pas d'essai.")}
        <div class="suffixe"><input id="n-essai" type="number" min="0" max="3650" value="0"><span>jours</span></div></div>
      <div class="champ"><label for="n-canal">Version ${aide("a-canal", "Stable : la version des clients, testée. Bêta : suit ton site (main). Plateforme : suit le chantier en cours, pour tes essais.")}
        <select id="n-canal"><option value="stable">Stable (conseillé)</option><option value="beta">Bêta</option><option value="plateforme">Plateforme (essais)</option></select></div>
      <div class="champ"><label class="case"><input id="n-mcp" type="checkbox" checked> Accès MCP (Claude) ${aide("a-mcp", "Permet au client de brancher Claude sur son RecipeLog (Réglages → Accès MCP). Décoché : le menu disparaît chez lui et l'adresse MCP est fermée.")}</div>
      <p class="erreur" id="n-erreur"></p>
      <div class="pied"><button class="btn principal" type="submit">Créer le client</button></div>
    </form>`,
  );
  $("#f-nouveau").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const corps = {
      nom: $("#n-nom").value.trim().toLowerCase(),
      responsable: $("#n-resp").value.trim(),
      max: Number($("#n-max").value || 0),
      essai: Number($("#n-essai").value || 0),
      canal: $("#n-canal").value,
      mcp: $("#n-mcp").checked,
    };
    if (!/^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$/.test(corps.nom)) return ($("#n-erreur").textContent = "Nom : 2 à 32 caractères, minuscules, chiffres et tirets.");
    if (CLIENTS.some((c) => c.nom === corps.nom)) return ($("#n-erreur").textContent = "Ce client existe déjà.");
    if (corps.responsable && !/^\S+@\S+\.\S+$/.test(corps.responsable)) return ($("#n-erreur").textContent = "Adresse du responsable invalide.");
    await executer(`Création de ${corps.nom}`, () => api("POST", "/clients", corps));
  });
});

$("#tout-maj").addEventListener("click", () =>
  executer("Mise à jour de tous les clients", () => api("POST", "/tous/mettre-a-jour")),
);

// ------------------------------------------------------------ actions d'un client
$("#clients").addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-act]");
  if (!b) return;
  const c = CLIENTS.find((x) => x.nom === b.closest("[data-nom]").dataset.nom);
  const act = b.dataset.act;
  if (act === "mettre-a-jour") executer(`Mise à jour de ${c.nom}`, () => api("POST", `/clients/${c.nom}/mettre-a-jour`));
  if (act === "reactiver") executer(`Réactivation de ${c.nom}`, () => api("POST", `/clients/${c.nom}/reactiver`));
  if (act === "suspendre") fenetrePause(c);
  if (act === "supprimer") fenetreSuppression(c);
  if (act === "reglages") fenetreReglages(c);
  if (act === "equipe") fenetreEquipe(c);
});

function fenetrePause(c) {
  ouvrir(
    `Mettre ${c.nom} en pause ?`,
    `<p class="sub">Son site affiche « Ce RecipeLog est en pause ». Rien n'est effacé : recettes, comptes et fichiers restent là, et « Réactiver » le remet en ligne en une minute.</p>
    <div class="pied"><button class="btn principal" id="ok-pause" type="button">Mettre en pause</button></div>`,
  );
  $("#ok-pause").addEventListener("click", () => executer(`Pause de ${c.nom}`, () => api("POST", `/clients/${c.nom}/suspendre`)));
}

function fenetreSuppression(c) {
  ouvrir(
    `Supprimer ${c.nom} ?`,
    `<p class="sub">Le site s'arrête, sa base et ses fichiers partent dans une archive sur la machine (<code>/srv/recipelog/archives</code>), son accès Authentik est retiré et les comptes qui ne servent plus ailleurs sont désactivés.</p>
    <div class="champ"><label for="s-nom">Tape <b>${e(c.nom)}</b> pour confirmer</label><input id="s-nom" type="text" autocapitalize="none" spellcheck="false"></div>
    <p class="erreur" id="s-erreur"></p>
    <div class="pied"><button class="btn danger" id="ok-supprimer" type="button">Supprimer définitivement</button></div>`,
  );
  $("#ok-supprimer").addEventListener("click", () => {
    if ($("#s-nom").value.trim() !== c.nom) return ($("#s-erreur").textContent = "Le nom ne correspond pas.");
    executer(`Suppression de ${c.nom}`, () => api("POST", `/clients/${c.nom}/supprimer`, { confirmation: c.nom }));
  });
}

function fenetreReglages(c) {
  const max = c.places?.max ?? 0;
  const jours = c.essaiFin ? Math.max(joursRestants(c.essaiFin), 0) : 0;
  ouvrir(
    `Réglages de ${c.nom}`,
    `<form id="f-reglages" novalidate>
      ${c.connexion === "authentik" ? `<div class="champ"><label for="r-max">Nombre de comptes ${aide("r-a-max", "Combien de personnes de son équipe peuvent se connecter. 0 = pas de limite. Baisser sous le nombre actuel ne retire personne : il ne pourra juste plus inviter.")}
        <input id="r-max" type="number" min="0" max="10000" value="${max}"></div>` : ""}
      <div class="champ"><label for="r-essai">Essai : jours restants ${aide("r-a-essai", "Change la fin de l'essai à partir d'aujourd'hui. 0 = ce n'est plus un essai (client normal, plus de pause automatique). Un client mis en pause par la fin d'essai se rouvre avec « Réactiver ».")}
        <div class="suffixe"><input id="r-essai" type="number" min="0" max="3650" value="${jours}"><span>${c.essaiFin ? `jusqu'au ${e(dateFr(c.essaiFin))}` : "pas d'essai"}</span></div></div>
      <div class="champ"><label class="case"><input id="r-mcp" type="checkbox" ${c.mcp ? "checked" : ""}> Accès MCP (Claude) ${aide("r-a-mcp", "Permet au client de brancher Claude sur son RecipeLog. Changer cette case redémarre son site (environ une minute).")}</div>
      <p class="erreur" id="r-erreur"></p>
      <div class="pied"><button class="btn principal" type="submit">Enregistrer</button></div>
    </form>`,
  );
  $("#f-reglages").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const etapes = [];
    const nMax = $("#r-max") ? Number($("#r-max").value || 0) : max;
    const nJours = Number($("#r-essai").value || 0);
    const nMcp = $("#r-mcp").checked;
    if ($("#r-max") && nMax !== max) etapes.push(["Places", () => api("POST", `/clients/${c.nom}/quota`, { max: nMax })]);
    if (nJours !== jours) etapes.push(["Essai", () => api("POST", `/clients/${c.nom}/essai`, { jours: nJours })]);
    if (nMcp !== c.mcp) etapes.push(["MCP", () => api("POST", `/clients/${c.nom}/options`, { mcp: nMcp })]);
    if (!etapes.length) return ($("#r-erreur").textContent = "Rien n'a changé.");
    await executer(`Réglages de ${c.nom}`, async () => {
      const sorties = [];
      let ok = true;
      for (const [nom, f] of etapes) {
        const r = await f();
        ok = ok && r.ok;
        sorties.push(`${nom} : ${r.sortie || r.message || (r.ok ? "fait" : "échec")}`);
      }
      return { ok, sortie: sorties.join("\n") };
    });
  });
}

async function fenetreEquipe(c) {
  ouvrir(`Équipe de ${c.nom}`, `<p class="attente"><span class="rond"></span>Chargement…</p>`, charger);
  const r = await api("GET", `/clients/${c.nom}/equipe`);
  if (!r.membres) {
    $("#fenetre-corps").innerHTML = `<p class="erreur">${e(r.message ?? "Équipe indisponible.")}</p>`;
    return;
  }
  const lignes = r.membres.length
    ? r.membres
        .map(
          (m) => `<div class="membre" data-email="${e(m.email)}"><div><b>${e(m.nom || m.email)}</b><small>${m.nom && m.nom !== m.email ? `${e(m.email)} · ` : ""}${m.derniereConnexion ? `vu le ${e(dateFr(m.derniereConnexion))}` : "jamais connecté"}${m.actif ? "" : " · désactivé"}</small></div>
          <button class="btn petit" type="button" data-m="renvoyer">Renvoyer</button><button class="btn petit danger" type="button" data-m="retirer">Retirer</button></div>`,
        )
        .join("")
    : `<p class="sub">Personne pour l'instant.</p>`;
  $("#fenetre-corps").innerHTML = `<p class="sub">${r.membres.length} / ${r.max ?? "∞"} places. Le responsable gère aussi son équipe lui-même, dans Réglages → Comptes.</p>
    <div class="membres">${lignes}</div>
    <form id="f-inviter" novalidate><div class="champ"><label for="i-email">Inviter quelqu'un ${aide("i-a", "Crée son compte et lui envoie l'email « Choisis ton mot de passe ». À sa première connexion, il demande l'accès et le responsable l'accepte dans Réglages → Comptes. Pour lui donner un rôle tout de suite, mieux vaut que le responsable l'invite depuis son RecipeLog.")}
      <div class="suffixe"><input id="i-email" type="email" autocapitalize="none" placeholder="prenom@exemple.fr"><button class="btn principal" type="submit">Inviter</button></div></div>
      <p class="erreur" id="i-erreur"></p></form>`;
  $("#f-inviter").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const email = $("#i-email").value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return ($("#i-erreur").textContent = "Adresse invalide.");
    $("#i-erreur").textContent = "Envoi…";
    const x = await api("POST", `/clients/${c.nom}/inviter`, { email });
    if (!x.ok) return ($("#i-erreur").textContent = (x.sortie || x.message || "Échec").replace(/^❌\s*/, ""));
    fenetreEquipe(c);
  });
  $("#fenetre-corps").querySelectorAll("[data-m]").forEach((b) =>
    b.addEventListener("click", async () => {
      const email = b.closest("[data-email]").dataset.email;
      if (b.dataset.m === "retirer" && b.dataset.confirme !== "1") {
        b.dataset.confirme = "1";
        b.textContent = "Confirmer";
        return;
      }
      b.disabled = true;
      const x = await api("POST", `/clients/${c.nom}/${b.dataset.m}`, { email });
      if (b.dataset.m === "renvoyer") {
        b.textContent = x.ok ? "Envoyé ✓" : "Échec";
      } else {
        fenetreEquipe(c);
      }
    }),
  );
}

charger();
setInterval(() => {
  if (!voile.classList.contains("ouvert")) charger();
}, 30000);
