# Installer un nouveau site RecipeLog

Pour donner à quelqu'un son propre RecipeLog, hébergé chez toi sur Proxmox, dans un **conteneur LXC** à part :
sa base, ses recettes, sa clé pour Claude. Rien n'est partagé avec ton site.

Compte environ 15 minutes, dont 5 à 10 d'installation automatique.

## 1. Préparer le tunnel Cloudflare (2 min, avant la commande)

Dans [Cloudflare Zero Trust](https://one.dash.cloudflare.com) :

1. **Networks → Tunnels → Create a tunnel** → type *Cloudflared* → un nom (par ex. `recipelog-paul`).
2. Cloudflare affiche une commande `cloudflared service install eyJ...` : copie seulement le long texte
   qui commence par `eyJ` (c'est le **jeton du tunnel**). Garde-le pour l'étape 2.
3. **Public hostname** : sous-domaine (par ex. `recettes-paul`), ton domaine, *Service* = `HTTP` et
   `localhost:80`. Enregistre.

Tu peux aussi sauter cette étape et installer le tunnel plus tard (voir la fin).

## 2. La commande (dans le shell de l'hôte Proxmox, en root)

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/SuperNon0/recipelogs/stable/deploy/proxmox/install.sh)"
```

Elle pose 4 questions (Entrée = valeur proposée) :

| Question | Quoi répondre |
|---|---|
| Numéro du conteneur | Entrée (le prochain numéro libre) |
| Nom du conteneur | par ex. `recipelog-paul` |
| Ton adresse e-mail | **ton** adresse : elle devient l'administrateur caché du site |
| Jeton du tunnel Cloudflare | le `eyJ...` de l'étape 1 (rien ne s'affiche quand tu colles, c'est normal) |

Ensuite tout se fait seul : conteneur Debian 12 (2 CPU, 4 Go, 20 Go), base PostgreSQL avec son propre mot de passe,
site sur la branche **stable**, nginx, bouton « Mettre à jour le site », sauvegarde chaque nuit à 3 h, tunnel.
Le résumé s'affiche à la fin et reste dans `/root/recipelog-<numéro>.txt` sur l'hôte.

**Il n'y a pas de mot de passe** : on entre sur le site par son adresse Cloudflare, avec le code reçu par e-mail.

## 3. Ouvrir la porte Cloudflare (Access)

Dans Zero Trust :

1. Une seule fois pour tous tes sites : **Access → Rule groups** (ou *Access groups*) → nouveau groupe `Admin`
   avec **ton e-mail**.
2. **Access → Applications → Add an application → Self-hosted** : l'adresse du nouveau site
   (`recettes-paul.tondomaine`). Règle **Allow** : *Include* → *Emails* = l'adresse de la personne, **et** le groupe `Admin`.
   Méthode de connexion : *One-time PIN* (code par e-mail).
3. Dans la même application (ou une 2ᵉ application sur le chemin `/api/mcp`) : une règle **Bypass** pour
   *Everyone*, **seulement sur le chemin `/api/mcp`**. C'est ce qui laisse passer Claude, qui a sa propre clé.
4. Note l'**AUD** de l'application (onglet *Overview*, « Application Audience (AUD) Tag ») et le nom de ton
   équipe (Settings → Custom pages, `tonequipe.cloudflareaccess.com`).

## 4. Première connexion et comptes

1. Ouvre l'adresse du site, entre ton e-mail, puis le code reçu.
2. **Réglages → Comptes** : colle l'équipe et l'AUD, *Tester*, *Enregistrer*, puis **Activer les comptes**.
   Ton adresse reste administrateur, mais **n'apparaît nulle part** sur le site (ni liste des comptes,
   ni journal) et ne peut pas être bloquée ou supprimée depuis le site.
3. La personne ouvre le site à son tour et touche **Demander un accès**.
4. Dans Réglages → Comptes, accepte sa demande avec le rôle **Administrateur** : elle gère ensuite elle-même
   ses comptes (apprentis, etc.).

## 5. Son Claude (le MCP)

Sur **son** site, la personne va dans **Réglages → Accès MCP** → *Créer la clé*, puis dans **son** compte claude.ai :
Paramètres → Connecteurs → *Ajouter un connecteur personnalisé* :

- URL : `https://recettes-paul.tondomaine/api/mcp`
- Request headers : `Authorization` = l'en-tête copié sur la page (il commence par `Bearer`).

Il lui faut un abonnement Claude payant (les connecteurs personnalisés en demandent un). Sa clé ne marche que
sur son site, la tienne que sur le tien.

## 6. Les mises à jour : bêta puis stable

- Tes nouveautés arrivent sur `main` (**bêta**), ton site les reçoit comme d'habitude.
- Quand la bêta te va, dis à Claude « **passe la bêta en stable** » : la branche `stable` avance jusqu'à `main`,
  GitHub reconstruit le paquet (2 à 4 min).
- Sur l'autre site, le bouton **Réglages → Mettre à jour le site** apporte alors tout d'un coup.
  Tant que `stable` ne bouge pas, ce site ne change pas.

## Bon à savoir

- **Tunnel plus tard** : dans le conteneur (`pct enter <numéro>`), relance l'installation avec le jeton :
  `CF_TUNNEL_TOKEN=eyJ... RECIPELOG_BRANCH=stable bash /opt/recipelog/deploy/proxmox/setup.sh`.
  Elle se relance sans rien casser : la base, le `.env` et l'administrateur caché sont gardés.
- **Changer l'administrateur caché** : ligne `RECIPELOG_ADMIN_EMAILS="ton@mail"` dans `/opt/recipelog/.env`
  du conteneur, puis `systemctl restart recipelog`.
- Le site n'écoute qu'à l'intérieur du conteneur (`127.0.0.1:80`) : le tunnel doit tourner dans le même conteneur.
- Sans question (pour un script) : `RECIPELOG_NONINTERACTIVE=1 RECIPELOG_HOSTNAME=... RECIPELOG_ADMIN_EMAILS=... CF_TUNNEL_TOKEN=...`
  devant la commande (liste complète en tête de `deploy/proxmox/install.sh`).
