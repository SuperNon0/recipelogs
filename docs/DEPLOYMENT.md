# RecipeLog — Guide de déploiement complet

> Déploiement en production sur **Proxmox LXC**, accès via **Cloudflare Zero Trust**.

---

## Prérequis

| Élément | Détail |
|---|---|
| Hôte Proxmox | Version ≥ 7.x, accès shell root (SSH ou console web) |
| DNS | Sous-domaine pointant vers le tunnel Cloudflare (ex. `recipe.super-nono.cc`) |
| Compte Cloudflare | Zero Trust activé + tunnel configuré |

---

## Étape 1 — Créer le container LXC (community-scripts)

> Les [Proxmox VE Helper Scripts](https://community-scripts.github.io/ProxmoxVE/) gèrent automatiquement le téléchargement du template, la création et la configuration du container.

Dans le **shell de l'hôte Proxmox** (SSH ou console Proxmox) :

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/ct/debian.sh)"
```

Le script pose des questions interactives. Choisir :

| Question | Valeur recommandée |
|---|---|
| Type de container | Unprivileged |
| Distribution | Debian 12 |
| RAM | **2048** Mo |
| Swap | 512 Mo |
| Disque | **20** Go |
| CPU | **2** cores |
| Hostname | `recipelog` |
| Réseau | DHCP ou IP fixe de ton choix |

### Activer Nesting (obligatoire pour Chromium/PDF)

Après la création, **dans l'interface Proxmox** :

1. Sélectionner le container → **Options → Features**
2. Cocher **Nesting** → OK
3. Redémarrer le container si déjà démarré

Ou en ligne de commande sur l'hôte (remplacer `120` par le VMID attribué) :

```bash
pct set 120 --features nesting=1
pct reboot 120
```

---

## Étape 2 — Installer l'application

Entrer dans le container :

```bash
# Depuis l'hôte Proxmox (remplacer 120 par le VMID)
pct enter 120
```

Puis dans le container, lancer le script d'installation en une seule commande :

```bash
apt-get install -y curl git && \
curl -fsSL https://raw.githubusercontent.com/SuperNon0/recipelogs/main/deploy/proxmox/setup.sh | bash
```

Le script `setup.sh` (~5-10 min) installe et configure automatiquement :
1. Node.js 22, pnpm, PostgreSQL 16, Chromium, nginx
2. Clone du dépôt dans `/opt/recipelog`
3. Utilisateur PostgreSQL + base de données + extension `pg_trgm`
4. Fichier `.env` avec `DATABASE_URL` et `NEXTAUTH_SECRET` générés aléatoirement
5. `pnpm install` + migrations Prisma + `pnpm build`
6. Service systemd `recipelog` + nginx reverse proxy + UFW

À la fin, le script affiche l'IP du container et les commandes utiles.

### Configurer le domaine dans `.env`

```bash
nano /opt/recipelog/.env
```

Modifier la ligne :
```
NEXTAUTH_URL="https://recipe.super-nono.cc"   # ← ton vrai domaine
```

```bash
systemctl restart recipelog
```

---

## Étape 3 — Vérifier l'installation

```bash
# Statut du service
systemctl status recipelog

# Logs en temps réel
journalctl -u recipelog -f

# Test local (dans le container)
curl -s http://localhost:3000 | head -5

# Vérifier PostgreSQL
systemctl status postgresql
psql -U recipelog -d recipelog -c "\dt"

# Vérifier nginx
nginx -t
systemctl status nginx
```

Sortie attendue pour `systemctl status recipelog` :

```
● recipelog.service - RecipeLog
     Loaded: loaded (/etc/systemd/system/recipelog.service; enabled)
     Active: active (running)
```

---

## Étape 4 — Configurer Cloudflare Zero Trust

### 4.1 Créer un tunnel Cloudflare

Dans le dashboard Cloudflare Zero Trust :

1. **Networks → Tunnels → Create a tunnel**
2. Choisir **Cloudflared**
3. Nommer le tunnel : `recipelog`
4. Copier la commande d'installation générée, ex. :
   ```bash
   cloudflared service install <TOKEN>
   ```

### 4.2 Installer cloudflared dans le container

```bash
# Dans le container LXC
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb \
  -o /tmp/cloudflared.deb
dpkg -i /tmp/cloudflared.deb

# Installer le service avec votre token
cloudflared service install <TOKEN_DEPUIS_CLOUDFLARE>
systemctl enable cloudflared
systemctl start cloudflared
```

### 4.3 Configurer la route publique

Dans le dashboard Cloudflare Zero Trust :

1. **Networks → Tunnels → recipelog → Edit**
2. **Public Hostnames → Add a public hostname**
   - Subdomain : `recipe`
   - Domain : `super-nono.cc`
   - Type : `HTTP`
   - URL : `localhost:80`
3. Sauvegarder

### 4.4 Configurer Access (accès privé)

1. **Access → Applications → Add an application → Self-hosted**
2. Application name : `RecipeLog`
3. Application domain : `recipe.super-nono.cc`
4. Configurer la politique d'accès (ex. : email autorisé, OTP)

---

## Étape 5 — Premier accès

1. Ouvrir `https://recipe.super-nono.cc` dans le navigateur
2. L'authentification Cloudflare ZT s'affiche (OTP / email)
3. Après connexion : l'application est accessible

### Import des recettes Recipe Keeper

1. Aller dans **Paramètres → Import Recipe Keeper**
2. Dans Recipe Keeper (iOS/macOS) : **Export → CSV**
3. Sélectionner le fichier `.csv` exporté
4. Cliquer **Importer**

---

## Maintenance

### Mettre à jour l'application

```bash
# Depuis l'hôte Proxmox (remplacer 120 par le VMID)
pct exec 120 -- bash /opt/recipelog/deploy/proxmox/deploy.sh
```

Le script `deploy.sh` :
- `git pull` sur la branche main
- `pnpm install --frozen-lockfile`
- `pnpm db:migrate` (migrations Prisma)
- `pnpm build`
- `systemctl restart recipelog`

### Sauvegardes automatiques

Configurer le cron dans le container :

```bash
crontab -e
# Ajouter :
0 3 * * * /opt/recipelog/deploy/proxmox/backup.sh >> /var/log/recipelog-backup.log 2>&1
```

Les sauvegardes sont stockées dans `/var/backups/recipelog/` avec rétention 30 jours.

### Backup manuel

```bash
bash /opt/recipelog/deploy/proxmox/backup.sh
ls -lh /var/backups/recipelog/
```

---

## Collecte de logs pour le support

En cas de problème, générer un rapport de logs complet :

```bash
bash /opt/recipelog/deploy/proxmox/collect-logs.sh
```

Cela crée un fichier `recipelog-logs-YYYYMMDD-HHMMSS.tar.gz` dans `/tmp/` contenant :
- Statut et logs systemd (`recipelog`, `nginx`, `postgresql`)
- Logs nginx (error + access)
- Logs PostgreSQL
- Informations système (OS, Node, pnpm, Chromium)
- Dernier commit git déployé

Transmettre ce fichier pour analyse.

---

## Dépannage

### Le service ne démarre pas

```bash
journalctl -u recipelog -n 100 --no-pager

# Causes fréquentes :
# 1. DATABASE_URL incorrect → vérifier /opt/recipelog/.env
# 2. Port 3000 déjà utilisé → lsof -i :3000
# 3. Erreur de build → cd /opt/recipelog && pnpm build
```

### nginx retourne 502 Bad Gateway

```bash
curl http://localhost:3000          # recipelog répond ?
nginx -t                            # config valide ?
systemctl restart recipelog nginx
```

### Erreur de connexion PostgreSQL

```bash
psql -U recipelog -d recipelog -c "SELECT version();"
systemctl status postgresql

# Réinitialiser le mot de passe si nécessaire
sudo -u postgres psql -c "ALTER USER recipelog WITH PASSWORD 'recipelog';"
```

### PDF ne se génère pas (erreur Puppeteer)

```bash
which chromium                          # doit retourner /usr/bin/chromium
grep PUPPETEER /opt/recipelog/.env      # doit contenir PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Si Nesting n'était pas activé → l'activer et redémarrer le container
```

### Rollback vers la version précédente

```bash
cd /opt/recipelog
git log --oneline -10
git checkout <COMMIT_HASH>
pnpm install --frozen-lockfile
pnpm build
systemctl restart recipelog

# Revenir à main plus tard
git checkout main
```

---

## Ports et services

| Service | Port | Accès |
|---|---|---|
| recipelog (Next.js) | 3000 | localhost uniquement |
| nginx | 80 | LAN (→ cloudflared) |
| PostgreSQL | 5432 | localhost uniquement |
| cloudflared tunnel | — | sortant vers Cloudflare |

---

## Structure des fichiers de déploiement

```
deploy/
├── proxmox/
│   ├── setup.sh          # Installation complète dans le container
│   ├── deploy.sh         # Mise à jour de l'application
│   ├── backup.sh         # Sauvegarde PostgreSQL (rétention 30j)
│   └── collect-logs.sh   # Collecte de logs pour debug
├── recipelog.service     # Unité systemd
└── nginx.conf            # Configuration reverse proxy
```
