/**
 * Interrupteurs de fonctionnalités.
 *
 * SHARE_ENABLED — partage public par lien (/share/<token>).
 * Désactivé : tout le site est derrière Cloudflare Zero Trust, donc un lien
 * partagé n'est de toute façon pas accessible à un tiers. Le code est
 * conservé pour une version future (voir README « Mises à jour proposées »).
 * Pour réactiver : passer à true ET créer dans Cloudflare une règle « Bypass »
 * limitée au chemin /share/*.
 */
export const SHARE_ENABLED = false;
