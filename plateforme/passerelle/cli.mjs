// Commandes d'administration de la passerelle, lancées par recipelog-instance
// et install.sh avec : docker exec recipelog-passerelle node cli.mjs <commande> …
// Répond en JSON sur la sortie standard ; message d'erreur et code 1 sinon.
import { ErreurPasserelle, brancherGoogle, creerPanel, renvoyer, resumeClients, retirer, changerQuota, creerClient, equipe, initialiser, inviter, supprimerClient } from "./authentik.mjs";

const tout = process.argv.slice(2);
// --env : réponse en lignes CLE=valeur (pour un fichier .env), sinon JSON.
const enEnv = tout.includes("--env");
const [commande, ...args] = tout.filter((a) => a !== "--env");
const entier = (v) => (v === undefined || v === "" || v === "0" ? null : Number.parseInt(v, 10));

const commandes = {
  // initialiser [emails séparés par des virgules] (défaut : ADMIN_EMAILS)
  initialiser: () => initialiser((args[0] ?? process.env.ADMIN_EMAILS ?? "").split(",").filter(Boolean)),
  // client-creer <nom> [max] [url]
  "client-creer": () => creerClient(args[0], { max: entier(args[1]), ...(args[2] ? { url: args[2] } : {}) }),
  "client-supprimer": () => supprimerClient(args[0]).then(() => ({ ok: true })),
  quota: () => changerQuota(args[0], entier(args[1])),
  equipe: () => equipe(args[0]),
  // inviter <nom> <email> [nom affiché]
  inviter: () => inviter(args[0], args[1], args.slice(2).join(" ")),
  // google <identifiant client> <secret> : bouton « Se connecter avec Google »
  google: () => brancherGoogle(args[0], args[1]),
  // panel-creer [url] : l'application Authentik du panel admin (super-admins seulement)
  "panel-creer": () => creerPanel(args[0]),
  // retirer <nom> <email> : retire de l'équipe (compte désactivé s'il ne sert plus ailleurs)
  retirer: () => retirer(args[0], args[1]).then(() => ({ ok: true })),
  // renvoyer <nom> <email> : renvoie l'email « Choisis ton mot de passe »
  renvoyer: () => renvoyer(args[0], args[1]),
  // resume : places de tous les clients (pour le panel)
  resume: () => resumeClients(),
  // attendre : jusqu'à ce qu'Authentik réponde et que les réglages RecipeLog soient appliqués
  attendre: async () => {
    const { groupe } = await import("./authentik.mjs");
    for (let i = 0; i < 90; i++) {
      try {
        if (await groupe("super-admins")) return { ok: true };
      } catch {}
      await new Promise((r) => setTimeout(r, 4000));
    }
    throw new ErreurPasserelle(503, "authentik_indisponible", "Authentik n'est pas prêt après 6 minutes.");
  },
};

const f = commandes[commande];
if (!f) {
  console.error("Commandes : initialiser, client-creer, client-supprimer, quota, equipe, inviter, google, panel-creer, resume, retirer, renvoyer, attendre");
  process.exit(2);
}
try {
  const r = await f();
  if (enEnv && r && typeof r === "object") {
    for (const [k, v] of Object.entries(r)) console.log(`${k}=${v ?? ""}`);
  } else {
    console.log(JSON.stringify(r, null, 1));
  }
} catch (e) {
  console.error(`❌ ${e.message}`);
  if (e.extra?.detail) console.error(JSON.stringify(e.extra.detail));
  process.exit(1);
}
