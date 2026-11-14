// Commandes d'administration de la passerelle, lancées par recipelog-instance
// et install.sh avec : docker exec recipelog-passerelle node cli.mjs <commande> …
// Répond en JSON sur la sortie standard ; message d'erreur et code 1 sinon.
import { ErreurPasserelle, changerQuota, creerClient, equipe, initialiser, inviter, supprimerClient } from "./authentik.mjs";

const [commande, ...args] = process.argv.slice(2);
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
  console.error("Commandes : initialiser, client-creer, client-supprimer, quota, equipe, inviter, attendre");
  process.exit(2);
}
try {
  console.log(JSON.stringify(await f(), null, 1));
} catch (e) {
  console.error(`❌ ${e.message}`);
  if (e.extra?.detail) console.error(JSON.stringify(e.extra.detail));
  process.exit(1);
}
