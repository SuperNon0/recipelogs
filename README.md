# RecipeLog — site vitrine et démo

Cette branche (`site-vitrine`) ne contient que le site vitrine de RecipeLog et ses scripts.
Le site s'adresse aux professionnels (B2B) : RecipeLog y est présenté en location mensuelle,
sans parler de l'hébergement technique.
L'appli elle-même est sur `main` (bêta) et `stable` : les trois ne se mélangent jamais.

| Branche | Rôle |
|---|---|
| `main` | bêta de RecipeLog (le site de Noë) |
| `stable` | RecipeLog validé (les autres sites, et la démo) |
| `site-vitrine` | le site vitrine seul : ses commandes d'installation et de mise à jour ne lisent que cette branche |

```
site/                   le site (HTML, CSS, JS, sans build)
install.sh              installation en une ligne depuis le shell Proxmox
mise-a-jour.sh          mise à jour de la vitrine (et de la démo avec --demo)
scripts/                scripts copiés dans les conteneurs
```

## Nom de domaine dédié (une seule fois, avant l'installation)

Exemple avec `recipelog.fr` :

1. Ajouter le domaine à Cloudflare : l'acheter chez Cloudflare (Domain Registration), ou l'ajouter
   puis mettre les serveurs DNS de Cloudflare chez le vendeur.
2. Zero Trust → Networks → Tunnels : créer deux tunnels, « vitrine » et « demo », et copier le
   **jeton** de chacun (la suite de caractères après `--token`).
3. Public Hostname :
   - tunnel vitrine : `recipelog.fr` et `www.recipelog.fr` → `http://localhost:80`
   - tunnel demo : `demo.recipelog.fr` → `http://localhost:80`
4. Pas d'application Access sur ce domaine : les deux sites sont publics.
5. Lancer la commande d'installation et coller l'adresse de la démo, l'e-mail de contact et les
   deux jetons quand elle les demande.

## Créer le site vitrine

Une seule ligne, à coller dans le shell de l'hôte Proxmox (en root) :

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/SuperNon0/recipelogs/site-vitrine/install.sh)"
```

Ça crée **deux conteneurs LXC** (pas de machine virtuelle) :

| Conteneur | Contenu | Taille |
|---|---|---|
| `recipelog-vitrine` | le site vitrine, servi par nginx sur le port 80 | 512 Mo, 4 Go |
| `recipelog-demo` | un RecipeLog classique (branche `stable`) en **mode démo** | celui de l'installateur RecipeLog |

Quatre questions, toutes facultatives (Entrée pour passer) : installer la démo, l'adresse publique
de la démo, l'e-mail de contact, et les jetons des tunnels Cloudflare. À la fin, un résumé est gardé dans
`/root/recipelog-vitrine.txt` sur l'hôte.

## Mettre à jour le site vitrine

Modifie le site sur cette branche (`site-vitrine`), puis dans le shell Proxmox :

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/SuperNon0/recipelogs/site-vitrine/mise-a-jour.sh)"
```

Pour mettre aussi à jour le RecipeLog de la démo (ce qui est sur `stable`) :

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/SuperNon0/recipelogs/site-vitrine/mise-a-jour.sh)" _ --demo
```

Pas de bouton : la démo a le bouton « Mettre à jour le site » coupé.

## La démo

- `RECIPELOG_DEMO=1` dans `/opt/recipelog/.env` : bandeau « Site de démonstration », et personne ne
  peut activer les comptes, créer une clé Claude (MCP) ni lancer la mise à jour du site.
- **Mettre les recettes de démo** : ajoute 2-3 recettes sur le site de la démo, puis fige-les :
  `pct exec <numéro de la démo> -- recipelog-demo-figer`
- **Chaque nuit à 4 h 30**, la démo revient à cet état (`recipelog-demo-reset`, minuteur systemd).
  Pour le faire tout de suite : `pct exec <numéro> -- recipelog-demo-reset`.
- Les nouvelles migrations de la base sont appliquées après chaque remise à zéro, donc une
  démo figée avant une mise à jour reste valable.

## Cloudflare

- **Vitrine** : un tunnel vers `http://localhost:80` (jeton donné à l'installation, ou plus tard
  `cloudflared service install <jeton>` dans le conteneur). Pas d'Access : le site est public.
- **Démo** : un tunnel vers `http://localhost:80` dans le conteneur de la démo. Ne mets **pas**
  d'application Cloudflare Access dessus, sinon les visiteurs ne pourront pas l'ouvrir. Si une
  application Access couvre `*.ton-domaine`, ajoute-lui une règle « Bypass → Everyone » pour les
  adresses de la démo et de la vitrine. Le site RecipeLog principal garde sa propre protection.
- Liens de la vitrine (gardés aux mises à jour, dans `/etc/recipelog-vitrine/`) :
  `pct exec <numéro de la vitrine> -- vitrine-reglage demo https://demo.mon-site.fr`
  `pct exec <numéro de la vitrine> -- vitrine-reglage contact contact@mon-site.fr`
  Sans e-mail, les boutons « Demander une démo » mènent au bas de la page.

## Voir le site en local

```bash
cd site && python3 -m http.server 8000   # puis http://localhost:8000
```
