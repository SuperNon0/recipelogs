/**
 * Timestamp de démarrage du process Next.js (côté serveur).
 * Utilisé par /api/health pour que le front détecte quand le serveur
 * a redémarré (suite à un déploiement par exemple).
 */
export const BOOT_TIME = Date.now();
