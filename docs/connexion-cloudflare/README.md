# Connexion par Cloudflare (Google + code par mail)

Le but : **personne n'a de mot de passe dans RecipeLog**. Cloudflare s'occupe de la connexion
(il sait sécuriser un site), RecipeLog s'occupe seulement de dire qui a le droit d'entrer.

Ce fichier explique comment ouvrir la connexion à tout le monde **sans ajouter chaque adresse mail
à la main dans Cloudflare**, puis accepter ou refuser les gens depuis RecipeLog.

## Comment ça marche

1. **Cloudflare est la porte d'entrée.** N'importe qui peut s'y connecter, mais Cloudflare vérifie
   vraiment l'adresse mail. Deux boutons s'affichent :
   - **« Se connecter avec Google »**, pour ceux qui ont un compte Google ;
   - **« Code par mail »** (One-time PIN), pour tous les autres : la personne tape son adresse
     (Orange, Hotmail…), reçoit un code et entre. Pas d'inscription, pas de mot de passe.
2. **Cloudflare transmet à RecipeLog un « badge » signé** avec l'adresse vérifiée. RecipeLog vérifie
   la signature (équipe + AUD Cloudflare), donc personne ne peut tricher.
3. **Si l'adresse n'a pas de compte**, la personne voit seulement la page « Demander un accès ».
   Un administrateur accepte ou refuse dans **Réglages → Comptes** et choisit son rôle.

Rien à coder : c'est déjà dans RecipeLog (système de comptes, PR #118).

> Cloudflare ne sait pas faire « identifiant + mot de passe avec inscription ». Il faudrait brancher
> un service en plus (ex. Auth0). Pas utile : le code par mail fait la même chose, en plus sûr.

## À faire, dans cet ordre (important)

### Étape 1 : activer les comptes dans RecipeLog

Réglages → Comptes : mettre l'**équipe** et l'**AUD** Cloudflare, cliquer **Tester**, puis
**Activer les comptes**. Tu deviens l'administrateur.

### Étape 2 : ajouter Google dans Cloudflare

1. Sur [console.cloud.google.com](https://console.cloud.google.com), créer un projet (ex. « RecipeLog »).
2. « API et services » → « Identifiants » → **Créer un ID client OAuth**, type « Application Web ».
   (Google peut demander de remplir d'abord l'« écran de consentement » : nom de l'appli + ton mail.)
3. Dans **URI de redirection autorisés**, coller :
   `https://TON-EQUIPE.cloudflareaccess.com/cdn-cgi/access/callback`
   (remplacer TON-EQUIPE par le nom de ton équipe Cloudflare).
4. Google donne un **ID client** et un **code secret**. Les coller dans Cloudflare :
   Zero Trust → Settings → Authentication → Login methods → **Add new → Google**.
5. Dans l'application RecipeLog chez Cloudflare (onglet **Login methods**), cocher **Google** et
   **One-time PIN**.

### Étape 3 : ouvrir la porte à tout le monde

Zero Trust → Access → Applications → RecipeLog → **Policies**. Dans la règle **Allow**, remplacer
« Emails : ton adresse » par **Everyone**.

**Ne pas toucher** à la règle **Bypass** sur `/api/mcp` (c'est l'accès de Claude).

> ⚠️ Ne jamais faire l'étape 3 avant l'étape 1 : tant que les comptes ne sont pas activés dans
> RecipeLog, toute personne connectée verrait tout le site.

### Étape 4 : éviter de remplir les 50 places gratuites

Cloudflare gratuit = **50 utilisateurs**. Chaque personne qui se connecte prend une place, même
quelqu'un qu'on refuse. Activer **Seat expiration** sur **1 mois** dans les réglages du compte
Zero Trust : les gens inactifs sont retirés tout seuls
([doc Cloudflare](https://developers.cloudflare.com/cloudflare-one/identity/users/seat-management)).
On peut aussi retirer quelqu'un à la main : Zero Trust → Users.

## Sécurité

- Cloudflare bloque toujours les robots et les gens qui n'ont pas validé leur adresse.
- Une personne inconnue avec une vraie adresse peut voir **seulement** la page « Demander un accès ».
  Le serveur vérifie les droits à chaque page.
- En cas de problème avec les comptes : `RECIPELOG_AUTH_OFF=1` dans `/opt/recipelog/.env`
  désactive les comptes (remettre alors la règle Cloudflare sur ton adresse seulement).

## Pour un autre site RecipeLog

Même chose sur chaque instance : sa propre application Cloudflare (Google + One-time PIN, règle
Everyone, Bypass `/api/mcp`), puis activer les comptes dans son RecipeLog. Le même identifiant
Google peut servir : il est lié à l'équipe Cloudflare, pas au site.

## Ce qui manque encore

RecipeLog ne prévient pas quand quelqu'un fait une demande : il faut regarder le compteur dans
Réglages. Une notification pourra être ajoutée plus tard.
