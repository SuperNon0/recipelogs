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
| `OIDC_INTERNE` | `http://recipelog-authentik:9000` | Facultatif. Les appels faits PAR LE SERVEUR (découverte, jeton, clés) partent vers cette origine au lieu de l'origine publique, avec les en-têtes `Host: auth.recipelog.cc` et `X-Forwarded-Proto: https` : Authentik répond alors avec les adresses publiques. Les redirections du navigateur, elles, utilisent toujours l'adresse publique. |
| `OIDC_CLIENT_ID` | `rl-chanka` | |
| `OIDC_CLIENT_SECRET` | (secret) | |
| `RECIPELOG_SESSION_SECRET` | 64 caractères hexadécimaux | Signe le cookie de session (HMAC-SHA256). |
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
