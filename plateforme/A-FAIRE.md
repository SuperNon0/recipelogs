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

5. **Vérifier la ligne DNS de l'étoile** (Cloudflare ne la crée pas toujours tout seul) :
   - sur la page du tunnel, copier son **Tunnel ID** (une suite du genre `a1b2c3d4-…`) ;
   - **dash.cloudflare.com → recipelog.cc → DNS → Records** : s'il n'y a pas de ligne `*`,
     **Add record** → Type `CNAME`, Name `*`, Target `<Tunnel ID>.cfargotunnel.com`,
     Proxy **activé** (nuage orange) → **Save**.

   Sans cette ligne, `test.`, `admin.` et `auth.recipelog.cc` ne répondent pas.

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

L'identifiant et la clé te seront demandés pendant l'installation (B1).

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
| Serveur d'envoi des emails | `smtp-relay.brevo.com` (Entrée = tu le feras plus tard, en B2) |
| Port | Entrée (`587`) |
| Identifiant SMTP, clé SMTP | ceux notés en A3 (la clé ne s'affiche pas quand tu la colles) |
| Expéditeur des emails | Entrée (`RecipeLog <noreply@recipelog.cc>`) |
| Branche du dépôt | Entrée (`plateforme`) |

Les étapes de l'installation s'affichent au fur et à mesure (5 à 15 minutes). À la fin, le
résumé donne l'adresse IP de la VM : **note-la**. Si tu as donné Brevo, l'email « Choisis ton
mot de passe » part tout seul à la fin.

> **Si le script est revenu tout de suite à `root@…#`** juste après « VM démarrée » (bug corrigé
> le 2026-11-17) : l'installation continue quand même dans la VM. Suis-la avec
> `qm guest exec <numéro de la VM> -- tail -n 30 /root/install-plateforme.log`, et quand
> `qm guest exec <numéro> -- cat /root/recipelog-plateforme.txt` affiche le résumé, efface le
> fichier qui contient ta clé SMTP : `qm set <numéro> --delete cicustom` puis
> `rm -f /var/lib/vz/snippets/recipelog-plateforme-<numéro>.yaml`.

> **Si le résumé ou le journal dit « Panel non branché sur Authentik »** (bug corrigé le
> 2026-11-17) : entre dans la VM (encadré ci-dessous), puis `bash /root/install-plateforme.sh`.
> Relancer est sans danger : il garde tes réglages et le client « test ».

> **Pour entrer dans la VM**, c'est toujours depuis le **Shell de ton nœud Proxmox** (la clé
> SSH est là, pas sur ton ordinateur) : `ssh recipelog@<adresse IP de la VM>` puis `sudo -i`.
> Sans SSH : dans Proxmox, la VM → **Console (xterm.js)**.

### ☐ B2. Brancher les emails (seulement si tu as répondu Entrée en B1)

Depuis le Shell de ton nœud Proxmox :

```bash
ssh recipelog@<adresse IP de la VM>
sudo -i
nano /srv/recipelog/.env
```

Ajouter ces lignes avec ce que tu as noté en A3 :

```
SMTP_HOTE='smtp-relay.brevo.com'
SMTP_PORT='587'
SMTP_UTILISATEUR='<identifiant Brevo>'
SMTP_MOT_DE_PASSE='<clé SMTP Brevo>'
SMTP_EXPEDITEUR='RecipeLog <noreply@recipelog.cc>'
```

Enregistrer (**Ctrl+O**, Entrée, **Ctrl+X**), puis :

```bash
recipelog-plateforme appliquer
```

Cette commande relance ce qu'il faut et t'envoie l'email « Choisis ton mot de passe ». Elle
sert après **chaque** changement dans `/srv/recipelog/.env`.

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

### ☐ C3 bis. (Conseillé) Fermer le panel avec Cloudflare Access (5 min)

Le panel commande tous les clients : une deuxième porte ne fait pas de mal.
**one.dash.cloudflare.com → Access → Applications → Add an application → Self-hosted** :
- Application domain : `admin.recipelog.cc` ;
- Policy : **Allow**, règle **Emails** = ton adresse ;
- enregistrer.

Tu recevras un code par email avant d'arriver sur la page de connexion du panel. Ne mets
**pas** Access sur `auth.`, `status.` ni sur les sites des clients.

### ☐ C4. Un vrai client (quand tu veux)

Dans le panel : **+ Nouveau client** → nom, email du responsable, nombre de comptes.
(Ou en ligne de commande : `recipelog-instance creer chanka --responsable adresse@du-responsable.fr --max 10`.)

Le responsable reçoit son email, choisit son mot de passe, et invite lui-même son équipe
depuis **Réglages → Comptes**. 0 compte = pas de limite.

---

---

## D. Les sauvegardes (lot 3)

Les sauvegardes de chaque client se font toutes seules chaque nuit, dans la VM. Ce qui manque :
une copie **hors de la VM**, pour le jour où le disque lâche. C'est ta sauvegarde Proxmox
Backup Server vers OVH qui s'en charge, rien d'autre à installer.

### ☐ D1. Mettre la VM dans ta sauvegarde PBS (5 min)

1. Dans Proxmox : **Centre de données → Sauvegarde**.
2. Ouvrir ta tâche qui envoie vers Proxmox Backup Server (celle qui part ensuite chez OVH).
3. Vérifier que la VM **recipelog-plateforme** est cochée (ou que la tâche prend « Toutes »).
   Sinon, la cocher et **OK**. Mode conseillé : **Snapshot**.
4. Idéalement, la tâche passe **après 3 h 30** du matin : elle emporte alors les sauvegardes
   de la nuit.

### ☐ D2. Essayer une restauration (5 min, quand tu veux)

1. Sur **https://admin.recipelog.cc**, client `test` → **Sauvegardes** → **Sauvegarder maintenant**.
2. Dans RecipeLog de `test`, supprimer une recette.
3. Retour dans **Sauvegardes** → **Restaurer** sur celle de l'étape 1, taper `test`, valider.
4. La recette est revenue.

---

## E. Déménager ton site, la démo et la vitrine (lot 4, ≈ 1 h)

À faire **après** A, B, C et D, à un moment calme (le soir) : ce qui est ajouté sur l'ancien
site après l'étape E1 ne suivra pas. Les anciens conteneurs ne sont **jamais modifiés** : si
quelque chose cloche, tu remets simplement les anciennes adresses (E5) et tout revient comme avant.

### ☐ E1. Ton site (sur l'hôte Proxmox, puis dans la VM)

1. Dans le **Shell** de ton nœud Proxmox (remplace `120` par le numéro du conteneur de ton
   RecipeLog actuel) :
   ```bash
   curl -fsSL https://raw.githubusercontent.com/SuperNon0/recipelogs/plateforme/plateforme/exporter-ancien.sh | bash -s -- 120 /root/monsite.tar.gz
   ```
   Le script affiche le **nombre de photos et factures** emportées (note-le). S'il en manque
   une seule, il s'arrête au lieu de fabriquer une archive incomplète.
2. L'envoyer dans la VM (adresse IP notée en B1) :
   ```bash
   scp /root/monsite.tar.gz recipelog@<adresse IP de la VM>:/tmp/
   ```
3. Dans la VM (toujours depuis le Shell Proxmox : `ssh recipelog@<IP>` puis `sudo -i`). Choisis
   le nom de ton site : il devient `<nom>.recipelog.cc` (ici `chanka`).
   ```bash
   recipelog-instance creer chanka --responsable ton@adresse.fr
   recipelog-instance importer chanka /tmp/monsite.tar.gz --oui
   rm /tmp/monsite.tar.gz
   ```
   L'import affiche « Importé : N recette(s), N photo(s) et facture(s) » : compare avec le
   nombre noté à l'étape 1. (Le client prend la version « Clients », branche `instance`.
   Pour ton propre site, passe-le ensuite sur la bêta : sa fiche dans le panel → **Version de
   l'appli** → **Changer…** → **Bêta**.)
4. Ouvre **https://chanka.recipelog.cc** avec ton compte : tes recettes, factures et photos sont là.
5. Pour envoyer à ton équipe l'email « Choisis ton mot de passe » (leurs rôles sont gardés) :
   ```bash
   recipelog-instance inviter-comptes chanka
   ```
6. Connecteur Claude (MCP) : dans claude.ai, remplace l'adresse du connecteur RecipeLog par
   `https://chanka.recipelog.cc/api/mcp` (même clé qu'avant), puis reconnecte-le.

### ☐ E2. La démo

**Le plus simple : une démo neuve.** Dans la VM : `recipelog-instance creer demo --demo --sans-authentik`.
Elle se remplit toute seule avec les exemples (1 à 2 minutes). Quand elle te plaît :
`recipelog-instance demo-figer demo`. Rien d'autre à faire (tu sautes ce qui suit).

**Seulement si tu veux garder ce que tu as ajouté dans l'ancienne démo :**

1. Sur l'hôte Proxmox (`115` = ton conteneur vitrine + démo) : l'option prend l'état « figé »
   de la démo, pas les essais des visiteurs.
   ```bash
   curl -fsSL https://raw.githubusercontent.com/SuperNon0/recipelogs/plateforme/plateforme/exporter-ancien.sh | bash -s -- 115 --reference-demo /root/demo.tar.gz
   scp /root/demo.tar.gz recipelog@<adresse IP de la VM>:/tmp/
   ```
2. Dans la VM :
   ```bash
   recipelog-instance creer demo --demo --sans-authentik
   recipelog-instance importer demo /tmp/demo.tar.gz --oui
   recipelog-instance demo-figer demo
   rm /tmp/demo.tar.gz
   ```

### ☐ E3. La vitrine (déjà là)

Elle a été installée avec la plateforme. Dans le panel, partie **Site vitrine** :
**Mettre à jour la vitrine**, puis, si tu veux, un **bandeau** (« Offre de lancement… »).
Le formulaire « Nous écrire » arrive à ton adresse par Brevo (étape A3) : plus besoin du Gmail
du site. Pour garder les anciens messages (facultatif), sur l'hôte Proxmox :
```bash
pct exec 115 -- cat /var/lib/recipelog-vitrine/messages.jsonl | ssh recipelog@<IP> "sudo tee -a /srv/recipelog/vitrine/messages/messages.jsonl >/dev/null"
```

### ☐ E4. Basculer les adresses dans Cloudflare (5 min)

**one.dash.cloudflare.com → Networks → Tunnels** :
1. Ton **ancien tunnel** (celui du conteneur `cloudflare-tunnel`) → **Public Hostname** :
   supprimer `recipelog.cc`, `www.recipelog.cc` et `demo.recipelog.cc`.
2. **dash.cloudflare.com → recipelog.cc → DNS → Records** : supprimer les trois lignes `CNAME`
   `recipelog.cc`, `www` et `demo` qui pointent vers l'ancien tunnel (supprimer une adresse
   dans un tunnel n'efface pas sa ligne DNS). Ne touche pas à la ligne `*` ni à celles de Brevo.
3. Le tunnel **recipelog-plateforme** → **Public Hostname → Add** : Subdomain **vide**,
   Domain `recipelog.cc`, Service `HTTP` `traefik:80` → **Save**. (`www` et `demo` passent
   maintenant par `*`.)
4. Vérifier **https://recipelog.cc**, **https://www.recipelog.cc**, **https://demo.recipelog.cc**
   et le formulaire. Les adresses peuvent mettre une ou deux minutes à suivre.

### ☐ E5. Une semaine plus tard

Si tout va bien : **arrêter** (pas supprimer) les anciens conteneurs RecipeLog et vitrine
dans Proxmox. Garde-les un mois avant de les supprimer. En cas de souci avant : remettre les
adresses de E4 sur l'ancien tunnel suffit à tout remettre comme avant.

---

## F. Les alertes sur ton téléphone (lot 5, facultatif, 5 min)

Les alertes (site en panne, retour, disque plein, nouvelle demande de support) arrivent déjà
par **email** aux adresses super-admin. Pour les recevoir aussi en notification sur ton
téléphone, choisis **Telegram** ou **Discord** (ou les deux).

### ☐ F1. Telegram
1. Dans Telegram, écris à **@BotFather** → `/newbot` → un nom (« RecipeLog alertes ») → il
   te donne un **jeton** (`123456:ABC…`).
2. Écris n'importe quoi à ton nouveau bot, puis ouvre
   `https://api.telegram.org/bot<jeton>/getUpdates` : note le nombre après `"chat":{"id":`.
3. Dans la VM, en root : `nano /srv/recipelog/.env`, ajoute
   ```
   ALERTE_TELEGRAM_JETON=123456:ABC…
   ALERTE_TELEGRAM_CHAT=987654321
   ```

### ☐ F2. Discord
Sur ton serveur Discord : **Paramètres du salon → Intégrations → Webhooks → Nouveau
webhook → Copier l'URL**. Dans `/srv/recipelog/.env` : `ALERTE_DISCORD_URL=https://discord.com/api/webhooks/…`

### ☐ F3. Appliquer et essayer
```bash
recipelog-plateforme appliquer
```
Puis dans le panel, partie **Santé de la machine** → **Tester les alertes** : le panel dit,
pour chaque moyen (email, Telegram, Discord), si le message est parti. (Pour couper les emails d'alerte : `ALERTE_EMAIL=non` dans le `.env`.)

La page de statut **https://status.recipelog.cc** marche toute seule (elle passe par `*`
dans Cloudflare) : rien à faire.

---

## G. La lecture des factures par IA (lot 7, 10 min)

Sans cette étape, tes clients peuvent déjà lire leurs factures avec **leur propre** clé d'IA
(Réglages → Lecture des factures par IA) et importer leurs mercuriales Excel / CSV. Pour leur
**fournir** l'IA, avec un nombre de lectures par mois :

### ☐ G1. Créer une clé Anthropic
1. Sur **https://platform.claude.com**, connecte-toi, puis **Billing** : ajoute un moyen de
   paiement et quelques dollars de crédit (une facture coûte de l'ordre de quelques centimes).
   Mets une **limite de dépense mensuelle** (Limits) pour ne jamais avoir de surprise.
2. **API keys → Create key** (nom : « RecipeLog plateforme ») et copie la clé (`sk-ant-…`).

### ☐ G2. L'ajouter dans la VM (en root)
```bash
nano /srv/recipelog/.env        # ajoute : IA_ANTHROPIC_CLE=sk-ant-…
recipelog-plateforme appliquer
```
Le panel affiche alors « Clé Claude de la plateforme réglée » dans **Lecture des factures par IA**.

### ☐ G3. Régler et essayer
1. Dans le panel, **Changer le défaut** si 30 lectures par mois et par client ne te vont pas,
   ou **Régler** pour un client à part (0 = coupé).
2. Sur le RecipeLog de test : **Factures → Lire une facture avec l'IA**, avec une vraie
   facture Ribera en photo. Vérifie les lignes (et le champ **Article** de chaque ligne), puis
   enregistre.
3. Essaie aussi une **mercuriale PDF de plusieurs pages**. Cette fonction n'a encore jamais
   tourné avec la vraie IA : si une lecture échoue, la raison exacte est dans
   `recipelog-plateforme logs passerelle` (lignes « IA : ») et `recipelog-instance journaux test`.
   Envoie-moi ces lignes.

---

## H. Tarifs et textes légaux (lot 8, quand tu veux vendre)

Rien ne presse : tant que tu n'as pas publié, les pages existent mais sont marquées
« Brouillon ». Le détail de chaque obligation est dans le
[Dossier juridique RecipeLog](https://claude.ai/artifact/TCnM5CzR7Dh61uEESpwo4w) (onglet « Ce que tu dois avoir »).

### ☐ H1. Rassembler tes informations (15 min)
Ton statut (micro-entreprise, SASU…), ton **SIREN**, une **adresse** (une domiciliation
marche si tu ne veux pas montrer la tienne), un **e-mail** de contact, un **téléphone**
(obligatoire : tu es l'hébergeur, puisque le serveur est chez toi), la ville du tribunal,
et ta situation **TVA** (franchise ou pas).

### ☐ H2. Les mettre dans le panel et choisir tes prix (10 min)
Panel → **Vente : tarifs et textes légaux** → **Modifier**. Remplace les prix d'exemple
(29 €, 59 €, sur devis). Ouvre chaque page avec les liens sous la liste des offres.

### ☐ H3. Faire relire, puis publier
1. Fais relire les CGV, la politique de confidentialité et l'accord de sous-traitance
   (expert-comptable, avocat, ou le service juridique de ta CCI ou de ta banque).
2. Dans tes comptes **Cloudflare** et **Anthropic**, accepte leur accord de traitement des
   données (DPA), et garde-en une copie.
3. Coche **Publier** et mets la date du jour dans « En vigueur au ».

### ☐ H4. À garder pour toi
- Le **registre des traitements** (onglet du dossier juridique) : complète-le, garde-le à
  jour, montre-le seulement si la CNIL le demande.
- **Factures électroniques** : tu dois pouvoir en **recevoir** depuis le 1er septembre 2026
  (choisis une plateforme agréée, ta banque ou ton logiciel de compta en proposent), et en
  **émettre** à partir du 1er septembre 2027.
- Conseillé : une assurance responsabilité civile professionnelle qui couvre la perte de
  données d'un client.

### ☐ H5. (Si tu veux) Des liens depuis la vitrine
La vitrine ne montre pas encore ces pages : la branche `site-vitrine` n'a pas été touchée.
Dis-moi si je peux y ajouter « Tarifs », « Mentions légales » et « CGV » en bas de page.

---

## I. Mettre à jour (quand une nouvelle version sort)

Trois choses se mettent à jour séparément. Dans l'ordre :

**D'où viennent les nouveautés.** Quatre branches :
- `beta-instance` : l'appli des clients en cours de développement (recettes, factures, etc.).
  Tous les changements de l'appli se font ici. GitHub en construit la version **Bêta**, que tu
  mets sur ta propre instance pour l'essayer.
- `instance` : la version **Clients**. Quand la bêta te plaît, tu dis « passe la bêta en
  instance » : tout ce qui est sur `beta-instance` passe sur `instance`, GitHub construit la
  nouvelle version Clients, puis tu mets à jour chaque client (I2).
- `plateforme` : la machine elle-même (panel, connexion, sauvegardes, PDF, scripts), installée
  par I1. Elle ne touche pas à l'appli des clients.
- `site-vitrine` : la vitrine (I3).

`main` et `stable` restent l'appli de tes sites LXC classiques (sans la plateforme).

Chaque client a sa **version** (fiche du client → **Version de l'appli**) : « Clients » ou
« Bêta ». **Changer…** le sauvegarde, le passe sur l'autre version et le redémarre ; si elle ne
démarre pas, il revient tout seul sur celle d'avant. En ligne de commande :
`recipelog-instance canal <nom> beta-instance` (ou `instance`).

### ☐ I0. Une seule fois : passer sur les branches instance / beta-instance (17/11/2026)
Les clients créés avant ce jour suivent encore l'ancienne version « plateforme ».
1. Fais I1 (mettre à jour la plateforme) : le panel apprend les versions « Clients » et « Bêta »,
   et les nouveaux clients prennent « Clients ».
2. Vérifie dans **Actions** que l'action **Image Docker** est verte pour les branches `instance`
   et `beta-instance`.
3. Pour chaque client, sa fiche → **Version de l'appli** → **Changer…** : **Clients** pour tes
   clients, **Bêta** pour ton propre site (et `test` si tu veux). Ou dans la VM, en root :
   ```bash
   recipelog-instance canal test beta-instance
   recipelog-instance canal chanka beta-instance
   ```

### ☐ I1. La plateforme elle-même (panel, connexion, outils), dans le panel
Page **Accueil** → bloc **Plateforme** (en bas à droite) → **Mettre à jour la plateforme**. Le bloc dit
quelle version est installée et combien de nouveautés attendent sur GitHub (une ligne apparaît
aussi dans « À faire »). La fenêtre suit la mise à jour : le panel se coupe 5 à 10 minutes puis
revient, et à la fin **Recharger la page** affiche le nouveau panel.

La toute première fois (le bouton n'existe pas encore sur ta machine), ou si le panel ne répond
plus, c'est la même chose à la main, dans la VM en root :
```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/SuperNon0/recipelogs/plateforme/plateforme/install.sh)"
```
Sans danger : les clients, leurs données et tes réglages ne sont pas touchés. Les sites des
clients restent en ligne pendant ce temps.

### ☐ I2. Les sites des clients, dans le panel
1. Vérifie que l'action **Image Docker** de la branche `instance` (ou `beta-instance` pour la
   bêta) est verte (github.com/SuperNon0/recipelogs → **Actions**).
2. Essaie d'abord sur un seul : page **Clients** → clique sur `test` → **Mettre à jour** (en haut
   de sa fiche). Ouvre-le.
3. Puis, page **Clients**, **Tout mettre à jour**. Chaque client est sauvegardé juste avant. (C'est aussi à ce
   moment qu'un client prend les nouveaux réglages de la plateforme, par exemple le service
   PDF commun.) Si la nouvelle
   version ne démarre pas chez l'un d'eux, il est remis tout seul sur sa version et sa base
   d'avant (badge « version gardée »), et les suivants ne sont pas touchés.

### ☐ I3. La vitrine, dans le panel
Page **Site vitrine** (menu de gauche, ou « Plus » sur téléphone) → **Mettre à jour la vitrine**.

---

## Déjà installé ?

Si tu avais déjà lancé `creer-vm.sh` avant un nouveau lot, pas besoin de refaire la VM.
Relancer `install.sh` ajoute ce qui manque (Authentik au lot 1, le panel au lot 2, les
sauvegardes au lot 3, la vitrine au lot 4, le dossier du support au lot 5, celui des annonces au lot 6, celui de l'IA au lot 7, les pages de vente au lot 8, le service PDF commun,
et depuis les corrections des relectures : 4 Go de mémoire de secours, les mises à jour de sécurité
automatiques de Debian, l'heure de Paris, la sauvegarde nocturne des comptes) sans
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
| La page de statut (à donner aux clients) | https://status.recipelog.cc |
| Les sauvegardes des clients | dans la VM : `/srv/recipelog/sauvegardes/`, et dans ta sauvegarde PBS → OVH |
| La sauvegarde des comptes (Authentik) et des réglages | dans la VM : `/srv/recipelog/sauvegardes/_plateforme/`, chaque nuit |
