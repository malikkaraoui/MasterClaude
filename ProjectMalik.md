# ProjectMalik — Inventaire des projets actifs

> Source : `/Users/malik/Documents/ATELIER PROJETS` (hors `ARCHIVE`)
> Généré le : 2026-05-08
> Tri : par date du dernier changement (plus récent en haut)

---

## Récap rapide

14 projets actifs détectés.

| # | Projet | Stack principale | Dernier changement | GitHub |
|---|--------|------------------|--------------------|--------|
| 1 | Boites-a-livres | Node + Expo/React Native + SwiftUI iOS + Supabase | 2026-05-07 (sub-repos) | [boites-a-lettres](https://github.com/malikkaraoui/boites-a-lettres) + [boites-a-livres-ios](https://github.com/malikkaraoui/boites-a-livres-ios) |
| 2 | MasterClaudeMultica | Turbo monorepo TS + Docker + Postgres | 2026-05-07 (git) | [MasterClaudeMultica](https://github.com/malikkaraoui/MasterClaudeMultica) |
| 3 | Co-Pilot (OKazCar) | Python 3.12 / Flask / SQLAlchemy + Chrome MV3 + Docker / Cloud Run | 2026-05-07 (git) | [nomades-project-malikkaraoui](https://github.com/NomadesAdvancedTechnologies/nomades-project-malikkaraoui) |
| 4 | DYSONV33 | Python (Selenium/Pandas) + Node/Vite/TS dashboard | 2026-05-06 (fs, no .git) | — |
| 5 | Claude Atelier | Node CLI + better-sqlite3 (npm package) | 2026-05-05 (git) | [claude-atelier](https://github.com/malikkaraoui/claude-atelier) |
| 6 | Pizzaella / PLANIZZA | Vite + React + Tailwind + Firebase RTDB + Stripe | 2026-05-05 (fs) / 2026-03-03 (git) | [pizzaella](https://github.com/malikkaraoui/pizzaella) |
| 7 | malikkaraoui-com | Vite + React + Firebase Hosting | 2026-05-05 (fs) / 2026-04-16 (git) | [KARAOUIMALIK](https://github.com/malikkaraoui/KARAOUIMALIK) |
| 8 | okazcar-com | Vite + React + i18next + Firebase Hosting | 2026-05-05 (fs) / 2026-05-02 (git) | [okazcar-com](https://github.com/malikkaraoui/okazcar-com) |
| 9 | tom-protocol | Rust (Cargo) + TypeScript monorepo + Playwright | 2026-05-03 (fs) / 2026-04-16 (git) | [ToM-protocol](https://github.com/malikkaraoui/ToM-protocol) |
| 10 | FILM CREW 🎬 | Python (Ollama) + Node, sous-app `app/` git séparée | 2026-04-28 (fs) | — (pas de remote racine) |
| 11 | DECISIO | Base Paperclip (Node/TS/Docker/Ollama) — futur PALANTIR | 2026-04-27 (git) | [DECISIO](https://github.com/malikkaraoui/DECISIO) |
| 12 | HULK_WORK_AI | Fork Paperclip — Node + TS + Docker (Ollama local) | 2026-04-26 (git) | [laboratoire](https://github.com/malikkaraoui/laboratoire) |
| 13 | TagYourCar | Swift / SwiftUI (Xcode) + Firebase Cloud Functions (Node) | 2026-04-02 (git) | [TagYourCar](https://github.com/malikkaraoui/TagYourCar) |
| 14 | SCRIPT.IA | Python / FastAPI + React frontend + Ollama / OpenAI | 2026-03-19 (git) / 2026-01-30 (fs) | [LOCAL.IA.GENERATED_COMPTE_RENDU](https://github.com/malikkaraoui/LOCAL.IA.GENERATED_COMPTE_RENDU) |

---

## Détail par projet

### 1. Boites-a-livres

- **Chemin** : `/Users/malik/Documents/ATELIER PROJETS/Boites-a-livres`
- **Stack** : Node.js (scripts d'import GPX/photos) + Expo/React Native (`BoitesALivres`) + SwiftUI iOS natif (`BoitesALivresNative`) + Supabase
- **Dernier changement** : 2026-05-07 (sous-repos), racine non versionnée
- **GitHub** :
  - `BoitesALivres` → https://github.com/malikkaraoui/boites-a-lettres
  - `BoitesALivresNative` → https://github.com/malikkaraoui/boites-a-livres-ios
- **Description** : App mobile (iOS natif Swift + RN/Expo) pour localiser ~17 000 boîtes à livres en France à partir des dumps GPX de boites-a-livres.fr (licence ODbL). Backend léger Supabase, scripts d'import GPX/photos. MVP préparé pour soumission Apple.

### 2. MasterClaudeMultica

- **Chemin** : `/Users/malik/Documents/ATELIER PROJETS/MasterClaudeMultica`
- **Stack** : Monorepo Turbo (web + docs + desktop) — TypeScript, Docker, Postgres, Playwright
- **Dernier changement** : 2026-05-07 (git)
- **GitHub** : https://github.com/malikkaraoui/MasterClaudeMultica
- **Description** : Fork francisé de Multica (plateforme open-source d'agents codants managés — "your next 10 hires won't be human"). Dernier commit : traductions i18n FR.

### 3. Co-Pilot (OKazCar — backend + extension)

- **Chemin** : `/Users/malik/Documents/ATELIER PROJETS/Co-Pilot`
- **Stack** : Python 3.12 / Flask 3.1 / SQLAlchemy 2.0 + Chrome Extension Manifest V3 + Docker + Cloud Run. Vitest pour l'extension.
- **Dernier changement** : 2026-05-07 (git)
- **GitHub** : https://github.com/NomadesAdvancedTechnologies/nomades-project-malikkaraoui
- **Description** : Cœur de **OKazCar** — extension Chrome MV3 + API Flask qui score la confiance des annonces auto (Leboncoin, AutoScout24 12 pays, La Centrale, ParuVendu) via 12 filtres parallèles (ThreadPoolExecutor). 1417 tests, version 1.2.0. Dépend de `claude-atelier`.

### 4. DYSONV33

- **Chemin** : `/Users/malik/Documents/ATELIER PROJETS/DYSONV33`
- **Stack** : Python (Selenium, undetected-chromedriver, Pandas, BeautifulSoup) + Node/Vite/TS (Express + Papaparse) pour le dashboard
- **Dernier changement** : 2026-05-06 (fs — **pas de .git**)
- **GitHub** : —
- **Description** : Pipeline de scraping Caradisiac + dashboard de visualisation des CSV résultats. Probablement lié à OKazCar (enrichissement catalogue véhicules). Sous-projets : `caradisiac_scraper`, `dashboard`, `csv_result`, `boitesalivre`.

### 5. Claude Atelier

- **Chemin** : `/Users/malik/Documents/ATELIER PROJETS/Claude Atelier`
- **Stack** : Node.js CLI + better-sqlite3, package npm publié
- **Dernier changement** : 2026-05-05 (git)
- **GitHub** : https://github.com/malikkaraoui/claude-atelier
- **Description** : Package npm `claude-atelier` — framework de discipline pour Claude Code (31 agents, 18 skills, MCP GitHub intégré, mémoire persistante, vault Peter, Context7 dynamique, mode éco, verrou review). v0.26.0 publiée. Utilisé comme dépendance par Co-Pilot et tom-protocol.

### 6. Pizzaella / PLANIZZA

- **Chemin** : `/Users/malik/Documents/ATELIER PROJETS/Pizzaella`
- **Stack** : Vite + React + Tailwind + shadcn/ui + Radix + Firebase Auth + RTDB + Cloud Functions + Stripe Checkout (webhook). E2E Playwright.
- **Dernier changement** : 2026-05-05 (fs) / 2026-03-03 (git)
- **GitHub** : https://github.com/malikkaraoui/pizzaella
- **Description** : Plateforme web de commande et de gestion de pizzas itinérantes. Repo git nommé `pizzaella`, README parle de PLANIZZA.

### 7. malikkaraoui-com

- **Chemin** : `/Users/malik/Documents/ATELIER PROJETS/malikkaraoui-com`
- **Stack** : Vite + React + framer-motion + Firebase Hosting
- **Dernier changement** : 2026-05-05 (fs) / 2026-04-16 (git)
- **GitHub** : https://github.com/malikkaraoui/KARAOUIMALIK
- **Description** : Site personnel/portfolio. Présente les projets et la vision (IA locale, décentralisation, craft). Trois axes : IA accessible, décentralisation, craft.

### 8. okazcar-com

- **Chemin** : `/Users/malik/Documents/ATELIER PROJETS/okazcar-com`
- **Stack** : Vite + React + i18next + react-router + lucide + framer-motion + Firebase Hosting
- **Dernier changement** : 2026-05-05 (fs) / 2026-05-02 (git)
- **GitHub** : https://github.com/malikkaraoui/okazcar-com
- **Description** : Landing publique de l'extension OKazCar. Catalogue intégré : 178 marques, 4 373 modèles, 151 358 finitions, 12 filtres, 12 pays.

### 9. tom-protocol

- **Chemin** : `/Users/malik/Documents/ATELIER PROJETS/tom-protocol`
- **Stack** : Rust (Cargo workspace, QUIC) + TypeScript monorepo + Biome + Husky + Playwright + Vitest
- **Dernier changement** : 2026-05-03 (fs) / 2026-04-16 (git)
- **GitHub** : https://github.com/malikkaraoui/ToM-protocol
- **Description** : Protocole P2P "The Open Messaging" — couche transport décentralisée où chaque device est à la fois client et relais. Phase 2 validée (Rust QUIC + hole punching + crypto E2E + cross-border CH↔FR). 1089+ tests (771 TS + 318 Rust).

### 10. FILM CREW 🎬

- **Chemin** : `/Users/malik/Documents/ATELIER PROJETS/FILM CREW 🎬`
- **Stack** : Python (Ollama local) + Node ; sous-projets `app/` et `app-dialogue-preservation/` ont chacun leur propre `.git`
- **Dernier changement** : 2026-04-28 (fs — **racine non versionnée**)
- **GitHub** : — (à extraire des sous-repos si besoin)
- **Description** : Orchestrateur de "rôles IA" pour produire des prompts cinéma optimisés à envoyer à Seedance (BytePlus). Architecture 3 couches : cerveau Ollama local (questions IA, JSON, storyboard) → réalisateur IA (prompt cinéma avancé, style/caméra) → générateur vidéo.

### 11. DECISIO

- **Chemin** : `/Users/malik/Documents/ATELIER PROJETS/DECISIO`
- **Stack** : Node + TypeScript + Docker + Playwright + Vitest (Ollama local) — **base Paperclip pour l'instant**, à faire évoluer
- **Dernier changement** : 2026-04-27 (git)
- **GitHub** : https://github.com/malikkaraoui/DECISIO
- **Description** : **Futur "PALANTIR"** — plateforme d'intelligence et d'aide à la décision. Démarre sur la base technique de Paperclip (`name: paperclip` dans `package.json`) pour aller vite, mais la cible produit est totalement différente : agrégation de signaux, croisement de sources, aide à la décision stratégique. **Aucun lien produit avec HULK_WORK_AI** — seule la base de code initiale est commune.

### 12. HULK_WORK_AI

- **Chemin** : `/Users/malik/Documents/ATELIER PROJETS/HULK_WORK_AI`
- **Stack** : Identique à DECISIO (Node + TS + Docker + Playwright + Vitest, Ollama local)
- **Dernier changement** : 2026-04-26 (git)
- **GitHub** : https://github.com/malikkaraoui/laboratoire
- **Description** : Second fork de Paperclip, pivoté vers "jumeau numérique dirigeant" + intégration BMad. Remote `laboratoire` (laboratoire R&D perso).

### 13. TagYourCar

- **Chemin** : `/Users/malik/Documents/ATELIER PROJETS/TagYourCar`
- **Stack** : Swift / SwiftUI (Xcode project) + Cloud Functions Firebase (Node/TS, Jest) + Firestore + Firebase Hosting
- **Dernier changement** : 2026-04-02 (git)
- **GitHub** : https://github.com/malikkaraoui/TagYourCar
- **Description** : App iOS native pour tagger des véhicules. Dernier travail : harmonisation profil avec design system de l'app.

### 14. SCRIPT.IA

- **Chemin** : `/Users/malik/Documents/ATELIER PROJETS/SCRIPT.IA`
- **Stack** : Python 3.13 / FastAPI 0.115 + React 18.3 + Ollama (ou OpenAI) + pyproject.toml + ruff
- **Dernier changement** : 2026-03-19 (git) / 2026-01-30 (fs)
- **GitHub** : https://github.com/malikkaraoui/LOCAL.IA.GENERATED_COMPTE_RENDU
- **Description** : Générateur automatique de comptes-rendus RH-Pro en DOCX. Pipeline RAG avec garde-fous anti-hallucination (interdiction d'inventer), scan batch multi-clients, table interactive, export DOCX + debug.json + metrics.json.

---

## Notes / points à vérifier

- **DYSONV33** et **Boites-a-livres** (racine) ne sont **pas versionnés git** au niveau racine — à confirmer si volontaire.
- **FILM CREW 🎬** racine non git, mais 2 sous-projets (`app/`, `app-dialogue-preservation/`) ont leurs propres repos — remotes non extraits.
- **DECISIO** et **HULK_WORK_AI** partagent la même base de code initiale (Paperclip) mais sont **deux produits distincts** : DECISIO = futur PALANTIR (intelligence/décision), HULK_WORK_AI = jumeau numérique dirigeant. Ne pas archiver l'un pour l'autre.
- **Co-Pilot** est l'app OKazCar (backend + extension), **okazcar-com** est juste la landing — ne pas confondre.
- Plusieurs projets n'ont pas eu de commit git récent mais ont des fichiers modifiés (fs > git). Audit "stale vs actif" possible si voulu.

## Légende dates

- **(git)** = date du dernier `git log -1`
- **(fs)** = `mtime` du dossier sur le disque (peut inclure des modifs non commitées ou des fichiers temporaires)
