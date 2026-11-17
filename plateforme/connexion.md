# Connexion par Authentik (lot 1) : comment les pièces se parlent

Ce document est le contrat entre l'appli RecipeLog (mode « plateforme ») et la
plateforme (Authentik + la passerelle). Les installations LXC ne changent pas :
sans `RECIPELOG_AUTH_MODE=oidc`, l'appli garde Cloudflare Access.

```
Navigateur ── <client>.recipelog.cc ──> RecipeLog (rl-<client>)
     │                                      │  1. pas de session → /auth/connexion
     │                                      │  2. redirige vers Authentik (OIDC, code + PKCE)
     └──── auth.recipelog.cc ──> Authentik  │  3. Authentik vérifie : mot de passe, Google, 2FA,
                                            │     et que la personne est dans le groupe du client
                                            │  4. /auth/retour : code → jeton, cookie de session signé
                                            │
                RecipeLog ── réseau Docker ──> passerelle (recipelog-passerelle:8000)
                                                └─> API Authentik (seule la passerelle a la clé)
```

## Variables d'environnement d'une instance (écrites par `recipelog-instance creer`)

| Variable | Exemple | Rôle |
|---|---|---|
| `RECIPELOG_AUTH_MODE` | `oidc` | Active la connexion par Authentik. Les comptes sont alors toujours activés (sauf `RECIPELOG_AUTH_OFF=1`, le secours). |
| `RECIPELOG_URL` | `https://chanka.recipelog.cc` | Adresse publique. Retour OIDC : `${RECIPELOG_URL}/auth/retour`. |
| `OIDC_ISSUER` | `https://auth.recipelog.cc/application/o/rl-chanka/` | Émetteur public (avec la barre finale). Découverte : `${OIDC_ISSUER}.well-known/openid-configuration`. |
| `OIDC_INTERNE` | `http://recipelog-authentik:9000` | Facultatif. Les appels faits PAR LE SERVEUR (découverte, jeton, clés) partent vers cette origine au lieu de l'origine publique, avec les en-têtes `Host: auth.recipelog.cc` et `X-Forwarded-Proto: https` : Authentik répond alors avec les adresses publiques (il fait confiance à ces en-têtes venant des réseaux privés, dont celui de Docker). Le `fetch` de Node ignore l'en-tête `Host` : l'appli et la passerelle passent par `node:http`. Les redirections du navigateur, elles, utilisent toujours l'adresse publique. |
| `OIDC_CLIENT_ID` | `rl-chanka` | |
| `OIDC_CLIENT_SECRET` | (secret) | |
| `RECIPELOG_SESSION_SECRET` | 64 caractères hexadécimaux | Signe le cookie de session (HMAC-SHA256). Utilisé tel quel comme texte (pas décodé), au moins 32 caractères. |
| `RECIPELOG_RESPONSABLE_EMAIL` | `chef@patisserie.fr` | Responsable du client : à sa première connexion, compte actif avec le rôle Administrateur (visible, contrairement à `RECIPELOG_ADMIN_EMAILS`). |
| `RECIPELOG_ADMIN_EMAILS` | ton adresse | Inchangé : administrateur caché (toi, super-admin). |
| `RECIPELOG_PASSERELLE_URL` | `http://recipelog-passerelle:8000` | API de la passerelle. |
| `RECIPELOG_PASSERELLE_CLE` | (secret) | Clé propre à ce client ; la passerelle en déduit le client. |
| `RECIPELOG_INSTANCE` | `chanka` | Nom du client. |

## Session dans l'appli

- Cookie `rl_session`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, durée 7 jours.
- Valeur : `base64url(JSON {email, exp, iat})` + `.` + `base64url(HMAC-SHA256(secret, partie1))`.
- L'email est en minuscules, tiré de l'`id_token` vérifié (RS256 avec les clés `jwks_uri`, `iss` = `OIDC_ISSUER`, `aud` contient `OIDC_CLIENT_ID`, `exp`, `nonce`).
- `email_verified` n'est pas exigé : Authentik ne laisse entrer que des comptes créés par la passerelle ou par toi.

## Déconnexion

`/auth/deconnexion` efface le cookie puis envoie sur la fin de session d'Authentik. Le flux
`recipelog-deconnexion` (blueprint) ferme aussi la session Authentik, puis renvoie sur
l'adresse du client (`meta_launch_url` de l'application), qui affiche la page de connexion.

## Mot de passe, Google, double authentification (côté Authentik)

- Invitation et « Mot de passe oublié » : flux `recipelog-recuperation`, lien valable 3 jours.
  La passerelle déclenche l'email en jouant ce flux comme un visiteur anonyme. Ne jamais
  modifier par l'API le jeton d'un lien de récupération : Authentik en fait une clé d'API.
- Google : `docker exec recipelog-passerelle node cli.mjs google <id> <secret>`. Google relie
  un compte Google à un compte existant de même email ; il ne crée jamais de compte.
- Double authentification : facultative, chacun l'active dans « Mot de passe et sécurité »
  (`https://auth.recipelog.cc/if/user/#/settings`) ; elle est ensuite demandée à chaque connexion.

## Apparence des pages de connexion

Tout est dans le blueprint `authentik/blueprints/recipelog.yaml` (re-appliqué à chaque
démarrage d'Authentik) :

- écran de connexion à nous, `recipelog-connexion` (email et mot de passe sur le même écran,
  puis double authentification si activée). Ne pas remodifier l'écran par défaut
  d'Authentik : son blueprint d'origine le réécrit à chaque redémarrage ;
- marque `authentik-default` : titre, icône d'onglet, français, et le CSS du design « encre »
  (`branding_custom_css`). Authentik 2025.10 applique ce CSS à chacun de ses composants ;
  la copie qu'il met aussi dans la page elle-même est abîmée (caractères échappés), donc
  rien n'est posé sur `html` ou `body` : le fond est sur `.pf-c-page__drawer` ;
- polices et icône : `authentik/theme/`, montées en lecture seule sous `/media/recipelog/`.

`node cli.mjs connexion` (lancé par install.sh et `recipelog-plateforme appliquer`) recopie
sur cet écran les boutons (Google) branchés sur l'ancien.

## API de la passerelle (pour l'appli)

En-tête : `Authorization: Bearer ${RECIPELOG_PASSERELLE_CLE}`. Réponses JSON. Erreurs :
`{ "error": "<code>", "message": "<phrase en français>" }`.

| Méthode et chemin | Corps | Réponse |
|---|---|---|
| `GET /v1/equipe` | | `200 { "instance": "chanka", "max": 10 \| null, "membres": [{ "email", "nom", "actif", "derniereConnexion": ISO \| null }] }`. `max: null` = pas de plafond. Les super-admins ne sont pas listés et ne comptent pas. |
| `POST /v1/equipe` | `{ "email", "nom"? }` | `201 { "membre": {…}, "invitationEnvoyee": true }`. Crée le compte Authentik s'il n'existe pas, l'ajoute au groupe du client et envoie l'email « Choisis ton mot de passe ». `409 { "error": "quota", "max": 10 }` si le plafond est atteint ; `409 { "error": "deja_membre" }` ; `400 { "error": "email_invalide" }`. |
| `DELETE /v1/equipe/<email>` | | `204`. Retire du groupe du client (le compte Authentik reste s'il sert ailleurs, sinon il est désactivé). |
| `POST /v1/equipe/<email>/invitation` | | `200 { "invitationEnvoyee": true }`. Renvoie l'email. |

`401 { "error": "cle_invalide" }` si la clé ne correspond à aucun client. `503 { "error": "authentik_indisponible" }` si Authentik ne répond pas.

## Session, maintenance et secours (corrections des relectures)

- **Renouvellement** : la session dure 7 jours. Tant que l'appli est ouverte, `SessionKeeper`
  appelle `POST /auth/renouveler` : passé 12 heures, la passerelle revérifie que la personne
  est toujours dans l'équipe, puis la session repart pour 7 jours. Une personne retirée de
  l'équipe perd donc l'accès en 12 heures au plus, sans attendre la fin des 7 jours.
- **Session finie pendant le travail** : les actions répondent « Ta session a expiré »
  (401 pour les routes d'API) au lieu d'un refus incompréhensible, et la page `/acces`
  renvoie vers la connexion.
- **Maintenance** : pendant la plage, les actions, les routes d'API et le MCP sont refusés
  (503), pas seulement les pages. Le compte de maintenance (super-admin) passe. La dernière
  réponse connue de la passerelle est gardée 15 minutes si elle ne répond plus.
- **`RECIPELOG_AUTH_OFF=1`** est ignoré en mode `oidc` : sur la plateforme, rien d'autre ne
  filtre l'entrée du site.
- **Responsable** : la promotion automatique en administrateur ne se fait qu'une fois
  (réglage `responsablePromu`) ; supprimé ou remis en attente, il ne revient pas tout seul.
- **Lecture par IA** : l'appli demande la réponse en continu (`stream`), jusqu'à 64 000 jetons ;
  la passerelle ne compte que les lectures finies normalement et écrit la vraie erreur
  d'Anthropic dans ses journaux (`recipelog-plateforme logs passerelle`).
