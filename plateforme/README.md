# Plateforme RecipeLog

> **Ce que tu dois faire toi-même :** [A-FAIRE.md](A-FAIRE.md), toutes les installations, dans l'ordre.
> **Où en est le chantier :** voir [Journal du chantier](#journal-du-chantier) en bas de cette page.
> La machine (panel, connexion, sauvegardes, scripts) se fait sur la branche `plateforme`.
> L'appli des clients se fait sur `beta-instance` (la bêta), puis passe sur `instance` (les
> clients) quand Noë le dit. `main` et `stable` (sites LXC) ne sont pas touchées par ce chantier.

Tout RecipeLog en ligne sur **une seule machine** de ton Proxmox : chaque client a
son propre RecipeLog sur `<nom>.recipelog.cc`, avec sa propre base.

```
Visiteurs ── Cloudflare ── tunnel ──> cloudflared ──> Traefik ──> rl-test   (test.recipelog.cc)
                                                          └──> rl-<client> (<client>.recipelog.cc)
                                       PostgreSQL : une base par client (rl_test, rl_<client>…)
```

| Élément | Rôle |
|---|---|
| `docker-compose.yml` | Traefik (l'aiguilleur), PostgreSQL, l'accès Docker limité, le tunnel Cloudflare, Authentik (la connexion, sur `auth.recipelog.cc`) et la passerelle |
| `authentik/` | Réglages d'Authentik appliqués tout seuls (connexion par email, mot de passe oublié, déconnexion, super-admins) et l'email d'invitation en français |
| `passerelle/` | Le seul service qui a la clé d'Authentik : crée les clients, invite, compte les places. Chaque RecipeLog lui parle avec sa propre clé |
| `connexion.md` | Comment l'appli, Authentik et la passerelle se parlent |
| `panel/` | Le panel admin sur `admin.recipelog.cc` (réservé aux super-admins) et son moteur, le seul à piloter Docker. Sert aussi la page « site en pause » |
| `traefik/` | Réglages de Traefik : en-têtes de sécurité, limitation des abus |
| `bin/recipelog-instance` | Créer, lister, mettre à jour, supprimer un client |
| `install.sh` | Prépare une Debian 12 vierge (Docker, pare-feu, réglages, démarrage) |
| `creer-vm.sh` | Crée la VM sur l'hôte Proxmox et lance `install.sh` dedans |

L'image de l'appli est construite par GitHub Actions (`.github/workflows/docker-image.yml`) :
`ghcr.io/supernon0/recipelog:beta` suit `main`, `:stable` suit `stable`, et `:plateforme`
suit la branche `plateforme`, où se construit tout le chantier avant d'arriver dans `main`.
Le client de test suit `:plateforme`.

## Installer

### 1. Une fois sur GitHub : rendre l'image publique

Après le premier build de la branche `plateforme`, ouvrir **github.com/SuperNon0 → Packages → recipelog →
Package settings → Change visibility → Public**. Le code est déjà public ; sinon la VM
devrait se connecter à ghcr.io avec un jeton.

### 2. Dans Cloudflare : un tunnel pour la plateforme

1. **Zero Trust → Networks → Tunnels → Create a tunnel**, type *Cloudflared*, nom
   `recipelog-plateforme`. Copier le **jeton** (la longue chaîne après `--token`).
2. Dans le tunnel, **Public Hostname → Add** : sous-domaine `*`, domaine `recipelog.cc`,
   service `HTTP` → `traefik:80`.
3. Cloudflare crée l'enregistrement DNS `*` vers ce tunnel. Les adresses déjà
   utilisées (`recipelog.cc`, `www`, `demo`) restent sur l'ancien tunnel : un
   enregistrement précis passe toujours avant `*`. Elles déménageront au lot 4.

### 3. Sur l'hôte Proxmox : créer la VM

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/SuperNon0/recipelogs/plateforme/plateforme/creer-vm.sh)"
```

Le script demande le numéro de VM, la taille (4 cœurs, 12 Go, 100 Go proposés), ton
adresse email et le jeton du tunnel. Il crée une VM Debian 12, qui installe tout
seule la plateforme et le client de test. Compter 5 à 10 minutes ; le résumé
s'affiche à la fin. Connexion ensuite : `ssh recipelog@<adresse de la VM>` puis `sudo -i`.

### 4. Les emails (invitations, mot de passe oublié)

Sans serveur d'envoi, personne ne reçoit son email « Choisis ton mot de passe ». Avec
**Brevo** (gratuit jusqu'à 300 emails par jour) :

1. Créer un compte sur brevo.com, puis **Expéditeurs, domaines → Domaines → Ajouter**
   `recipelog.cc` et ajouter dans Cloudflare les enregistrements DNS qu'il donne.
2. **SMTP et API → SMTP** : noter l'identifiant et créer une clé SMTP.
3. Dans la VM, compléter `/srv/recipelog/.env` :
   ```
   SMTP_HOTE='smtp-relay.brevo.com'
   SMTP_PORT='587'
   SMTP_UTILISATEUR='<identifiant Brevo>'
   SMTP_MOT_DE_PASSE='<clé SMTP>'
   SMTP_EXPEDITEUR='RecipeLog <noreply@recipelog.cc>'
   ```
4. `recipelog-plateforme up -d` puis renvoyer ton email :
   `docker exec recipelog-passerelle node cli.mjs initialiser`.

### 5. Ta connexion

L'installation t'a créé un compte sur `auth.recipelog.cc` (groupe **super-admins** : tu entres
sur tous les clients, sans compter dans leurs places, et tu peux régler Authentik). Ouvre
l'email « Choisis ton mot de passe ». Conseillé : active la double authentification dans
`https://auth.recipelog.cc/if/user/#/settings`.

En secours, le compte `akadmin` a son mot de passe dans `/srv/recipelog/.env`
(`AUTHENTIK_BOOTSTRAP_PASSWORD`).

### 6. (Facultatif) Le bouton « Google »

1. **console.cloud.google.com → API et services → Identifiants → Créer → ID client OAuth**,
   type *Application Web*, URI de redirection autorisée :
   `https://auth.recipelog.cc/source/oauth/callback/google/`.
2. Dans la VM : `docker exec recipelog-passerelle node cli.mjs google <ID client> <secret>`.

Google ne crée jamais de compte : il ne sert qu'aux personnes déjà invitées avec la même adresse.

## Au quotidien : le panel admin

**https://admin.recipelog.cc**, avec ton compte super-admin. Tout ce qui suit se fait en un clic :

- tableau des clients : état, places utilisées, version, essai, MCP ;
- **Nouveau client** : nom, responsable (il reçoit son invitation), nombre de comptes,
  jours d'essai, version, accès MCP ;
- par client : **Ouvrir** (tu entres comme administrateur caché), **Équipe** (inviter,
  renvoyer, retirer), **Réglages** (places, essai, MCP), **Mettre à jour**, **Pause** /
  **Réactiver**, **Supprimer** (en tapant son nom ; une archive est gardée) ;
- **Sauvegardes** d'un client : la liste, **Sauvegarder maintenant**, **Tester la dernière**,
  **Télécharger** (archive sans mot de passe), **Restaurer** (en tapant son nom) ;
- **Tout mettre à jour**, client par client, avec retour en arrière en cas de problème ;
- **Journal de tes actions**, avec le détail de chaque opération.

Un essai terminé met le client en pause tout seul (vérifié toutes les heures). Un client en
pause affiche « Ce RecipeLog est en pause » ; ses données restent là.

## Les sauvegardes (lot 3)

- **Chaque nuit vers 3 h** (heure de Paris), le moteur sauvegarde chaque client : sa base,
  ses photos et factures, et ses réglages à part (les mots de passe ne sortent jamais dans
  un téléchargement). Elles sont dans `/srv/recipelog/sauvegardes/<nom>/`.
- **On garde** toutes celles des 7 derniers jours, puis la plus récente de chaque semaine
  pendant 4 semaines et de chaque mois pendant 6 mois. Réglable dans `.env` :
  `SAUVEGARDE_JOURS`, `SAUVEGARDE_SEMAINES`, `SAUVEGARDE_MOIS`, et l'heure avec `SAUVEGARDE_HEURE`.
- **Restaurer** remet un client à la date choisie en 1 clic. Juste avant, l'état actuel est
  sauvegardé (« Avant restauration ») : on peut toujours revenir en arrière. Si la base ne se
  recharge pas, rien n'est changé et le client repart comme avant.
- **Chaque dimanche matin**, la dernière sauvegarde de chaque client est rechargée dans une
  base à part (ses recettes sont comptées, ses fichiers vérifiés) : le résultat s'affiche
  dans le panel. Une sauvegarde de plus de 36 h ou un test raté s'affiche en couleur.
- **La copie hors de la machine** : ta sauvegarde Proxmox Backup Server → OVH, qui emporte
  la VM entière, sauvegardes comprises. Rien d'autre à installer ; il faut juste que la VM
  soit dans ta tâche de sauvegarde PBS (voir [A-FAIRE.md](A-FAIRE.md), étape D1).

## Déménagement, démo et vitrine (lot 4)

- **Ton site actuel** passe sur la plateforme sans rien perdre : `exporter-ancien.sh` (sur
  l'hôte Proxmox) lit la base et les photos de l'ancien conteneur sans le modifier, puis
  `recipelog-instance importer` les met dans un client. Recettes, factures, fournisseurs,
  réglages, rôles et clé MCP suivent. `inviter-comptes` envoie ensuite à chaque compte actif
  l'email « Choisis ton mot de passe ». Pas à pas : [A-FAIRE.md](A-FAIRE.md), étape E.
- **La démo** est un client comme les autres, créé avec `--demo` (ouvert à tous, sans
  connexion). `demo-figer` garde son état comme référence ; elle y revient chaque nuit à
  4 h 30, ou en 1 clic dans le panel (bouton **Démo**).
- **La vitrine** (branche `site-vitrine`, jamais modifiée par ce chantier) tourne dans les
  conteneurs `recipelog-vitrine` (nginx) et `recipelog-vitrine-contact` (formulaire). Dans
  le panel, partie **Site vitrine** : mise à jour en 1 clic, bandeau en haut du site, et les
  **demandes reçues** par le formulaire, avec « Créer le client » (prérempli : son email en
  responsable, 14 jours d'essai). Le formulaire envoie ses emails par le même compte Brevo
  que la plateforme, vers ton adresse.

Le panel n'a aucun accès à Docker : il passe par le **moteur**, joignable seulement sur le
réseau interne avec une clé. Le moteur lance `recipelog-instance`, comme en ligne de commande.

## Surveillance et support (lot 5)

- **Chaque minute**, le moteur vérifie que chaque client et chaque service (connexion,
  passerelle, vitrine) répond. Après 2 minutes sans réponse, tu reçois une **alerte**, puis
  une autre quand il revient (avec la durée de la panne). Aussi : disque à 90 % (une fois par
  jour) et chaque nouvelle demande de support. Les alertes partent par **email** (adresses
  super-admin, même compte Brevo) et, si tu le règles, par **Telegram** ou **Discord** :
  [A-FAIRE.md](A-FAIRE.md), étape F.
- **Page de statut publique** sur `status.recipelog.cc` : chaque partie du service, avec
  90 jours d'historique, sans aucun nom de client. À donner aux clients.
- Dans le panel, partie **Santé de la machine** : processeur, mémoire, disque, état des
  services, et pour chaque client sa mémoire, sa base, ses fichiers, ses sauvegardes, ses
  recettes, ses comptes actifs, sa dernière activité et sa disponibilité sur 30 jours.
  Bouton **Journaux** sur chaque client : ce que son RecipeLog écrit, en direct.
- **Support** : dans son RecipeLog, chaque personne a Réglages → **Signaler un problème**
  (problème, question ou idée ; la page, le navigateur, l'écran, la version et le rôle sont
  joints tout seuls). Tu reçois une alerte, tu réponds depuis le panel (partie **Support**) :
  la réponse part par email et s'affiche dans son RecipeLog, où la personne peut répondre à
  son tour. Notes internes, fermer / rouvrir. Les demandes sont des fichiers dans
  `/srv/recipelog/support/<client>/`.

## Maintenance et messages (lot 6)

Dans le panel, partie **Maintenance et messages** :

- **Programmer une maintenance** pour tous les clients, quelques-uns, et/ou la vitrine :
  début et fin (ou « tout de suite », jusqu'à « Terminer »). Avant le début, un bandeau
  prévient dans leur RecipeLog et un email part à chaque compte de leur équipe (préavis,
  24 h par défaut). Pendant la plage, leur site affiche « Petite pause technique » ; toi
  (adresses super-admin), tu entres quand même, avec un bandeau qui te le rappelle. À la
  fin, tout se rouvre tout seul. La page de statut l'affiche aussi quand c'est tout le parc.
- **Écrire aux clients** : un email à chaque compte actif des clients choisis (ou de tous),
  avec des modèles « incident en cours », « incident résolu », « nouveautés » ou libre, et
  si tu veux le même message en bandeau dans l'appli. Les derniers envois sont listés.
- **Nouveau bandeau** : un message en haut de leur RecipeLog pendant quelques jours, que
  chacun peut fermer.

Tout est rangé dans `/srv/recipelog/annonces/` (écrit par le moteur, lu par la passerelle).
Si la passerelle ne répond pas, les sites marchent normalement, sans bandeau.

## Lecture des factures par IA et mercuriales (lot 7)

Dans RecipeLog, page **Factures** → **Lire une facture avec l'IA** : une photo ou un PDF
devient des lignes de prix (produit, référence, quantité, contenance, prix du colis, prix au
kg / L / pièce). Le client vérifie et corrige chaque ligne (les doutes de l'IA sont en
orange, « Nouveau » marque un produit jamais acheté, l'évolution du prix s'affiche), puis
enregistre : c'est la même chose qu'une facture envoyée à Claude, fichier joint compris.
Rien n'est écrit avant « Enregistrer ».

Sur la fiche d'un fournisseur, **Importer une mercuriale** : un Excel (.xlsx) ou un CSV est
lu directement, sans IA (le site devine les colonnes d'après les titres, le client corrige) ;
un PDF ou une photo passe par l'IA. Les prix entrent dans l'historique à la date choisie,
sans apparaître dans la liste des factures.

D'où vient l'IA (Réglages → **Lecture des factures par IA**, réservé à l'administrateur) :

- **IA de RecipeLog** : la passerelle appelle Claude avec **ta** clé Anthropic
  (`IA_ANTHROPIC_CLE`), que les clients ne voient jamais, et compte les lectures. Dans le
  panel, partie **Lecture des factures par IA** : lectures du mois de chaque client, coût
  estimé, et le nombre de lectures par mois (30 par défaut, un nombre à part par client,
  0 = coupé). Le compteur revient à zéro le 1er du mois.
- **Sa propre clé** : Claude, ChatGPT ou Gemini. Le client paie son fournisseur d'IA, sans
  limite, et ça ne passe pas par toi.

Une lecture tourne en arrière-plan (20 s à 2 min) : pas de coupure Cloudflare au bout de
100 s. Fichiers : `/srv/recipelog/ia/` (réglages écrits par le panel, compteurs par la passerelle).

## Vente : tarifs et textes légaux (lot 8)

Le site vitrine gagne cinq pages, servies par le panel (le site vitrine lui-même n'est pas
touché) : **recipelog.cc/tarifs**, **/mentions-legales**, **/cgv**, **/confidentialite** et
**/sous-traitance** (l'accord RGPD avec tes clients). Elles se remplissent depuis le panel,
partie **Vente : tarifs et textes légaux** → **Modifier** :

- ton entreprise (nom, statut, SIREN, adresse, e-mail, téléphone, ville du tribunal, TVA) ;
- les offres (nom, prix par mois ou « sur devis », utilisateurs, lectures IA, MCP), l'essai
  gratuit et les mois offerts à l'année. Au départ : **prix d'exemple** (29 €, 59 €, sur
  devis), à changer quand tu auras décidé ;
- la date d'entrée en vigueur et la case **Publier**.

Tout est facultatif : un champ vide s'affiche « à compléter ». Tant que « Publier » n'est pas
coché, les pages portent un bandeau « Brouillon » et les moteurs de recherche ne les
indexent pas. Le panel liste ce qui manque encore. Dans l'appli des clients, Réglages →
**Conditions et données personnelles** ouvre ces pages. Fichier : `/srv/recipelog/vente/vente.json`.

Le **dossier juridique** (ce que la loi française demande pour vendre en ligne à des pros,
les sanctions, les infos à rassembler, le registre des traitements à garder pour toi) est
dans le document [Dossier juridique RecipeLog](https://claude.ai/artifact/TCnM5CzR7Dh61uEESpwo4w).
Ce sont des brouillons sérieux, pas un avis d'avocat : à faire relire avant le premier client payant.

## Au quotidien (dans la VM, en root)

```bash
recipelog-instance liste                    # les clients et leur état
recipelog-instance creer chanka --responsable chef@patisserie.fr --max 10
                                            # nouveau client sur chanka.recipelog.cc (version « Standard », branche instance) :
                                            # le responsable reçoit son invitation et sera administrateur,
                                            # 10 comptes au plus (sans --max : pas de plafond)
recipelog-instance creer essai --canal beta-instance # suit la bêta (branche beta-instance)
recipelog-instance canal chanka beta-instance       # passer un client sur la bêta (instance pour revenir)
recipelog-instance equipe chanka            # qui peut se connecter, et les places
recipelog-instance inviter chanka a@b.fr    # inviter quelqu'un (l'appli le fait aussi : Réglages → Comptes)
recipelog-instance quota chanka 15          # changer le nombre de places (0 = pas de plafond)
recipelog-instance brancher-authentik test  # passer un client créé avant le lot 1 sur Authentik
recipelog-instance suspendre chanka         # pause (reactiver chanka pour rouvrir)
recipelog-instance essai chanka 14          # essai de 14 jours (0 = plus d'essai)
recipelog-instance options chanka --mcp non # couper l'accès MCP
recipelog-instance mettre-a-jour test       # un client
recipelog-instance mettre-a-jour --tous     # tous, l'un après l'autre, arrêt au premier échec
recipelog-instance journaux test            # journaux en direct
recipelog-instance supprimer test --oui     # supprime en gardant une archive (base + fichiers + sauvegardes)
recipelog-instance sauvegarder chanka       # sauvegarde maintenant (--tous : tous les clients)
recipelog-instance sauvegardes chanka       # la liste, et le dernier test
recipelog-instance restaurer chanka 20261114-030000 --oui
                                            # remet chanka à cette date (l'état actuel est sauvegardé avant)
recipelog-instance tester-sauvegarde chanka # recharge la dernière dans une base à part pour la vérifier
recipelog-instance exporter chanka 20261114-030000 > chanka.tar.gz
                                            # archive base + fichiers, sans mot de passe
recipelog-instance importer chanka /tmp/ancien.tar.gz --oui
                                            # remplace les données de chanka par l'archive
recipelog-instance inviter-comptes chanka   # invite les comptes actifs (après un import)
recipelog-instance creer demo --demo --sans-authentik   # la démo publique
recipelog-instance demo-figer demo          # son état actuel devient la référence
recipelog-instance demo-remettre demo       # retour à la référence (--toutes : toutes les démos)
recipelog-instance vitrine maj              # dernière version de la vitrine
recipelog-instance vitrine bandeau "Offre de lancement"   # "" pour l'enlever
recipelog-instance vitrine demandes         # messages reçus par le formulaire
recipelog-plateforme ps                     # état de Traefik, PostgreSQL, tunnel, Authentik, passerelle
```

Une mise à jour qui ne redémarre pas revient toute seule à la version précédente.

## Où sont les données

Tout est dans `/srv/recipelog` :

- `.env` : réglages et mots de passe (lisible seulement par root) ;
- `postgres/` : toutes les bases ;
- `instances/<nom>/` : réglages, mot de passe et fichiers envoyés de chaque client ;
- `sauvegardes/<nom>/` : les sauvegardes de chaque client (voir plus haut), et
  `reference/` pour une démo ;
- `vitrine/` : le code de la vitrine, ses réglages et les messages reçus ;
- `archives/` : clients supprimés, avec leurs sauvegardes.

La VM entière est copiée ailleurs par ta sauvegarde Proxmox Backup Server → OVH.

## Sécurité

- Aucun port ouvert vers l'extérieur : seuls le SSH depuis le réseau local et le
  tunnel sortant vers Cloudflare passent. Traefik n'écoute que sur `127.0.0.1:8080`.
- Traefik ne lit Docker qu'à travers un proxy qui n'autorise que la lecture des conteneurs.
- Chaque client a son propre utilisateur PostgreSQL, qui ne peut ouvrir que sa base.
- Limitation des abus : 30 requêtes par seconde par visiteur (pointes à 120).
- Connexion : Authentik ne laisse entrer sur un client que les membres de son groupe
  (`client-<nom>`) et les super-admins. Il n'y a pas d'inscription libre : seuls les comptes
  invités existent. La clé d'Authentik n'est que dans la passerelle ; chaque client a sa
  propre clé de passerelle, qui ne donne accès qu'à sa propre équipe.

## Journal du chantier

Une ligne par étape, la plus récente en haut. Le plan complet : 9 lots (socle, connexion,
panel, sauvegardes, déménagement, surveillance et support, maintenance et messages, IA et
prix, vente).

| Date | Lot | Ce qui a été fait | Ce qu'il te reste à faire |
|---|---|---|---|
| 2026-11-17 | Mises à jour | Le panel vérifie toutes les heures s'il y a une nouvelle version : clients par canal (Standard, Bêta : dès que l'image Docker est prête), plateforme et vitrine. Accueil → carte « Mises à jour » (état, ce qui a changé, bouton « Vérifier maintenant »), lignes dans « À faire », pastille sur Clients, filtre « À mettre à jour ». Un message (Telegram, Discord, email réglés pour les alertes) part une seule fois par nouvelle version, désactivable dans le panel. Rien ne s'installe tout seul, les clients ne voient rien. | Après la mise à jour de la plateforme : mettre la vitrine à jour une fois (sinon sa version reste « inconnue »). Facultatif : `GITHUB_JETON` (jeton GitHub lecture seule) dans `.env` si GitHub limite les demandes. |
| 2026-11-17 | Relance de l'installation | `bash /root/install-plateforme.sh` lançait la vieille copie du script gardée depuis la création de la VM : les corrections de l'installation elle-même (dont « ne plus recréer test ») ne s'appliquaient pas. Le script se remplace maintenant par la dernière version avant de continuer. | Une seule fois : lancer `bash /opt/recipelog-plateforme/plateforme/install.sh` (voir le fil). |
| 2026-11-17 | Import d'un site sous PostgreSQL 17 | Un ancien site installé sous Debian 13 a PostgreSQL 17 ; la plateforme a PostgreSQL 16, qui ne lit pas ses sauvegardes. L'import convertit maintenant tout seul la base (relue par un PostgreSQL 17 le temps de l'import, rechargée puis ressortie au format de la plateforme). Essayé avec une base 17 (types, index, clés, nombres, textes accentués) : tout revient à l'identique. | Relancer l'import (voir le fil). |
| 2026-11-17 | Branches instance / beta-instance | L'appli des clients vient maintenant de deux branches : `beta-instance` (la bêta, où se font tous les changements de l'appli) et `instance` (la version des clients). GitHub construit une image pour chacune (`:beta-instance`, `:instance`). Les nouveaux clients prennent `instance`. Choix Standard / Bêta à la création ; dans le panel, fiche du client → « Version de l'appli » → « Passer en bêta » / « Repasser en standard » (réglé par toi seul, le client ne le voit pas) (sauvegarde avant, retour arrière si ça rate) ; en ligne de commande `recipelog-instance canal <nom> <canal>`. | Étape I0 de [A-FAIRE.md](A-FAIRE.md) : mettre à jour la plateforme, puis passer chaque client en « Standard » ou en « Bêta ». |
| 2026-11-17 | Client « test » | Le client « test » n'est créé qu'à la toute première installation : relancer l'installation ne le recrée plus. | Rien. |
| 2026-11-17 | Correction applications Authentik | Authentik ne montre la liste des applications qu'à ceux qui peuvent les ouvrir, sauf demande « liste complète ». La plateforme ne voyait donc pas les applications existantes : relancer l'installation essayait de recréer celle du panel (refusé, « slug existe déjà »), et supprimer un client laissait son application derrière lui (impossible ensuite de recréer un client du même nom). Les recherches demandent maintenant la liste complète, et créer un client enlève d'abord les restes d'une ancienne suppression. Vérifié dans le code d'Authentik 2025.10.2. | VM déjà installée : relancer `bash /root/install-plateforme.sh` dans la VM (panel + client test). |
| 2026-11-17 | Fenêtres et aides du panel | Les fenêtres du panel prennent le style du kit encre : une feuille qui monte du bas sur téléphone (avec sa poignée), une fenêtre centrée et animée sur ordinateur, avec le titre et la croix sur une même ligne. Chaque « ? » ouvre maintenant une petite fenêtre d'aide (titre = le champ ou la page concernée), au lieu d'un texte qui s'affichait dans la page. Elle passe par-dessus une fenêtre déjà ouverte. Comme toutes les fenêtres, elle ne se ferme que par sa croix. | Rien. |
| 2026-11-17 | Nouveau panel admin | Le panel n'est plus une seule longue page. Menu à gauche sur ordinateur, barre d'onglets en verre qui flotte en bas sur téléphone (Accueil, Clients, Support, Plus), dans le design « encre ». **Accueil** : ce qui demande ton attention (demande de support sans réponse, site en panne, sauvegarde manquante ou ratée, essai qui finit ou fini, demande reçue sur la vitrine, disque presque plein, quota IA plein), les dernières actions et l'état de la machine. **Clients** : tableau compact, filtres (en essai, en pause, à regarder), un clic ouvre la **fiche du client** avec ses onglets Résumé, Équipe, Sauvegardes, Journaux, Réglages (et Démo) ; pause et suppression rangées dans une « Zone sensible ». Une page pour chaque autre sujet (support, maintenance, vitrine, tarifs, IA, santé, journal), avec des pastilles rouges quand quelque chose attend. **Apparence** : thème clair ou sombre et couleur d'accent, gardés sur l'appareil. Testé dans un navigateur avec un faux moteur (ordinateur et téléphone). | Mettre à jour la plateforme (étape I1 de [A-FAIRE.md](A-FAIRE.md)) pour voir le nouveau panel. |
| 2026-11-17 | Bouton « Mettre à jour la plateforme » | Accueil du panel, bloc **Plateforme** : version installée, nouveautés sur GitHub depuis cette version, et un bouton qui relance `install.sh` sur la machine (le moteur le confie à systemd hors de Docker, pour qu'il continue quand le panel et le moteur redémarrent). Une fenêtre suit le journal de l'installation, supporte la coupure du panel, et propose de recharger la page à la fin. `install.sh` écrit la version installée dans `/srv/recipelog/maj-plateforme/version.json` ; une mise à jour ne recrée pas le client `test`. Testé avec un faux moteur, pas encore sur la VM. | La première fois, mettre à jour à la main (étape I1 de [A-FAIRE.md](A-FAIRE.md)) ; ensuite, le bouton. |
| 2026-11-17 | Branche `instance` | Nouvelle branche `instance` (copie de `plateforme`) : l'atelier de l'application des clients. Ses changements entrent par PR dans `plateforme`, puis chez les clients avec « Mettre à jour » dans le panel. Expliqué en tête de la partie I de [A-FAIRE.md](A-FAIRE.md) et dans l'aide « ? » de « Tout mettre à jour ». | Rien. |
| 2026-11-17 | Pages de connexion aux couleurs de RecipeLog | `auth.recipelog.cc` prend le design « encre » de l'appli : fond encre avec un halo ambre (plus de photo de forêt), carte arrondie, toque + « Recipe*Log* » à la place du logo d'Authentik, polices de l'appli, bouton ambre, clair ou sombre comme l'appareil, icône d'onglet RecipeLog, plus de « Propulsé par authentik ». La page « Mes applications » (auth.recipelog.cc une fois connecté) suit le même style. Email et mot de passe sur le même écran. La connexion passe par un écran à nous (`recipelog-connexion`) : celui d'Authentik était réécrit à chaque redémarrage, ce qui faisait revenir « Welcome to authentik! » et « Courriel ou Nom d'utilisateur ». Un bouton Google déjà branché est recopié tout seul. Tout est dans le blueprint, donc gardé après une réinstallation. Essayé sur un vrai Authentik 2025.10.2 (connexion, erreur, mot de passe oublié, Google, téléphone, clair et sombre). | Mettre à jour la plateforme (A-FAIRE, I1). |
| 2026-11-17 | Correction branchement du panel sur Authentik | Au tout premier démarrage, Authentik crée ses portées de connexion (openid, email, profile) un peu après le reste ; l'installation les demandait trop tôt, Authentik répondait 400 et le panel n'était pas branché. L'installation attend maintenant qu'elles existent, et la recherche ne plante plus si l'une manque. Vérifié avec un faux Authentik qui les crée en retard, et dans le code d'Authentik 2025.10.2. | VM créée avant cette correction : relancer l'installation dans la VM (`bash /root/install-plateforme.sh`, sans danger). |
| 2026-11-17 | Correction création de la VM | `creer-vm.sh` s'arrêtait juste après « VM démarrée » : tant que la VM démarre, Proxmox ne peut pas encore lui parler, et le script prenait ça pour une erreur. Il attend maintenant, affiche bien chaque étape de l'installation (la dernière ligne vide cachait tout) et efface à la fin le fichier qui contient la clé SMTP. Vérifié avec un faux `qm` : l'ancien script s'arrête, le nouveau suit jusqu'au bout. | Si ta VM a été créée avant cette correction : suivre l'encadré de l'étape B1 dans [A-FAIRE.md](A-FAIRE.md) (suivi + effacer le fichier SMTP). |
| 2026-11-17 | Service PDF commun | Un seul Chromium pour tous les clients, dans le conteneur `recipelog-pdf` : chaque site lui envoie sa page prête et reçoit le PDF. Deux PDF à la fois, 30 en attente au plus, 2 minutes au plus chacun. Chaque demande s'ouvre dans une fenêtre neuve fermée juste après, le JavaScript des pages est coupé et elles ne peuvent rien charger sur le réseau (vérifié : 0 requête vers un faux serveur interne). Si le service ne répond pas, le site fait le PDF lui-même comme avant. Surveillé comme les autres services. Essayé avec une vraie recette (2 pages, en-tête, pied de page, numéros) et 6 PDF en même temps. L'image du service n'a pas pu être construite dans le bac à sable (dépôts Debian bloqués) : GitHub la construit à chaque PR. | Rien : la mise à jour de la plateforme l'ajoute, puis chaque client l'utilise après sa prochaine mise à jour. |
| 2026-11-17 | Corrections des relectures | Les problèmes des trois relectures sont corrigés. Les 4 bloquants : le panel n'accepte plus qu'un vrai cookie de session ; le canal par défaut est `plateforme` partout (seule image qui existe) ; Brevo est demandé dès la création de la VM et l'invitation repart tant que tu ne t'es jamais connecté ; l'export de l'ancien site compte les fichiers et s'arrête s'il en manque. Aussi : sauvegardes par copies liées (rapides, peu de place), comptes Authentik et réglages sauvegardés chaque nuit, retour arrière automatique avec la base d'avant quand une mise à jour rate, actions longues du panel suivies en direct (plus de coupure à 100 secondes), maintenance qui bloque vraiment les enregistrements, session renouvelée sans perdre son travail, lecture par IA en continu (longues mercuriales), champ Article modifiable, doublons évités, vérifications (types, tests) avant de publier l'image. Essayé dans Docker avec une fausse appli : création, sauvegarde, test, restauration, mise à jour, retour arrière, pause, essai, démo, import, suppression, panel. Pas essayé pour de vrai : Proxmox, Cloudflare, Brevo, Authentik, la vraie IA. | Suivre le tuto pas à pas ([A-FAIRE.md](A-FAIRE.md)) : la ligne DNS `*` (A2), Brevo demandé en B1, Cloudflare Access sur le panel (C3 bis), mises à jour (I). Tester une vraie facture et une vraie mercuriale avec l'IA (G3). |
| 2026-11-15 | 8. Vente | Pages publiques Tarifs, Mentions légales, CGV, Politique de confidentialité et Accord de sous-traitance (RGPD), remplies depuis le panel (partie « Vente ») : ton identité, les offres avec des prix d'exemple, l'essai, la TVA. Champs vides affichés « à compléter », bandeau « Brouillon » et pas d'indexation tant que tu ne publies pas. Lien « Conditions et données personnelles » dans les Réglages de l'appli. Dossier juridique (obligations, sanctions, sous-traitants, registre des traitements) dans un document à part. Testé dans un vrai navigateur, captures dans la PR. | Remplir tes infos et choisir tes prix dans le panel, faire relire les textes, puis publier : [A-FAIRE.md](A-FAIRE.md), étape H. |
| 2026-11-14 | 7. IA et prix | Lecture des factures par IA (photo ou PDF) avec vérification ligne par ligne avant d'enregistrer, fichier joint à la facture. Import des mercuriales : Excel et CSV lus sans IA (colonnes devinées puis corrigeables), PDF et photo par l'IA. Réglages de l'appli : IA de RecipeLog (ta clé, avec un nombre de lectures par mois) ou clé du client (Claude, ChatGPT ou Gemini). Panel : lectures et coût estimé de chaque client, quotas réglables. Testé dans un vrai navigateur avec une fausse API Claude (pas de vraie clé dans le bac à sable) ; ChatGPT et Gemini ne sont pas testés pour de vrai. Captures dans la PR. | Créer ta clé Anthropic et l'ajouter : [A-FAIRE.md](A-FAIRE.md), étape G. Puis lire une vraie facture Ribera pour vérifier. |
| 2026-11-14 | 6. Maintenance et messages | Maintenances programmées (tout le parc, un client ou la vitrine) avec bandeau et email de préavis, page « Petite pause technique » pendant la plage (les super-admins entrent quand même), réouverture automatique, affichage sur la page de statut. Emails aux équipes des clients avec modèles (incident, résolu, nouveautés), option bandeau, journal des envois. Bandeaux dans l'appli, fermables. Testé dans un vrai navigateur : préavis reçu par email, bandeaux, maintenance immédiate (chef bloqué, super-admin entre), fin et réouverture, vitrine en maintenance. Captures dans la PR. | Rien. |
| 2026-11-14 | 5. Surveillance et support | Vérification de chaque site et service chaque minute, alertes par email (et Telegram ou Discord si réglés) en cas de panne, de retour, de disque plein ou de nouvelle demande. Page de statut publique `status.recipelog.cc` (90 jours). Panel : partie Santé (machine et usage de chaque client), bouton Journaux en direct, partie Support (répondre, noter, fermer). Appli : Réglages → « Signaler un problème » avec la conversation et les réponses. Testé dans un vrai navigateur : demande envoyée, réponse reçue par email et dans l'appli, panne simulée détectée en 2 minutes puis retour, alerte d'essai. Captures dans la PR. | Facultatif : alertes sur ton téléphone par Telegram ou Discord, [A-FAIRE.md](A-FAIRE.md), étape F. |
| 2026-11-14 | 4. Déménagement | Outils pour passer ton site, la démo et la vitrine sur la plateforme : `exporter-ancien.sh` (lit l'ancien conteneur sans le toucher), `importer` (testé : recettes, photos, comptes et rôles gardés), `inviter-comptes`. Démo publique avec référence et remise à zéro chaque nuit ou en 1 clic. Vitrine servie par la plateforme (branche `site-vitrine` inchangée) : mise à jour en 1 clic, bandeau, demandes du formulaire transformées en client en 1 clic. Testé dans un vrai navigateur, captures dans la PR. | Le déménagement lui-même, quand tu veux : [A-FAIRE.md](A-FAIRE.md), étape E. |
| 2026-11-14 | 3. Sauvegardes | Chaque nuit à 3 h, sauvegarde de chaque client (base, photos et factures, réglages à part), gardée 7 jours, 4 semaines et 6 mois. Dans le panel, bouton « Sauvegardes » : sauvegarder maintenant, télécharger (sans mot de passe), restaurer en 1 clic (avec sauvegarde de l'état d'avant et retour automatique si ça rate), test de restauration chaque dimanche dans une base à part. Dernière sauvegarde affichée pour chaque client. Le moteur suit maintenant tout seul les mises à jour de `recipelog-instance`. Testé dans un vrai navigateur, captures dans la PR. | Vérifier que ta sauvegarde PBS → OVH inclut la nouvelle VM : [A-FAIRE.md](A-FAIRE.md), étape D1. |
| 2026-11-14 | 2. Panel | Panel admin sur `admin.recipelog.cc` (super-admins seulement, connexion Authentik) dans le thème encre : tableau des clients, création en 1 clic avec invitation du responsable, équipe, places, essais (pause automatique à la fin), accès MCP par client, mise à jour d'un client ou de tous, pause / réactivation, suppression avec archive, journal de tes actions. Page « Ce RecipeLog est en pause ». Le moteur (seul à piloter Docker) reste interne. Testé dans un vrai navigateur, captures dans la PR. | Rien de nouveau à créer : voir [A-FAIRE.md](A-FAIRE.md), étape C4. |
| 2026-11-14 | 1. Connexion | Authentik sur `auth.recipelog.cc` (connexion par email, mot de passe oublié, Google en option, double authentification), réglé tout seul et en français. La passerelle crée chaque client dans Authentik, invite par email (lien valable 3 jours) et compte les places. Dans l'appli : connexion et retour sur la page demandée, « Se déconnecter » (qui déconnecte vraiment, même sur une tablette partagée), Réglages → Comptes → « Inviter un collaborateur » et « Places utilisées », responsable administrateur à sa première connexion. `recipelog-instance creer --responsable … --max …`. Testé dans un vrai navigateur : invitation, choix du mot de passe, connexion, invitation depuis l'appli, plafond, refus d'un membre sur un autre client, super-admin caché, déconnexion. | Tout est dans [A-FAIRE.md](A-FAIRE.md) : compte Brevo pour les emails, Google si tu veux, puis installation et vérifications. |
| 2026-11-14 | 0. Socle | Branche `plateforme` créée depuis `main` (rien d'autre n'est touché). Image Docker de l'appli publiée en `:plateforme`, pile Traefik + PostgreSQL + proxy Docker + tunnel, scripts `creer-vm.sh`, `install.sh` et `recipelog-instance`. Testé dans Docker : client de test en ligne via Traefik, bases séparées entre clients. PR #149 vers `plateforme`. | Après la fusion : rendre l'image publique, créer le tunnel, lancer `creer-vm.sh`, protéger `test.recipelog.cc` avec Cloudflare Access (en attendant le lot 1). |
