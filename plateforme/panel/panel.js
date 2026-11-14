// Panel admin RecipeLog : tout se passe dans cette page, qui parle à /api/… .
"use strict";

const $ = (s, el = document) => el.querySelector(s);
const DOMAINE = document.body.dataset.domaine;
const e = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const dateFr = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—");
const heureFr = (iso) => new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

let CLIENTS = [];
let VITRINE = null;
let SANTE = null;
let SUPPORT = [];

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
  const s = SANTE?.services?.[`client:${c.nom}`];
  if (s && !s.ok) return `<span class="etiquette ko" title="Ne répond plus depuis le ${e(heureFr(s.depuis))}">En panne</span>`;
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

// Dernière sauvegarde : plus de 36 h, ou test raté = à regarder.
const taille = (o) =>
  o >= 1073741824
    ? `${(o / 1073741824).toFixed(1).replace(".", ",")} Go`
    : o >= 1048576
      ? `${(o / 1048576).toFixed(1).replace(".", ",")} Mo`
      : `${o > 0 ? Math.max(1, Math.round(o / 1024)) : 0} Ko`;
const dateSauv = (id) => new Date(`${id.slice(0, 4)}-${id.slice(4, 6)}-${id.slice(6, 8)}T${id.slice(9, 11)}:${id.slice(11, 13)}:${id.slice(13, 15)}Z`);
function sauvegarde(c) {
  const s = c.sauvegarde;
  if (!s?.derniere) return `<span class="etiquette pause">Aucune</span>`;
  const quand = dateSauv(s.derniere.id);
  const vieille = Date.now() - quand.getTime() > 36 * 3600 * 1000;
  const testKo = s.test && !s.test.ok;
  const texte = quand.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  if (testKo) return `<span class="etiquette ko" title="Le dernier test de restauration a échoué">Test raté</span>`;
  return vieille ? `<span class="etiquette pause" title="Plus de 36 heures">${e(texte)}</span>` : e(texte);
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
      <div class="info"><span class="lbl">État</span>${etat(c)}${dispo(`client:${c.nom}`)}</div>
      <div class="info"><span class="lbl">Places</span>${places(c)}</div>
      <div class="info"><span class="lbl">Version</span>${e(c.version ?? "—")} <small class="canal">${e(c.canal)}</small></div>
      <div class="info"><span class="lbl">Offre</span>${offre(c)}${c.mcp ? "" : ` <span class="etiquette ko" title="Accès MCP coupé">sans MCP</span>`}${c.demo ? ` <span class="etiquette prog">démo</span>` : ""}</div>
      <div class="info"><span class="lbl">Sauvegarde</span>${sauvegarde(c)}</div>
      <div class="actions">
        <a class="btn petit" href="${e(c.adresse)}" target="_blank" rel="noopener">Ouvrir</a>
        ${c.connexion === "authentik" ? `<button class="btn petit" data-act="equipe">Équipe</button>` : ""}
        <button class="btn petit" data-act="reglages">Réglages</button>
        <button class="btn petit" data-act="sauvegardes">Sauvegardes</button>
        <button class="btn petit" data-act="journaux">Journaux</button>
        ${c.demo ? `<button class="btn petit" data-act="demo">Démo</button>` : ""}
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
  sauvegarder: "a sauvegardé",
  restaurer: "a restauré",
  "tester-sauvegarde": "a testé la sauvegarde de",
  telecharger: "a téléchargé une sauvegarde de",
  "sauvegardes-nuit": "a sauvegardé (nuit)",
  "test-sauvegardes": "a testé les sauvegardes (semaine)",
  "demo-figer": "a figé la démo",
  "demo-remettre": "a remis à zéro",
  "vitrine-maj": "a mis à jour la",
  "vitrine-bandeau": "a changé le bandeau de la",
  panne: "a vu une panne :",
  retour: "a vu le retour de",
  "support-repondre": "a répondu à une demande de",
  "support-fermer": "a fermé une demande de",
  "support-rouvrir": "a rouvert une demande de",
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
      const plus = d.texte !== undefined ? ` (${d.texte ? `« ${e(d.texte)} »` : "retiré"})` : d.sauvegarde ? ` (${e(dateSauv(d.sauvegarde).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }))})` : d.email ? ` (${e(d.email)})` : d.max !== undefined ? ` (${d.max || "pas de plafond"})` : d.jours !== undefined ? ` (${d.jours ? `${d.jours} j` : "fin"})` : d.mcp !== undefined ? ` (MCP ${d.mcp ? "permis" : "coupé"})` : "";
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
  const [c, j, v, sa, su] = await Promise.all([api("GET", "/clients"), api("GET", "/journal"), api("GET", "/vitrine"), api("GET", "/mesures"), api("GET", "/support")]);
  VITRINE = v.demandes ? v : null;
  afficherVitrine();
  SANTE = sa.machine ? sa : null;
  SUPPORT = su.demandes ?? null;
  afficherSupport();
  if (c.clients) CLIENTS = c.clients.sort((a, b) => a.nom.localeCompare(b.nom));
  else $("#clients").innerHTML = `<div class="vide">Liste indisponible : ${e(c.message ?? "le moteur ne répond pas")}</div>`;
  JOURNAL = j.journal ?? [];
  if (c.clients) afficher();
  afficherSante();
  afficherJournal();
}
$("#recherche").addEventListener("input", afficher);

// ------------------------------------------------------------ nouveau client
$("#nouveau").addEventListener("click", () => fenetreNouveau());
// pre : valeurs proposées (demande reçue par la vitrine) ; apres : appelé si la création réussit.
function fenetreNouveau(pre = {}, apres = null) {
  ouvrir(
    "Nouveau client",
    `<p class="sub">Crée son RecipeLog, sa base, son accès dans Authentik, puis envoie l'invitation au responsable.</p>
    <form id="f-nouveau" novalidate>
      <div class="champ"><label for="n-nom">Nom ${aide("a-nom", `Devient l'adresse du site : <b>nom.${e(DOMAINE)}</b>. Minuscules, chiffres et tirets, 2 à 32 caractères. Ne peut plus être changé ensuite.`)}
        <div class="suffixe"><input id="n-nom" type="text" required pattern="[a-z0-9][a-z0-9-]{0,30}[a-z0-9]" autocapitalize="none" spellcheck="false" placeholder="patisserie-martin" value="${e(pre.nom ?? "")}"><span>.${e(DOMAINE)}</span></div></div>
      <div class="champ"><label for="n-resp">Email du responsable ${aide("a-resp", "Il reçoit l'email « Choisis ton mot de passe » et devient administrateur de son RecipeLog à sa première connexion. Il invite ensuite lui-même son équipe. Laisser vide : tu inviteras plus tard (bouton Équipe).")}
        <input id="n-resp" type="email" autocapitalize="none" placeholder="chef@patisserie.fr" value="${e(pre.responsable ?? "")}"></div>
      <div class="champ"><label for="n-max">Nombre de comptes ${aide("a-max", "Combien de personnes de son équipe peuvent se connecter (le responsable compte). 0 = pas de limite. Toi, tu ne comptes jamais.")}
        <input id="n-max" type="number" min="0" max="10000" value="10"></div>
      <div class="champ"><label for="n-essai">Essai gratuit ${aide("a-essai", "Nombre de jours d'essai. À la fin, le site se met en pause tout seul (les données sont gardées) jusqu'à ce que tu le réactives. 0 = pas d'essai.")}
        <div class="suffixe"><input id="n-essai" type="number" min="0" max="3650" value="${e(pre.essai ?? 0)}"><span>jours</span></div></div>
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
    const r = await executer(`Création de ${corps.nom}`, () => api("POST", "/clients", corps));
    if (r.ok && apres) await apres();
  });
}

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
  if (act === "sauvegardes") fenetreSauvegardes(c);
  if (act === "demo") fenetreDemo(c);
  if (act === "journaux") fenetreJournaux(c);
});

const ETIQUETTES = { auto: "Nuit", manuelle: "À la main", "avant-restauration": "Avant restauration" };
async function fenetreSauvegardes(c) {
  ouvrir(`Sauvegardes de ${c.nom}`, `<p class="attente"><span class="rond"></span>Chargement…</p>`, charger);
  const r = await api("GET", `/clients/${c.nom}/sauvegardes`);
  if (!r.sauvegardes) {
    $("#fenetre-corps").innerHTML = `<p class="erreur">${e(r.message ?? "Sauvegardes indisponibles.")}</p>`;
    return;
  }
  const t = r.test;
  const test = t
    ? `<p class="${t.ok ? "sub" : "erreur"}">Dernier test de restauration, le ${e(heureFr(t.date))} : ${t.ok ? `<span class="etiquette ok">réussi</span> (${e(t.recettes)} recettes relues)` : `<span class="etiquette ko">raté</span> : ${e(t.raison)}`}</p>`
    : `<p class="sub">Pas encore de test de restauration (il se fait tout seul chaque dimanche matin).</p>`;
  const lignes = r.sauvegardes.length
    ? r.sauvegardes
        .map(
          (s) => `<div class="membre" data-id="${e(s.id)}"><div><b>${e(heureFr(dateSauv(s.id).toISOString()))}</b><small>${e(ETIQUETTES[s.etiquette] ?? s.etiquette)} · base ${e(taille(s.base))} · fichiers ${e(taille(s.fichiers))}${s.version ? ` · ${e(s.version)}` : ""}</small></div>
          <a class="btn petit" href="/telecharger/${e(c.nom)}/${e(s.id)}" download>Télécharger</a><button class="btn petit danger" type="button" data-s="restaurer">Restaurer</button></div>`,
        )
        .join("")
    : `<p class="sub">Aucune sauvegarde pour l'instant. La première se fera cette nuit, ou maintenant avec le bouton ci-dessous.</p>`;
  $("#fenetre-corps").innerHTML = `<p class="sub">Chaque nuit vers 3 h, la base, les photos et les factures de ${e(c.nom)} sont sauvegardées sur la machine. On garde les 7 derniers jours, puis une par semaine pendant 4 semaines et une par mois pendant 6 mois. ${aide("sv-a", "Ces sauvegardes sont sur le disque de la VM. La copie hors de la machine, c'est ta sauvegarde Proxmox Backup Server vers OVH : elle emporte toute la VM, sauvegardes comprises.")}</p>
    ${test}
    <div class="barre serree"><button class="btn principal" type="button" id="sv-maintenant">Sauvegarder maintenant</button><button class="btn" type="button" id="sv-tester">Tester la dernière</button>
    <button class="aide" type="button" data-aide="sv-a2" aria-label="Aide">?</button></div>
    <p class="texte-aide" id="sv-a2"><b>Tester</b> recharge la dernière sauvegarde dans une base à part, compte ses recettes et vérifie les fichiers, sans toucher au site du client. <b>Télécharger</b> donne une archive avec la base et les fichiers, sans aucun mot de passe : à garder ou à remettre au client.</p>
    <div class="membres">${lignes}</div>`;
  $("#sv-maintenant").addEventListener("click", () => executer(`Sauvegarde de ${c.nom}`, () => api("POST", `/clients/${c.nom}/sauvegarder`)).then(() => (apresFermeture = () => fenetreSauvegardes(c))));
  $("#sv-tester").addEventListener("click", () => executer(`Test de la sauvegarde de ${c.nom}`, () => api("POST", `/clients/${c.nom}/tester-sauvegarde`)).then(() => (apresFermeture = () => fenetreSauvegardes(c))));
  $("#fenetre-corps").querySelectorAll("[data-s=restaurer]").forEach((b) =>
    b.addEventListener("click", () => fenetreRestaurer(c, b.closest("[data-id]").dataset.id)),
  );
}

function fenetreRestaurer(c, id) {
  const quand = heureFr(dateSauv(id).toISOString());
  ouvrir(
    `Restaurer ${c.nom} ?`,
    `<p class="sub">Les recettes, comptes, photos et factures de ${e(c.nom)} reviennent à leur état du <b>${e(quand)}</b>. Tout ce qui a été fait depuis disparaît du site. Le site est coupé environ une minute.</p>
    <p class="texte-aide visible">Juste avant, l'état actuel est sauvegardé (étiquette « Avant restauration ») : tu peux revenir en arrière avec cette sauvegarde-là.</p>
    <div class="champ"><label for="rs-nom">Tape <b>${e(c.nom)}</b> pour confirmer</label><input id="rs-nom" type="text" autocapitalize="none" spellcheck="false"></div>
    <p class="erreur" id="rs-erreur"></p>
    <div class="pied"><button class="btn danger" id="ok-restaurer" type="button">Restaurer</button></div>`,
  );
  $("#ok-restaurer").addEventListener("click", () => {
    if ($("#rs-nom").value.trim() !== c.nom) return ($("#rs-erreur").textContent = "Le nom ne correspond pas.");
    executer(`Restauration de ${c.nom}`, () => api("POST", `/clients/${c.nom}/restaurer`, { sauvegarde: id, confirmation: c.nom }));
  });
}

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

// ------------------------------------------------------------ démo
function fenetreDemo(c) {
  ouvrir(
    `Démo ${c.nom}`,
    `<p class="sub">Les visiteurs peuvent tout essayer sur la démo ; chaque nuit vers 4 h 30, elle revient toute seule à son état de référence.</p>
    <div class="champ"><label>Remettre à zéro maintenant ${aide("d-a1", "Recharge l'état de référence tout de suite : tout ce que les visiteurs ont changé depuis disparaît. Le site est coupé une minute.")}</div>
    <div class="pied pied-gauche"><button class="btn" id="d-remettre" type="button">Remettre à zéro</button></div>
    <div class="champ"><label>Garder l'état actuel comme référence ${aide("d-a2", "Prépare d'abord la démo comme tu veux la montrer (recettes, fournisseurs, photos), puis clique ici : c'est cet état qui reviendra chaque nuit.")}</div>
    <div class="pied pied-gauche"><button class="btn principal" id="d-figer" type="button">Figer comme référence</button></div>`,
  );
  $("#d-remettre").addEventListener("click", () => executer(`Remise à zéro de ${c.nom}`, () => api("POST", `/clients/${c.nom}/demo-remettre`)));
  $("#d-figer").addEventListener("click", () => executer(`Référence de ${c.nom}`, () => api("POST", `/clients/${c.nom}/demo-figer`)));
}

// ------------------------------------------------------------ vitrine
const TYPES_DEMANDE = { demo: "Démonstration", devis: "Devis", question: "Question" };
// Nom de client proposé à partir de l'établissement (ou du nom) : « Pâtisserie Martin » → patisserie-martin.
const nomPropose = (d) =>
  (d.etab || d.nom || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/, "");
let voirTraitees = false;

function afficherVitrine() {
  const zone = $("#vitrine");
  if (!VITRINE) {
    zone.innerHTML = `<div class="vide">Vitrine indisponible.</div>`;
    return;
  }
  const aFaire = VITRINE.demandes.filter((d) => !d.traitee);
  const faites = VITRINE.demandes.filter((d) => d.traitee);
  const liste = (voirTraitees ? VITRINE.demandes : aFaire)
    .map(
      (d) => `<article class="demande${d.traitee ? " traitee" : ""}" data-cle="${e(d.cle)}">
      <div><span class="etiquette ${d.type === "question" ? "acc" : "prog"}">${e(TYPES_DEMANDE[d.type] ?? d.type)}</span> <b>${e(d.nom)}</b>${d.etab ? ` · ${e(d.etab)}` : ""}
        <small>${e(d.date.slice(8, 10))}/${e(d.date.slice(5, 7))} ${e(d.date.slice(11, 16))} · <a href="mailto:${e(d.email)}">${e(d.email)}</a>${d.tel ? ` · ${e(d.tel)}` : ""}</small>
        ${d.msg ? `<p>${e(d.msg.length > 400 ? `${d.msg.slice(0, 400)}…` : d.msg)}</p>` : ""}</div>
      ${d.traitee ? `<span class="etiquette ok">Traitée</span>` : `<div class="actions"><button class="btn petit principal" type="button" data-v="creer">Créer le client</button><button class="btn petit" type="button" data-v="traitee">Traitée</button></div>`}
    </article>`,
    )
    .join("");
  zone.innerHTML = `<div class="carte-vitrine">
      <div class="ligne-vitrine"><div><b>${e(DOMAINE)}</b><small>${VITRINE.version ? `Version ${e(VITRINE.version)}` : "Pas encore téléchargée"}</small></div>
        <a class="btn petit" href="https://${e(DOMAINE)}" target="_blank" rel="noopener">Ouvrir</a>
        <button class="btn petit" type="button" id="v-maj">Mettre à jour la vitrine</button>
        <button class="aide" type="button" data-aide="v-a-maj" aria-label="Aide">?</button></div>
      <p class="texte-aide" id="v-a-maj">Télécharge la dernière version du site vitrine (branche site-vitrine) et la met en ligne en quelques secondes. Tes réglages (adresse de la démo, bandeau) sont gardés.</p>
      <form id="f-bandeau" class="champ" novalidate><label for="v-bandeau">Bandeau en haut du site ${aide("v-a-band", "Une phrase affichée tout en haut de la vitrine, par exemple « Offre de lancement : 1 mois d'essai gratuit ». Laisser vide puis Enregistrer pour l'enlever. 300 caractères au plus.")}
        <div class="suffixe"><input id="v-bandeau" type="text" maxlength="300" value="${e(VITRINE.bandeau)}" placeholder="Aucun bandeau"><button class="btn" type="submit">Enregistrer</button></div>
        <p class="erreur" id="v-erreur"></p></form>
    </div>
    <h3 class="titre-demandes">Demandes reçues <span class="etiquette ${aFaire.length ? "prog" : "ok"}">${aFaire.length} à traiter</span>
      ${faites.length ? `<button class="lien" type="button" id="v-toutes">${voirTraitees ? "Cacher les traitées" : `Voir aussi les ${faites.length} traitées`}</button>` : ""}
      <button class="aide" type="button" data-aide="v-a-dem" aria-label="Aide">?</button></h3>
    <p class="texte-aide" id="v-a-dem">Les messages du formulaire « Nous écrire » de la vitrine (ils arrivent aussi par email). « Créer le client » ouvre la création avec son adresse en responsable et 14 jours d'essai : tu vérifies, puis tu valides. La demande passe alors en « Traitée ».</p>
    <div class="demandes">${liste || `<div class="vide">${VITRINE.demandes.length ? "Toutes les demandes sont traitées." : "Aucune demande pour l'instant."}</div>`}</div>`;
  $("#v-maj").addEventListener("click", () => executer("Mise à jour de la vitrine", () => api("POST", "/vitrine/maj")));
  $("#v-toutes")?.addEventListener("click", () => {
    voirTraitees = !voirTraitees;
    afficherVitrine();
  });
  $("#f-bandeau").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const texte = $("#v-bandeau").value.trim();
    $("#v-erreur").textContent = "Enregistrement…";
    const r = await api("POST", "/vitrine/bandeau", { texte });
    $("#v-erreur").textContent = r.ok ? "" : (r.message || r.sortie || "Échec").replace(/^❌\s*/, "");
    if (r.ok) charger();
  });
  zone.querySelectorAll("[data-v]").forEach((b) =>
    b.addEventListener("click", async () => {
      const cle = b.closest("[data-cle]").dataset.cle;
      const d = VITRINE.demandes.find((x) => x.cle === cle);
      const traiter = () => api("POST", "/vitrine/traitee", { cle });
      if (b.dataset.v === "traitee") {
        b.disabled = true;
        await traiter();
        charger();
      } else {
        fenetreNouveau({ nom: nomPropose(d), responsable: d.email, essai: 14 }, traiter);
      }
    }),
  );
}

// ------------------------------------------------------------ santé (lot 5)
const pct = (v) => `${v.toFixed(v >= 99.95 || v < 10 ? 1 : 2).replace(".", ",")} %`;
// Disponibilité sur 30 jours (petite ligne sous l'état). Aucune panne notée = 100 %.
function dispo(cible) {
  if (!SANTE) return "";
  const v = SANTE.disponibilite?.[cible] ?? 100;
  return `<small class="dispo${v < 99 ? " bas" : ""}" title="Temps en ligne sur les 30 derniers jours">${e(pct(v))} sur 30 j</small>`;
}
const jauge = (part, texte) => {
  const p = Math.max(0, Math.min(100, Math.round(part)));
  return `<div class="jauge ${p >= 90 ? "ko" : p >= 75 ? "pause" : "ok"}"><span class="j${Math.round(p / 5) * 5}"></span></div><small>${texte}</small>`;
};
const depuisFr = (iso) => {
  if (!iso) return "jamais";
  const j = Math.floor((Date.now() - Date.parse(iso)) / 86400000);
  return j <= 0 ? "aujourd'hui" : j === 1 ? "hier" : `il y a ${j} j`;
};

function afficherSante() {
  const zone = $("#sante");
  if (!SANTE) {
    zone.innerHTML = `<div class="vide">Mesures indisponibles (le moteur ne répond pas).</div>`;
    return;
  }
  const m = SANTE.machine;
  const memUtil = m.memoire.total - m.memoire.libre;
  const charge = (m.charge[0] / m.coeurs) * 100;
  const services = [
    ["service:connexion", "Connexion"],
    ["service:passerelle", "Passerelle"],
    ["service:vitrine", "Vitrine"],
  ]
    .map(([id, nom]) => {
      const s = SANTE.services[id];
      const ok = !s || s.ok;
      return `<span class="etiquette ${ok ? "ok" : "ko"}" title="${ok ? "Répond" : `Ne répond plus depuis le ${e(heureFr(s.depuis))}`}">${e(nom)}</span>`;
    })
    .join(" ");
  const canaux = Object.entries({ telegram: "Telegram", discord: "Discord", email: "Email" })
    .map(([k, n]) => `<span class="etiquette ${SANTE.alertes[k] ? "ok" : "pause"}">${n} ${SANTE.alertes[k] ? "réglé" : "pas réglé"}</span>`)
    .join(" ");
  const lignes = CLIENTS.map((c) => {
    const s = SANTE.clients[c.nom] ?? {};
    const u = s.usage;
    return `<tr><th scope="row">${e(c.nom)}${dispo(`client:${c.nom}`)}</th>
      <td data-l="Processeur">${s.cpu == null ? "—" : `${e(s.cpu.toFixed(1).replace(".", ","))} %`}</td>
      <td data-l="Mémoire">${s.memoire == null ? "—" : e(taille(s.memoire))}</td>
      <td data-l="Base">${u ? e(taille(u.base)) : "—"}</td>
      <td data-l="Fichiers">${s.fichiers == null ? "—" : e(taille(s.fichiers))}</td>
      <td data-l="Sauvegardes">${s.sauvegardes == null ? "—" : e(taille(s.sauvegardes))}</td>
      <td data-l="Recettes">${u ? `${e(u.recettes)} <small>${e(u.recettes30)} modif. 30 j</small>` : "—"}</td>
      <td data-l="Comptes">${u ? e(u.comptes) : "—"}</td>
      <td data-l="Dernière activité">${u ? e(depuisFr(u.derniereActivite)) : "—"}</td></tr>`;
  }).join("");
  zone.innerHTML = `<div class="cartes-sante">
      <div class="carte-sante"><span class="lbl">Processeur ${aide("sa-cpu", "Charge moyenne sur la dernière minute, rapportée au nombre de cœurs de la VM. Au-dessus de 100 %, des tâches attendent leur tour : la machine est trop petite ou un client tourne en boucle.")}</span>
        ${jauge(charge, `${e(m.charge[0].toFixed(2).replace(".", ","))} pour ${e(m.coeurs)} cœurs`)}</div>
      <div class="carte-sante"><span class="lbl">Mémoire ${aide("sa-mem", "Mémoire vraiment utilisée (le cache que Linux rend tout seul n'est pas compté). Chaque client prend environ 150 à 250 Mo.")}</span>
        ${jauge((memUtil / m.memoire.total) * 100, `${e(taille(memUtil))} sur ${e(taille(m.memoire.total))}`)}</div>
      <div class="carte-sante"><span class="lbl">Disque ${aide("sa-disque", "Place prise sur le disque des données (/srv/recipelog : bases, photos, factures, sauvegardes). Une alerte part à 90 %.")}</span>
        ${m.disque ? jauge(m.disque.pourcent, `${e(taille(m.disque.libre))} libres sur ${e(taille(m.disque.total))}`) : "<small>—</small>"}</div>
      <div class="carte-sante"><span class="lbl">Services ${aide("sa-serv", "Vérifiés chaque minute, comme les sites des clients. Rouge = ne répond plus depuis au moins 2 minutes ; tu as reçu une alerte.")}</span>
        <div class="etiquettes">${services}</div><small>${m.demarre ? `VM démarrée ${e(depuisFr(m.demarre))}` : ""}</small></div>
    </div>
    <div class="carte-vitrine alertes"><div class="ligne-vitrine"><div><b>Alertes</b><small>Chaque minute, chaque site est vérifié. S'il ne répond plus 2 minutes de suite, tu es prévenu, puis encore quand il revient. Aussi : disque presque plein, nouvelle demande de support.</small></div>
      <button class="btn petit" type="button" id="sa-essai">Tester les alertes</button>
      <button class="aide" type="button" data-aide="sa-a-al" aria-label="Aide">?</button></div>
      <p class="texte-aide" id="sa-a-al">L'email part vers les adresses super-admin (ADMIN_EMAILS). Pour recevoir aussi les alertes sur ton téléphone par Telegram ou Discord, suis l'étape F de A-FAIRE.md (2 minutes). « Tester » envoie un message d'essai sur tous les canaux réglés.</p>
      <div class="etiquettes">${canaux}</div><p class="erreur" id="sa-erreur"></p></div>
    <div class="tableau-sante"><table><thead><tr><th>Client</th><th>Processeur</th><th>Mémoire</th><th>Base</th><th>Fichiers</th><th>Sauvegardes</th><th>Recettes</th><th>Comptes</th><th>Dernière activité</th></tr></thead>
      <tbody>${lignes || `<tr><td colspan="9">Pas encore de client.</td></tr>`}</tbody></table></div>
    <p class="texte-aide visible discret">Mesuré le ${e(heureFr(SANTE.date))} (rafraîchi chaque minute). Comptes = comptes actifs dans son RecipeLog ; dernière activité = dernière visite d'un de ses comptes.</p>`;
  $("#sa-essai").addEventListener("click", async (ev) => {
    ev.target.disabled = true;
    $("#sa-erreur").textContent = "Envoi…";
    const r = await api("POST", "/alertes/essai");
    ev.target.disabled = false;
    $("#sa-erreur").textContent = r.ok ? "" : r.sortie || r.message || "Échec.";
    if (r.ok) ev.target.textContent = "Envoyée ✓";
  });
}

// ------------------------------------------------------------ journaux d'un client
function fenetreJournaux(c) {
  let suivre = true;
  let jeton = {};
  const moi = jeton;
  ouvrir(
    `Journaux de ${c.nom}`,
    `<p class="sub">Les 300 dernières lignes écrites par son RecipeLog (démarrage, erreurs, connexions). Rafraîchi toutes les 3 secondes. ${aide("jx-a", "Utile quand un client signale un problème : cherche les lignes « Error » au moment où il a eu le souci. Les heures sont en UTC (une heure de moins qu'en France l'hiver, deux l'été).")}</p>
    <div class="barre serree"><label class="case"><input type="checkbox" id="jx-suivre" checked> Suivre en direct</label></div>
    <pre class="sortie journaux" id="jx-sortie">Chargement…</pre>`,
    () => (jeton = null),
  );
  $("#jx-suivre").addEventListener("change", (ev) => (suivre = ev.target.checked));
  const tour = async () => {
    if (jeton !== moi) return;
    if (suivre) {
      const r = await api("GET", `/clients/${c.nom}/journaux`).catch(() => ({ lignes: "Le moteur ne répond pas." }));
      if (jeton !== moi) return;
      const pre = $("#jx-sortie");
      if (!pre) return;
      const enBas = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 30;
      pre.textContent = (r.lignes || "(aucune ligne)").replace(/^(\d{4}-\d\d-\d\d)T(\d\d:\d\d:\d\d)\.\d+Z /gm, "$1 $2 ");
      if (enBas) pre.scrollTop = pre.scrollHeight;
    }
    setTimeout(tour, 3000);
  };
  tour();
}

// ------------------------------------------------------------ support (lot 5)
const TYPES_TICKET = { bug: ["Problème", "ko"], question: ["Question", "acc"], idee: ["Idée", "prog"] };
const STATUTS = { ouvert: ["À répondre", "prog"], repondu: ["Répondu", "ok"], ferme: ["Fermé", "pause"] };
let voirFermes = false;

function afficherSupport() {
  const zone = $("#support");
  if (!SUPPORT) {
    zone.innerHTML = `<div class="vide">Support indisponible.</div>`;
    return;
  }
  const ouverts = SUPPORT.filter((t) => t.statut !== "ferme");
  const aRepondre = SUPPORT.filter((t) => t.statut === "ouvert").length;
  const liste = (voirFermes ? SUPPORT : ouverts)
    .map((t) => {
      const [ty, cl] = TYPES_TICKET[t.type] ?? [t.type, "acc"];
      const [st, sc] = STATUTS[t.statut] ?? [t.statut, "acc"];
      const dernier = t.messages.at(-1);
      return `<article class="demande ticket${t.statut === "ferme" ? " traitee" : ""}${t.luSupport ? "" : " non-lu"}" data-ticket="${e(t.client)}/${e(t.id)}">
        <div><span class="etiquette ${cl}">${e(ty)}</span> <b>${e(t.client)}</b> · ${e(t.email)}
          <small>${e(heureFr(t.maj))} · ${t.messages.length} message${t.messages.length > 1 ? "s" : ""}${t.luSupport ? "" : " · <b>nouveau</b>"}</small>
          <p>${dernier.de === "support" ? "<i>Toi :</i> " : ""}${e(dernier.texte.length > 240 ? `${dernier.texte.slice(0, 240)}…` : dernier.texte)}</p></div>
        <div class="actions"><span class="etiquette ${sc}">${e(st)}</span><button class="btn petit principal" type="button">Ouvrir</button></div>
      </article>`;
    })
    .join("");
  const fermes = SUPPORT.length - ouverts.length;
  zone.innerHTML = `<h3 class="titre-demandes">Demandes des clients <span class="etiquette ${aRepondre ? "prog" : "ok"}">${aRepondre} à répondre</span>
      ${fermes ? `<button class="lien" type="button" id="su-fermes">${voirFermes ? "Cacher les fermées" : `Voir aussi les ${fermes} fermées`}</button>` : ""}
      <button class="aide" type="button" data-aide="su-a" aria-label="Aide">?</button></h3>
    <p class="texte-aide" id="su-a">Envoyées par les équipes de tes clients depuis leur RecipeLog (Réglages → Signaler un problème), avec la page où ils étaient, leur navigateur et leur version. Tu es prévenu à chaque nouvelle demande. Ta réponse part par email et s'affiche dans leur RecipeLog ; ils peuvent y répondre à leur tour.</p>
    <div class="demandes">${liste || `<div class="vide">${SUPPORT.length ? "Aucune demande ouverte." : "Aucune demande pour l'instant."}</div>`}</div>`;
  $("#su-fermes")?.addEventListener("click", () => {
    voirFermes = !voirFermes;
    afficherSupport();
  });
  zone.querySelectorAll("[data-ticket]").forEach((a) =>
    a.querySelector("button").addEventListener("click", () => {
      const [client, id] = a.dataset.ticket.split("/");
      fenetreTicket(client, id);
    }),
  );
}

async function actionSupport(t, act, corps = {}) {
  const r = await api("POST", `/support/${t.client}/${t.id}/${act}`, corps);
  if (r.demande) SUPPORT = SUPPORT.map((x) => (x.id === t.id && x.client === t.client ? r.demande : x));
  return r;
}

async function fenetreTicket(client, id) {
  let t = SUPPORT.find((x) => x.client === client && x.id === id);
  if (!t) return;
  if (!t.luSupport) {
    await actionSupport(t, "lu");
    t = SUPPORT.find((x) => x.client === client && x.id === id);
  }
  const [ty] = TYPES_TICKET[t.type] ?? [t.type];
  const [st, sc] = STATUTS[t.statut] ?? [t.statut, "acc"];
  const ctx = t.contexte ?? {};
  const fils = t.messages
    .map((m) => `<div class="bulle ${m.de === "support" ? "moi" : ""}"><small>${m.de === "support" ? "Toi" : e(m.qui)} · ${e(heureFr(m.date))}</small><p>${e(m.texte)}</p></div>`)
    .join("");
  ouvrir(
    `${ty} de ${t.client}`,
    `<p class="sub"><span class="etiquette ${sc}">${e(st)}</span> ${e(t.email)} · ouverte le ${e(heureFr(t.date))}</p>
    <details class="contexte"><summary>Où et avec quoi ${aide("tk-a-ctx", "Envoyé tout seul avec la demande : la page où était la personne, son navigateur, la taille de son écran, la version de RecipeLog et son rôle. Pratique pour reproduire le problème.")}</summary>
      <dl><dt>Page</dt><dd>${ctx.page ? `<a href="https://${e(t.client)}.${e(DOMAINE)}${e(ctx.page)}" target="_blank" rel="noopener">${e(ctx.page)}</a>` : "—"}</dd><dt>Version</dt><dd>${e(ctx.version || "—")}</dd><dt>Rôle</dt><dd>${e(ctx.role || "—")}</dd><dt>Écran</dt><dd>${e(ctx.ecran || "—")}</dd><dt>Navigateur</dt><dd>${e(ctx.navigateur || "—")}</dd></dl></details>
    <div class="fil">${fils}</div>
    <form id="f-repondre" novalidate>
      <div class="champ"><label for="tk-texte">Ta réponse ${aide("tk-a-rep", "Envoyée par email à la personne et affichée dans son RecipeLog (Réglages → Signaler un problème). Elle peut te répondre de là : tu seras prévenu.")}
        <textarea id="tk-texte" rows="5" maxlength="5000" placeholder="Bonjour, …"></textarea></div>
      <div class="champ"><label class="case"><input type="checkbox" id="tk-fermer"> Fermer la demande après l'envoi ${aide("tk-a-ferm", "À cocher quand le problème est réglé. Si la personne répond quand même, la demande se rouvre toute seule.")}</div>
      <p class="erreur" id="tk-erreur"></p>
      <div class="pied">${t.statut === "ferme" ? `<button class="btn" type="button" id="tk-rouvrir">Rouvrir</button>` : `<button class="btn" type="button" id="tk-clore">Fermer sans répondre</button>`}<button class="btn principal" type="submit">Envoyer la réponse</button></div>
    </form>
    <div class="champ note"><label for="tk-note">Note pour toi ${aide("tk-a-note", "Jamais montrée au client. Par exemple : « corrigé dans la PR 160, à dire quand c'est en ligne ».")}
      <div class="suffixe"><input id="tk-note" type="text" maxlength="2000" value="${e(t.notes ?? "")}" placeholder="Rien"><button class="btn" type="button" id="tk-note-ok">Garder</button></div></div>`,
    afficherSupport,
  );
  $("#f-repondre").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const texte = $("#tk-texte").value.trim();
    if (!texte) return ($("#tk-erreur").textContent = "Écris ta réponse d'abord.");
    $("#tk-erreur").textContent = "Envoi…";
    const r = await actionSupport(t, "repondre", { texte, fermer: $("#tk-fermer").checked });
    if (!r.ok) return ($("#tk-erreur").textContent = r.message || "Échec.");
    fenetreTicket(client, id);
    if (r.email === "echec") $("#tk-erreur").textContent = "Réponse gardée, mais l'email n'est pas parti (réglages SMTP). La personne la verra dans son RecipeLog.";
    else if (r.email === null) $("#tk-erreur").textContent = "Réponse gardée. Emails pas réglés : la personne la verra dans son RecipeLog.";
  });
  $("#tk-clore")?.addEventListener("click", async () => {
    await actionSupport(t, "fermer");
    fenetreTicket(client, id);
  });
  $("#tk-rouvrir")?.addEventListener("click", async () => {
    await actionSupport(t, "rouvrir");
    fenetreTicket(client, id);
  });
  $("#tk-note-ok").addEventListener("click", async (ev) => {
    const r = await actionSupport(t, "note", { texte: $("#tk-note").value });
    ev.target.textContent = r.ok ? "Gardée ✓" : "Échec";
  });
}
