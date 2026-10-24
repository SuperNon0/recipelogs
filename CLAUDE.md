# RecipeLog

## Journal des versions

Numéro de version : `V<majeur>.<mineur>.<PR>`, par exemple V2.3.88. Le dernier nombre est celui de
la dernière PR fusionnée, ajouté tout seul au build (`src/lib/version.ts`) : rien à écrire.

La page « Version et nouveautés » (Réglages) lit `src/lib/changelog.ts`, qui est écrit à la main.
Chaque PR qui change quelque chose de visible pour l'utilisateur doit y ajouter une ligne :

- en général dans l'entrée en tête de `CHANGELOG` (la version en cours), quelle que soit sa date ;
- pour un gros ajout (une fonction importante, comme la mise à jour rapide ou l'import TikTok),
  dans une nouvelle entrée en tête : version mineure suivante (ex. V2.3 → V2.4), date du jour.
  Le premier chiffre (V3) ne change que si Noë le demande ;
- en français simple, du point de vue de l'utilisateur (`features`, `fixes`, `migrations`).

La même page affiche aussi automatiquement les dernières PR fusionnées : `next.config.ts` les lit
dans `git log` au build (`src/lib/pr-log.ts`). Un titre de PR clair en français y apparaît tel quel.

## Mise à jour du serveur

Le bouton « Mettre à jour le site » (`deploy/proxmox/deploy.sh`) télécharge le site déjà construit par
GitHub Actions (`.github/workflows/server-build.yml`, release `server-builds`) au lieu de le construire
sur le serveur, très lent. Ce workflow doit donc rester vert sur `main` : s'il échoue, le serveur
reconstruit tout lui-même (15 min et plus).
