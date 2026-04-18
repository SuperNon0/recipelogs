# RecipeLog

> **Gestion de recettes de pâtisserie — Application web auto-hébergée**

Outil personnel de gestion de recettes conçu pour un usage en pâtisserie professionnelle. Intègre l'écosystème [`super-nono.cc`](https://super-nono.cc).

---

## 📋 Documentation

- **[Cahier des charges V1.1](./CDC.md)** — Spécifications complètes du projet

## 🎯 En bref

RecipeLog est un gestionnaire de recettes de pâtisserie auto-hébergé, pensé pour combler les manques des outils grand public (Recipe Keeper, etc.) sur les besoins d'un pâtissier pro :

- 🧮 **Précision au gramme** avec masse totale calculée automatiquement
- 🎯 **3 modes de multiplication** : coefficient, masse totale cible, ingrédient pivot
- 🧩 **Sous-recettes** pour composer des entremets complexes avec propagation en cascade
- 🔒 **Verrouillage individuel** des sous-recettes pour un contrôle fin
- 📖 **Cahiers PDF** personnalisables (mode liée dynamique 🔗 ou figée 📌)
- 📄 **Templates variés** (classique, moderne, fiche technique, magazine)
- 🛒 **Listes de courses** auto-générées depuis les recettes

## 🏗️ Stack & infrastructure

| Couche | Techno |
|---|---|
| **Hébergement** | Conteneur LXC Proxmox |
| **Accès** | Cloudflare Zero Trust |
| **Base de données** | PostgreSQL 15+ |
| **Langue** | Français |
| **Design system** | [FuelLog](https://fuel.super-nono.cc) (dark · DM Serif Display · DM Mono) |
| **Domaine** | `recipe.super-nono.cc` |

Le stack applicatif (backend, frontend, ORM, PDF) est laissé au libre choix du développeur dans le respect des contraintes du CDC.

## 🚦 État d'avancement

- [x] Cadrage fonctionnel
- [x] Cahier des charges V1.1 validé
- [ ] Choix du développeur
- [ ] Phase 1 — Cadrage & setup
- [ ] Phase 2 — Socle & recettes V1
- [ ] Phase 3 — Multiplication & sous-recettes
- [ ] Phase 4 — Cahiers & PDF
- [ ] Phase 5 — Liste de courses
- [ ] Phase 6 — Partage public & paramètres
- [ ] Phase 7 — Scripts Proxmox
- [ ] Phase 8 — Tests & import initial
- [ ] Phase 9 — Mise en production

**Durée estimée** : 9 à 11 semaines en dev solo.

## 🌐 Écosystème super-nono.cc

RecipeLog rejoint les outils personnels auto-hébergés :

- **FuelLog** — suivi carburant
- **Salaire** — calculateur fiches de paie
- **Proxmox** — infrastructure
- **n8n** — automatisation
- **DiscoPanel** — gestion serveur MC
- **BotPanel** — notifications Discord
- **RecipeLog** — *(ce projet)*

---

*Projet personnel — Tous droits réservés*
