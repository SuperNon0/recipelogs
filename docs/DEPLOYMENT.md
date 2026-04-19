# RecipeLog — Guide de déploiement complet

> Déploiement en production sur **Proxmox LXC**, accès via **Cloudflare Zero Trust**.

---

## Prérequis

| Élément | Détail |
|---|---|
| Hôte Proxmox | Version ≥ 7.x, accès SSH root |
| Template LXC | `debian-12-standard_12.7-1_amd64.tar.zst` (ou équivalent Debian 12) |
| DNS | Sous-domaine pointant vers le tunnel Cloudflare (ex. `recipe.super-nono.cc`) |
| Compte Cloudflare | Zero Trust activé + tunnel configuré |
| Accès dépôt | Git (SSH ou HTTPS) vers `github.com/supernon0/recipelogs` |

---

## Étape 1 — Préparer le template Proxmox

Sur l'hôte Proxmox (via SSH ou shell Proxmox) :

```bash
# Télécharger le template Debian 12 si absent
pveam update
pveam download local debian-12-standard_12.7-1_amd64.tar.zst

# Vérifier la présence du template
pveam list local | grep debian-12
```

---

## Étape 2 — Créer le container LXC

```bash
# Copier les scripts de déploiement sur l'hôte
scp -r deploy/proxmox/ root@<ip-proxmox>:/root/recipelog/

# Sur l'hôte Proxmox
cd /root/recipelog

# Usage : bash create-lxc.sh <VMID> <hostname>
bash create-lxc.sh 120 recipelog
```

Le script `create-lxc.sh` :
- Crée un container Debian 12 avec 2 CPU, 2 Go RAM, 20 Go disque
- Configure le réseau (DHCP par défaut, modifiable dans le script)
- Démarre le container

### Personnalisation réseau (optionnel)

Éditer `create-lxc.sh` avant l'exécution pour fixer l'IP :

```bash
# Remplacer la ligne ip=dhcp par :
ip=192.168.1.XXX/24,gw=192.168.1.1
```

---

## Étape 3 — Installer l'application

Entrer dans le container et lancer le script d'installation :

```bash
# Accéder au container (depuis l'hôte Proxmox)
pct enter 120

# Dans le container — copier setup.sh puis lancer
# (ou pipe directement si SSH configuré)
bash /root/setup.sh
```

Le script `setup.sh` (~5-10 min) :
1. Met à jour Debian 12
2. Installe Node.js 22, pnpm, PostgreSQL 16, Chromium, nginx
3. Clone le dépôt dans `/opt/recipelog`
4. Crée l'utilisateur PostgreSQL + la base de données
5. Génère le fichier `.env` avec `DATABASE_URL` et `NEXTAUTH_SECRET`
6. Lance `pnpm install` + `pnpm build` (mode standalone)
7. Installe le service systemd `recipelog`
8. Configure nginx en reverse proxy sur le port 3000
9. Configure UFW (ports 22, 80, 443)

### Variables à configurer dans `.env`

Après `setup.sh`, éditer `/opt/recipelog/.env` :

```bash
nano /opt/recipelog/.env
```

| Variable | Valeur à renseigner |
|---|---|
| `DATABASE_URL` | Déjà configurée par setup.sh |
| `NEXTAUTH_SECRET` | Déjà généré (32 bytes aléatoires) |
| `NEXT_PUBLIC_APP_URL` | `https://recipe.super-nono.cc` (votre domaine) |

Après modification :

```bash
systemctl restart recipelog
```

---

## Étape 4 — Vérifier l'installation

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

## Étape 5 — Configurer Cloudflare Zero Trust

### 5.1 Créer un tunnel Cloudflare

Dans le dashboard Cloudflare Zero Trust :

1. **Networks → Tunnels → Create a tunnel**
2. Choisir **Cloudflared**
3. Nommer le tunnel : `recipelog`
4. Copier la commande d'installation générée, ex. :
   ```bash
   cloudflared service install <TOKEN>
   ```

### 5.2 Installer cloudflared dans le container

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

### 5.3 Configurer la route publique

Dans le dashboard Cloudflare Zero Trust :

1. **Networks → Tunnels → recipelog → Edit**
2. **Public Hostnames → Add a public hostname**
   - Subdomain : `recipe`
   - Domain : `super-nono.cc`
   - Type : `HTTP`
   - URL : `localhost:80`
3. Sauvegarder

### 5.4 Configurer Access (accès privé)

1. **Access → Applications → Add an application → Self-hosted**
2. Application name : `RecipeLog`
3. Application domain : `recipe.super-nono.cc`
4. Configurer la politique d'accès (ex. : email autorisé, OTP)

---

## Étape 6 — Premier accès

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
# Depuis l'hôte Proxmox ou directement dans le container
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
# Voir les erreurs détaillées
journalctl -u recipelog -n 100 --no-pager

# Causes fréquentes :
# 1. DATABASE_URL incorrect → vérifier /opt/recipelog/.env
# 2. Port 3000 déjà utilisé → lsof -i :3000
# 3. Erreur de build → relancer pnpm build
```

### nginx retourne 502 Bad Gateway

```bash
# Vérifier que recipelog tourne sur le bon port
curl http://localhost:3000

# Vérifier la config nginx
cat /etc/nginx/sites-available/recipelog
nginx -t

# Redémarrer les deux services
systemctl restart recipelog nginx
```

### Erreur de connexion PostgreSQL

```bash
# Tester la connexion
psql -U recipelog -d recipelog -c "SELECT version();"

# Vérifier que PostgreSQL tourne
systemctl status postgresql

# Réinitialiser le mot de passe si nécessaire
sudo -u postgres psql -c "ALTER USER recipelog WITH PASSWORD 'recipelog';"
```

### PDF ne se génère pas (erreur Puppeteer)

```bash
# Vérifier que Chromium est installé
which chromium || which chromium-browser

# Tester Chromium en mode headless
chromium --headless --dump-dom https://example.com 2>&1 | head -5

# Variable d'environnement dans .env
grep PUPPETEER /opt/recipelog/.env
# Doit contenir : PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
```

### Rollback vers la version précédente

```bash
cd /opt/recipelog

# Voir les commits disponibles
git log --oneline -10

# Revenir au commit précédent
git checkout <COMMIT_HASH>
pnpm install --frozen-lockfile
pnpm build
systemctl restart recipelog

# Pour revenir à main plus tard
git checkout main
```

---

## Ports et services

| Service | Port | Accès |
|---|---|---|
| recipelog (Next.js) | 3000 | interne uniquement |
| nginx | 80 | LAN (→ cloudflared) |
| PostgreSQL | 5432 | localhost uniquement |
| cloudflared tunnel | — | sortant vers Cloudflare |

---

## Structure des fichiers de déploiement

```
deploy/
├── proxmox/
│   ├── create-lxc.sh     # Crée le container LXC
│   ├── setup.sh          # Installation complète dans le container
│   ├── deploy.sh         # Mise à jour de l'application
│   ├── backup.sh         # Sauvegarde PostgreSQL (rétention 30j)
│   └── collect-logs.sh   # Collecte de logs pour debug
├── recipelog.service     # Unité systemd
└── nginx.conf            # Configuration reverse proxy
```
