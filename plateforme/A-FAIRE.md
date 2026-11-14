# Ce que tu dois faire toi-même

Tout ce que Claude ne peut pas faire à ta place : comptes à créer, clics dans Cloudflare,
commandes à lancer sur ton Proxmox. Dans l'ordre. Coche au fur et à mesure.

Compter **1 h à 1 h 30** la première fois. Rien de tout ça ne touche à ton site actuel
(main, stable, tes conteneurs LXC) : tout se passe dans une nouvelle VM.

> Ce document est mis à jour à chaque lot. Les étapes déjà faites restent cochables ;
> les nouvelles arrivent en bas, avec le numéro du lot.

---

## A. Une seule fois, avant d'installer (≈ 30 min)

### ☐ A1. Rendre l'image de l'appli publique (GitHub, 2 min)

1. Aller sur **github.com/SuperNon0** → onglet **Packages** → **recipelog**.
2. **Package settings** (en bas à droite) → **Change visibility** → **Public** → confirmer.

Si « recipelog » n'apparaît pas encore dans Packages : attendre que l'action « Docker image »
de la branche `plateforme` soit verte (onglet **Actions** du dépôt).

### ☐ A2. Créer le tunnel Cloudflare de la plateforme (5 min)

1. **one.dash.cloudflare.com** → **Networks → Tunnels → Create a tunnel** → **Cloudflared**.
2. Nom : `recipelog-plateforme` → **Save tunnel**.
3. Sur l'écran d'installation, copier **le jeton** : la longue chaîne après `--token`.
   Le garder de côté (bloc-notes), il servira en B1. Ne rien installer, cliquer **Next**.
4. **Public Hostname** :
   - Subdomain : `*`
   - Domain : `recipelog.cc`
   - Service : Type `HTTP`, URL `traefik:80`
   - **Save tunnel**.

Tes adresses actuelles (`recipelog.cc`, `www`, `demo`) ne bougent pas : elles restent sur
l'ancien tunnel, une adresse précise passe toujours avant `*`.

### ☐ A3. Créer un compte Brevo pour envoyer les emails (15 min)

Sans ça, personne ne reçoit l'email « Choisis ton mot de passe ». Gratuit jusqu'à
300 emails par jour.

1. Créer un compte sur **brevo.com**.
2. **Expéditeurs, domaines et IP dédiées → Domaines → Ajouter un domaine** : `recipelog.cc`.
   Brevo affiche 3 ou 4 enregistrements DNS : les ajouter un par un dans Cloudflare
   (**recipelog.cc → DNS → Records → Add record**, en copiant type, nom et valeur).
   Revenir sur Brevo et cliquer **Vérifier**.
3. **SMTP et API → onglet SMTP** :
   - noter l'**identifiant** (ressemble à `8a1b2c001@smtp-brevo.com`) ;
   - **Générer une nouvelle clé SMTP**, la noter (elle ne s'affiche qu'une fois).

### ☐ A4. (Facultatif) Le bouton « Se connecter avec Google » (10 min)

Tu peux le faire plus tard, ça ne bloque rien.

1. **console.cloud.google.com** → créer un projet `RecipeLog`.
2. **API et services → Écran de consentement OAuth** : type **Externe**, nom `RecipeLog`,
   ton email, enregistrer. Puis **Publier l'application**.
3. **API et services → Identifiants → Créer des identifiants → ID client OAuth** :
   - Type : **Application Web**
   - URI de redirection autorisés : `https://auth.recipelog.cc/source/oauth/callback/google/`
4. Noter l'**ID client** et le **Code secret du client**.

---

## B. Installer la plateforme (≈ 20 min, dont 10 d'attente)

### ☐ B1. Créer la VM (sur l'hôte Proxmox, en root)

Dans le **Shell** de ton nœud Proxmox :

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/SuperNon0/recipelogs/plateforme/plateforme/creer-vm.sh)"
```

Le script pose des questions ; pour presque toutes, **Entrée** suffit :

| Question | Quoi répondre |
|---|---|
| Numéro de la VM, nom, cœurs, mémoire, disque | Entrée (proposé : 4 cœurs, 12 Go, 100 Go) |
| Stockage du disque, pont réseau | Entrée (`local-lvm`, `vmbr0`), sauf si les tiens s'appellent autrement |
| Fichier des clés SSH autorisées | Entrée : la VM accepte les mêmes clés SSH que ton Proxmox |
| Ton adresse email | **ton** adresse : tu deviens super-admin |
| Jeton du tunnel | celui copié en A2 |
| Branche du dépôt | Entrée (`plateforme`) |

Attendre le résumé (5 à 10 minutes). **Noter l'adresse IP** de la VM qu'il affiche.

### ☐ B2. Brancher les emails (dans la VM)

```bash
ssh recipelog@<adresse IP de la VM>
sudo -i
nano /srv/recipelog/.env
```

Remplir ces lignes (elles existent déjà, vides) avec ce que tu as noté en A3 :

```
SMTP_HOTE='smtp-relay.brevo.com'
SMTP_PORT='587'
SMTP_UTILISATEUR='<identifiant Brevo>'
SMTP_MOT_DE_PASSE='<clé SMTP Brevo>'
SMTP_EXPEDITEUR='RecipeLog <noreply@recipelog.cc>'
```

Enregistrer (**Ctrl+O**, Entrée, **Ctrl+X**), puis :

```bash
recipelog-plateforme up -d
docker exec recipelog-passerelle node cli.mjs initialiser
```

La 2e commande t'envoie l'email « Choisis ton mot de passe ».

### ☐ B3. (Si tu as fait A4) Brancher Google

Toujours dans la VM :

```bash
docker exec recipelog-passerelle node cli.mjs google '<ID client>' '<code secret>'
```

---

## C. Vérifier que tout marche (10 min)

### ☐ C1. Ton compte

1. Ouvrir l'email **« RecipeLog : choisis ton mot de passe »** → bouton → **Continuer** →
   choisir un mot de passe (10 caractères au moins).
2. Conseillé : sur **https://auth.recipelog.cc/if/user/#/settings**, partie des appareils
   d'authentification (MFA) → ajouter un appareil **TOTP** et scanner le QR code avec une
   application comme Google Authenticator. Le code sera demandé à chaque connexion.

### ☐ C2. Le client de test

1. Ouvrir **https://test.recipelog.cc** : la page « Connexion à RecipeLog » s'affiche.
2. Se connecter avec ton email et ton mot de passe : RecipeLog s'ouvre.
3. **Réglages → Se déconnecter** : retour à la page de connexion.

Si quelque chose bloque : dans la VM, `recipelog-plateforme ps` (tout doit être `healthy`)
et `recipelog-instance journaux test`. Envoie-moi ce qui s'affiche.

### ☐ C3. Le panel admin (lot 2)

1. Ouvrir **https://admin.recipelog.cc** et se connecter avec ton compte.
2. Tu vois le client `test`. Essaie **Équipe**, **Réglages**, **Pause** puis **Réactiver**.

Si la page dit « Panel pas encore réglé » : relancer `install.sh` dans la VM (voir
« Déjà installé ? » plus bas).

### ☐ C4. Un vrai client (quand tu veux)

Dans le panel : **+ Nouveau client** → nom, email du responsable, nombre de comptes.
(Ou en ligne de commande : `recipelog-instance creer chanka --responsable adresse@du-responsable.fr --max 10`.)

Le responsable reçoit son email, choisit son mot de passe, et invite lui-même son équipe
depuis **Réglages → Comptes**. 0 compte = pas de limite.

---

## Déjà installé ?

Si tu avais déjà lancé `creer-vm.sh` avant un nouveau lot, pas besoin de refaire la VM.
Relancer `install.sh` ajoute ce qui manque (Authentik au lot 1, le panel au lot 2) sans
toucher aux clients ni aux réglages. Dans la VM, en root :

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/SuperNon0/recipelogs/plateforme/plateforme/install.sh)"
recipelog-instance brancher-authentik test   # seulement si test date d'avant le lot 1
```

Puis faire B2, B3 et C (si pas déjà faits), et retirer la protection Cloudflare Access de `test.recipelog.cc`
(**Zero Trust → Access → Applications**).

---

## Récapitulatif de ce que tu dois garder quelque part

| Quoi | Où le retrouver |
|---|---|
| Mot de passe de secours d'Authentik (compte `akadmin`) | dans la VM : `grep BOOTSTRAP_PASSWORD /srv/recipelog/.env` |
| Tous les autres secrets | `/srv/recipelog/.env` dans la VM (lisible seulement par root) |
| Résumé de l'installation | `/root/recipelog-plateforme.txt` dans la VM |
| Le panel admin | https://admin.recipelog.cc (ton compte super-admin) |
