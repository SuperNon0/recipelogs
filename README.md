# RecipeLog — site vitrine et démo

Ce guide explique tout : créer le site vitrine, le relier à la démo, le mettre à jour, et régler
Cloudflare. Le site vitrine s'adresse aux professionnels (B2B) : RecipeLog y est présenté en
location mensuelle, sans parler de l'hébergement technique.

## Sommaire

1. [Les trois branches](#1-les-trois-branches)
2. [Ce qui est installé](#2-ce-qui-est-installé)
3. [Préparer le nom de domaine et Cloudflare](#3-préparer-le-nom-de-domaine-et-cloudflare)
4. [Créer le site vitrine](#4-créer-le-site-vitrine)
5. [Relier la vitrine à la démo et au contact](#5-relier-la-vitrine-à-la-démo-et-au-contact)
6. [Mettre les recettes de démo](#6-mettre-les-recettes-de-démo)
7. [Mettre à jour le site vitrine](#7-mettre-à-jour-le-site-vitrine)
8. [Mettre à jour la démo](#8-mettre-à-jour-la-démo)
9. [Cloudflare Access : ce qui est public, ce qui est protégé](#9-cloudflare-access--ce-qui-est-public-ce-qui-est-protégé)
10. [Commandes utiles et dépannage](#10-commandes-utiles-et-dépannage)
11. [Modifier le site vitrine](#11-modifier-le-site-vitrine)

---

## 1. Les trois branches

| Branche | Rôle |
|---|---|
| `main` | la **bêta** de RecipeLog : ton site à toi, toutes les nouveautés y arrivent d'abord |
| `stable` | RecipeLog **validé** : les sites des clients et la démo |
| `site-vitrine` | le **site vitrine seul** (cette branche) |

Elles ne se mélangent jamais. La branche `site-vitrine` ne contient que la vitrine et ses scripts,
pas le code de RecipeLog. La commande d'installation et la commande de mise à jour de la vitrine
ne lisent que cette branche.

```
site/                   le site (HTML, CSS, JS, sans compilation)
install.sh              création de la vitrine et de la démo, en une ligne
mise-a-jour.sh          mise à jour de la vitrine, de la démo, ou des deux
scripts/                scripts copiés dans les conteneurs
```

## 2. Ce qui est installé

La commande crée **un seul conteneur LXC** sur Proxmox (pas de machine virtuelle),
`recipelog-vitrine`, qui contient tout :

| Dans le conteneur | Adresse interne | Adresse publique |
|---|---|---|
| le site vitrine (branche `site-vitrine`), servi par nginx | `localhost:8080` | `recipelog.fr` |
| la démo : un RecipeLog classique (branche `stable`) en **mode démo** | `localhost:80` | `demo.recipelog.fr` |
| un tunnel Cloudflare pour les deux adresses | | |

La vitrine est **reliée toute seule** à la démo : avec le domaine `recipelog.fr`, les boutons
« Essayer la démo » ouvrent `https://demo.recipelog.fr`.

Ton site RecipeLog actuel n'est pas touché : il reste dans son conteneur, sur `main`, avec sa
protection Cloudflare.

## 3. Préparer le nom de domaine et Cloudflare

À faire **une seule fois, avant l'installation**. Exemple avec le domaine `recipelog.fr`.

**a. Mettre le domaine sur Cloudflare**
- Le plus simple : l'acheter directement chez Cloudflare (Domain Registration). Il n'y a rien
  d'autre à faire.
- S'il est acheté ailleurs : dans Cloudflare, « Add a domain », puis chez le vendeur, remplacer
  les serveurs DNS par les deux que Cloudflare indique. Attendre que Cloudflare affiche « Active ».

**b. Créer un tunnel**

Dans Cloudflare Zero Trust → Networks → Tunnels → « Create a tunnel » (type Cloudflared), nommé
par exemple `vitrine`. Cloudflare affiche une commande d'installation : copie seulement le
**jeton**, la longue suite de caractères après `--token`. La commande d'installation le demandera.
Pas besoin de lancer la commande de Cloudflare, l'installation s'en charge.

**c. Donner les adresses au tunnel** (onglet « Public Hostname », trois lignes) :

| Adresse | Service |
|---|---|
| `recipelog.fr` | `HTTP` → `localhost:8080` (vitrine) |
| `www.recipelog.fr` | `HTTP` → `localhost:8080` (vitrine) |
| `demo.recipelog.fr` | `HTTP` → `localhost:80` (démo) |

**Variante : le tunnel dans son propre conteneur.** Si tu préfères un petit conteneur qui ne
fait que le tunnel :

1. Crée le tunnel dans Cloudflare (étape b) et copie le jeton.
2. Dans le shell de l'hôte Proxmox, crée le conteneur du tunnel (il demande le jeton) :
   ```bash
   bash -c "$(curl -fsSL https://raw.githubusercontent.com/SuperNon0/recipelogs/site-vitrine/tunnel.sh)"
   ```
3. Lance l'installation de la vitrine (partie 4) en laissant **vide** la question du jeton.
4. Le résumé de fin affiche l'adresse du conteneur vitrine (ex. `192.168.1.50`). Dans le tunnel,
   mets alors ces trois lignes à la place de celles de l'étape c :

| Adresse | Service |
|---|---|
| `recipelog.fr` | `HTTP` → `192.168.1.50:8080` (vitrine) |
| `www.recipelog.fr` | `HTTP` → `192.168.1.50:8080` (vitrine) |
| `demo.recipelog.fr` | `HTTP` → `192.168.1.50:8081` (démo) |

Pour la démo c'est bien **8081** et non 80 : RecipeLog n'écoute sur le port 80 qu'à l'intérieur
de son conteneur, le 8081 sert de porte d'entrée depuis le réseau. Fixe l'adresse du conteneur
vitrine (réservation DHCP dans ta box) pour qu'elle ne change pas.

**d. Ne pas créer d'application Access pour ce domaine.** La vitrine et la démo sont publiques
(voir la [partie 9](#9-cloudflare-access--ce-qui-est-public-ce-qui-est-protégé)).

## 4. Créer le site vitrine

Dans Proxmox, ouvre le **shell de l'hôte** (le nœud, pas un conteneur), et colle :

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/SuperNon0/recipelogs/site-vitrine/install.sh)"
```

La commande pose trois questions. Pour en passer une, appuie sur Entrée : tout se règle aussi plus tard.

| Question | Exemple de réponse |
|---|---|
| Domaine du site vitrine | `recipelog.fr` |
| E-mail de contact affiché sur la vitrine | `contact@recipelog.fr` |
| Jeton du tunnel Cloudflare | le jeton du tunnel |

L'installation de RecipeLog prend plusieurs minutes. À la fin, un **résumé** s'affiche avec le
numéro du conteneur et les adresses à mettre dans Cloudflare. Il est aussi gardé sur l'hôte, dans
`/root/recipelog-vitrine.txt`. Pour le relire : `cat /root/recipelog-vitrine.txt`.

Après quelques minutes, `https://recipelog.fr` affiche la vitrine et `https://demo.recipelog.fr`
affiche la démo.

## 5. Changer l'adresse de la démo ou l'e-mail de contact

Avec un domaine donné à l'installation, c'est déjà fait. Pour changer plus tard, tape dans le
shell de l'hôte Proxmox (remplace `120` par le numéro du conteneur `recipelog-vitrine`) :

```bash
pct exec 120 -- vitrine-reglage demo https://demo.recipelog.fr
pct exec 120 -- vitrine-reglage contact contact@recipelog.fr
pct exec 120 -- vitrine-reglage            # affiche les réglages actuels
```

- **demo** : tous les boutons « Essayer la démo » et « Ouvrir la démo » ouvrent cette adresse.
- **contact** : l'adresse affichée en bas de la page et dans la fenêtre « Nous écrire ».

**Le formulaire « Nous écrire »** : les boutons « Nous écrire », « Demander une démo » et
« Demander un devis » ouvrent une fenêtre où le visiteur laisse son nom, son établissement, son
e-mail, son téléphone et un message. Tu reçois le message **par e-mail** : il suffit de répondre
à cet e-mail pour écrire au visiteur. Pour que l'envoi marche, règle une fois le compte qui envoie :

1. Sur ton compte Google : Sécurité → validation en deux étapes activée, puis
   « Mots de passe des applications » ([myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)).
   Crée-en un nommé « Vitrine RecipeLog » et copie les 16 lettres.
2. Dans le shell de l'hôte Proxmox :
   ```bash
   pct exec 120 -- /usr/local/sbin/vitrine-reglage email
   ```
   Réponds aux questions (Entrée garde smtp.gmail.com et le port 587) : ton adresse Gmail, les
   16 lettres, puis l'adresse où recevoir les messages. Un e-mail de test part tout de suite.

Autres commandes : `vitrine-reglage test-mail` (renvoie un test), `vitrine-reglage messages`
(les 20 derniers messages). Chaque message est aussi gardé dans le conteneur
(`/var/lib/recipelog-vitrine/messages.jsonl`), même si l'envoi échoue. Un même visiteur ne peut
pas envoyer plus de 5 messages en 10 minutes, et un champ caché écarte les robots.

Ces réglages sont gardés dans le conteneur (`/etc/recipelog-vitrine/`) : les mises à jour ne les
effacent pas. Le changement se voit tout de suite, sans redémarrer quoi que ce soit.

## 6. Mettre les recettes de démo

La démo est remise à zéro **chaque nuit à 4 h 30**. Elle revient alors à l'état que tu as « figé ».

1. Ouvre la démo (`https://demo.recipelog.fr`) et ajoute tes 2-3 recettes de démonstration,
   avec leurs ingrédients, leurs prix et leurs allergènes, pour que les visiteurs voient le coût
   de revient et la marge.
2. Fige-les, dans le shell de l'hôte Proxmox (remplace `120` par le numéro du conteneur
   `recipelog-vitrine`) :
   ```bash
   pct exec 120 -- recipelog-demo-figer
   ```
3. C'est tout. Chaque nuit, les changements des visiteurs disparaissent et tes recettes reviennent.

Pour changer les recettes de démo, recommence les étapes 1 et 2. Pour remettre la démo à zéro
tout de suite : `pct exec 120 -- recipelog-demo-reset`.

**Ce que le mode démo coupe** (`RECIPELOG_DEMO=1` dans `/opt/recipelog/.env` du conteneur) : un
bandeau « Site de démonstration » s'affiche, et personne ne peut activer les comptes, créer une
clé Claude (MCP) ni lancer la mise à jour du site. Tout le reste est utilisable.

## 7. Mettre à jour le site vitrine

Les changements de la vitrine se font sur la branche `site-vitrine` (par une PR vers cette
branche). Une fois la PR fusionnée, dans le shell de l'hôte Proxmox :

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/SuperNon0/recipelogs/site-vitrine/mise-a-jour.sh)"
```

La commande retrouve toute seule le conteneur `recipelog-vitrine`, télécharge la dernière version
de la branche `site-vitrine` et recharge le site. Elle affiche « déjà à jour » s'il n'y a rien de
nouveau. Il n'y a pas de bouton de mise à jour sur la vitrine.

## 8. Mettre à jour la démo

La démo suit la branche `stable` de RecipeLog. Quand tu as passé des nouveautés sur `stable`, tu
choisis ce que tu mets à jour :

| Mettre à jour | Commande (shell de l'hôte Proxmox) |
|---|---|
| la vitrine seule | `bash -c "$(curl -fsSL https://raw.githubusercontent.com/SuperNon0/recipelogs/site-vitrine/mise-a-jour.sh)"` |
| la démo seule | `bash -c "$(curl -fsSL https://raw.githubusercontent.com/SuperNon0/recipelogs/site-vitrine/mise-a-jour.sh)" _ --demo-seulement` |
| les deux | `bash -c "$(curl -fsSL https://raw.githubusercontent.com/SuperNon0/recipelogs/site-vitrine/mise-a-jour.sh)" _ --demo` |

La mise à jour de la démo installe la dernière version de `stable` et ses scripts de remise à
zéro. Les recettes figées restent valables : après chaque remise à zéro, les changements de la
base de données apportés par la mise à jour sont appliqués.

## 9. Cloudflare Access : ce qui est public, ce qui est protégé

Cloudflare Access protège **par adresse**, pas par compte entier.

| Adresse | Protection |
|---|---|
| ton site RecipeLog (ex. `recipe.super-nono.cc`) | Access, comme aujourd'hui : rien ne change |
| `recipelog.fr`, `www.recipelog.fr` (vitrine) | public, pas d'Access |
| `demo.recipelog.fr` (démo) | public, pas d'Access |

- Comme le nouveau domaine n'a aucune application Access, la vitrine et la démo sont publiques.
- **Piège** : une application Access sur `*.ton-domaine` (avec l'étoile) couvre toutes les
  adresses de ce domaine. Dans ce cas, ajoute-lui une règle **Bypass → Everyone** pour les
  adresses de la vitrine et de la démo.
- Même publiques, les deux adresses restent protégées par Cloudflare contre les attaques. La démo
  tourne dans un conteneur séparé du tien, avec sa propre base : un visiteur ne peut jamais
  atteindre tes recettes.

## 10. Commandes utiles et dépannage

Toutes ces commandes se tapent dans le shell de l'hôte Proxmox. Remplace `120` par le numéro du
conteneur `recipelog-vitrine` (voir `pct list` ou `/root/recipelog-vitrine.txt`).

| Besoin | Commande |
|---|---|
| Voir les conteneurs | `pct list` |
| Relire le résumé de l'installation | `cat /root/recipelog-vitrine.txt` |
| Réglages de la vitrine | `pct exec 120 -- vitrine-reglage` |
| La vitrine répond-elle ? | `pct exec 120 -- curl -sI http://localhost:8080` |
| La démo répond-elle ? | `pct exec 120 -- curl -sI http://localhost` |
| État du tunnel | `pct exec 120 -- systemctl status cloudflared` |
| Ajouter le tunnel plus tard | `pct exec 120 -- env VITRINE_TUNNEL_TOKEN=<jeton> bash /opt/vitrine/scripts/vitrine-setup.sh` |
| État du site de la démo | `pct exec 120 -- systemctl status recipelog` |
| Prochaine remise à zéro | `pct exec 120 -- systemctl list-timers recipelog-demo-reset.timer` |
| Journal des remises à zéro | `pct exec 120 -- journalctl -u recipelog-demo-reset -n 30` |

**La vitrine s'affiche, mais « Essayer la démo » ne fait rien** : l'adresse de la démo n'est pas
réglée (partie 5).

**La démo demande de se connecter** : une application Access couvre son adresse (partie 9).

**« Erreur 1033 » de Cloudflare** : le tunnel ne tourne pas dans le conteneur. Vérifie son état
ou installe-le avec son jeton (tableau ci-dessus).

**« Erreur 502 » sur la vitrine** : dans Cloudflare, l'adresse de la vitrine doit pointer vers
`localhost:8080` (et celle de la démo vers `localhost:80`).

## 11. Modifier le site vitrine

Le site est dans `site/` : `index.html` (textes), `style.css` (apparence), `app.js` (animations,
calcul de marge, liens). Pas de compilation : pour le voir sur ton ordinateur,

```bash
cd site && python3 -m http.server 8000   # puis ouvrir http://localhost:8000
```

Règles du site : vouvoiement, ton professionnel, ne présenter que des fonctions qui existent, et
les fenêtres d'aide ne se ferment qu'avec leur croix.
