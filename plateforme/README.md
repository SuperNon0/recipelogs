# Plateforme RecipeLog

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
| `docker-compose.yml` | Traefik (l'aiguilleur), PostgreSQL, l'accès Docker limité, le tunnel Cloudflare |
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

### 4. Protéger le client de test

Tant que la connexion par Authentik (lot 1) n'existe pas, un client tout neuf est
ouvert à qui connaît son adresse. Dans **Zero Trust → Access → Applications**, ajouter
`test.recipelog.cc` avec ta règle habituelle (ton email). **Ne pas** protéger
`*.recipelog.cc` en entier : la démo et la vitrine seraient bloquées.

## Au quotidien (dans la VM, en root)

```bash
recipelog-instance liste                    # les clients et leur état
recipelog-instance creer chanka             # nouveau client sur chanka.recipelog.cc (canal stable)
recipelog-instance creer essai --canal beta # suit la bêta (main)
recipelog-instance creer essai2 --canal plateforme # suit la branche du chantier
recipelog-instance mettre-a-jour test       # un client
recipelog-instance mettre-a-jour --tous     # tous, l'un après l'autre, arrêt au premier échec
recipelog-instance journaux test            # journaux en direct
recipelog-instance supprimer test --oui     # supprime en gardant une archive (base + fichiers)
recipelog-plateforme ps                     # état de Traefik, PostgreSQL, tunnel
```

Une mise à jour qui ne redémarre pas revient toute seule à la version précédente.

## Où sont les données

Tout est dans `/srv/recipelog` :

- `.env` : réglages et mots de passe (lisible seulement par root) ;
- `postgres/` : toutes les bases ;
- `instances/<nom>/` : réglages, mot de passe et fichiers envoyés de chaque client ;
- `archives/` : clients supprimés.

Les sauvegardes automatiques de ce dossier arrivent au lot 3.

## Sécurité

- Aucun port ouvert vers l'extérieur : seuls le SSH depuis le réseau local et le
  tunnel sortant vers Cloudflare passent. Traefik n'écoute que sur `127.0.0.1:8080`.
- Traefik ne lit Docker qu'à travers un proxy qui n'autorise que la lecture des conteneurs.
- Chaque client a son propre utilisateur PostgreSQL, qui ne peut ouvrir que sa base.
- Limitation des abus : 30 requêtes par seconde par visiteur (pointes à 120).

## Journal du chantier

Une ligne par étape, la plus récente en haut. Le plan complet : 9 lots (socle, connexion,
panel, sauvegardes, déménagement, surveillance et support, maintenance et messages, IA et
prix, vente).

| Date | Lot | Ce qui a été fait | Ce qu'il te reste à faire |
|---|---|---|---|
| 2026-11-14 | 0. Socle | Branche `plateforme` créée depuis `main` (rien d'autre n'est touché). Image Docker de l'appli publiée en `:plateforme`, pile Traefik + PostgreSQL + proxy Docker + tunnel, scripts `creer-vm.sh`, `install.sh` et `recipelog-instance`. Testé dans Docker : client de test en ligne via Traefik, bases séparées entre clients. PR #149 vers `plateforme`. | Après la fusion : rendre l'image publique, créer le tunnel, lancer `creer-vm.sh`, protéger `test.recipelog.cc` (étapes 1 à 4 ci-dessus). |
