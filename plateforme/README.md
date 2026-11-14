# Plateforme RecipeLog

> **Ce que tu dois faire toi-même :** [A-FAIRE.md](A-FAIRE.md), toutes les installations, dans l'ordre.
> **Où en est le chantier :** voir [Journal du chantier](#journal-du-chantier) en bas de cette page.
> Tout le travail se fait sur la branche `plateforme` et sur les branches `claude/…` qui y
> fusionnent. `main`, `stable` et les autres branches ne sont jamais modifiées par ce chantier.

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

Le panel n'a aucun accès à Docker : il passe par le **moteur**, joignable seulement sur le
réseau interne avec une clé. Le moteur lance `recipelog-instance`, comme en ligne de commande.

## Au quotidien (dans la VM, en root)

```bash
recipelog-instance liste                    # les clients et leur état
recipelog-instance creer chanka --responsable chef@patisserie.fr --max 10
                                            # nouveau client sur chanka.recipelog.cc (canal stable) :
                                            # le responsable reçoit son invitation et sera administrateur,
                                            # 10 comptes au plus (sans --max : pas de plafond)
recipelog-instance creer essai --canal beta # suit la bêta (main)
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
recipelog-plateforme ps                     # état de Traefik, PostgreSQL, tunnel, Authentik, passerelle
```

Une mise à jour qui ne redémarre pas revient toute seule à la version précédente.

## Où sont les données

Tout est dans `/srv/recipelog` :

- `.env` : réglages et mots de passe (lisible seulement par root) ;
- `postgres/` : toutes les bases ;
- `instances/<nom>/` : réglages, mot de passe et fichiers envoyés de chaque client ;
- `sauvegardes/<nom>/` : les sauvegardes de chaque client (voir plus haut) ;
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
| 2026-11-14 | 3. Sauvegardes | Chaque nuit à 3 h, sauvegarde de chaque client (base, photos et factures, réglages à part), gardée 7 jours, 4 semaines et 6 mois. Dans le panel, bouton « Sauvegardes » : sauvegarder maintenant, télécharger (sans mot de passe), restaurer en 1 clic (avec sauvegarde de l'état d'avant et retour automatique si ça rate), test de restauration chaque dimanche dans une base à part. Dernière sauvegarde affichée pour chaque client. Le moteur suit maintenant tout seul les mises à jour de `recipelog-instance`. Testé dans un vrai navigateur, captures dans la PR. | Vérifier que ta sauvegarde PBS → OVH inclut la nouvelle VM : [A-FAIRE.md](A-FAIRE.md), étape D1. |
| 2026-11-14 | 2. Panel | Panel admin sur `admin.recipelog.cc` (super-admins seulement, connexion Authentik) dans le thème encre : tableau des clients, création en 1 clic avec invitation du responsable, équipe, places, essais (pause automatique à la fin), accès MCP par client, mise à jour d'un client ou de tous, pause / réactivation, suppression avec archive, journal de tes actions. Page « Ce RecipeLog est en pause ». Le moteur (seul à piloter Docker) reste interne. Testé dans un vrai navigateur, captures dans la PR. | Rien de nouveau à créer : voir [A-FAIRE.md](A-FAIRE.md), étape C4. |
| 2026-11-14 | 1. Connexion | Authentik sur `auth.recipelog.cc` (connexion par email, mot de passe oublié, Google en option, double authentification), réglé tout seul et en français. La passerelle crée chaque client dans Authentik, invite par email (lien valable 3 jours) et compte les places. Dans l'appli : connexion et retour sur la page demandée, « Se déconnecter » (qui déconnecte vraiment, même sur une tablette partagée), Réglages → Comptes → « Inviter un collaborateur » et « Places utilisées », responsable administrateur à sa première connexion. `recipelog-instance creer --responsable … --max …`. Testé dans un vrai navigateur : invitation, choix du mot de passe, connexion, invitation depuis l'appli, plafond, refus d'un membre sur un autre client, super-admin caché, déconnexion. | Tout est dans [A-FAIRE.md](A-FAIRE.md) : compte Brevo pour les emails, Google si tu veux, puis installation et vérifications. |
| 2026-11-14 | 0. Socle | Branche `plateforme` créée depuis `main` (rien d'autre n'est touché). Image Docker de l'appli publiée en `:plateforme`, pile Traefik + PostgreSQL + proxy Docker + tunnel, scripts `creer-vm.sh`, `install.sh` et `recipelog-instance`. Testé dans Docker : client de test en ligne via Traefik, bases séparées entre clients. PR #149 vers `plateforme`. | Après la fusion : rendre l'image publique, créer le tunnel, lancer `creer-vm.sh`, protéger `test.recipelog.cc` avec Cloudflare Access (en attendant le lot 1). |
