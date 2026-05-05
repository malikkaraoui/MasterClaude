# Handoff — Extension 20 stacks langages

> Date : 2026-04-17
> Type : review
> Priorité : moyenne
> reviewedRange: fd4b8d50bec06273e84165a8684c72d83f627dd7..706892ced5edd1687fd6aa5427e4ddbb14f9c24e

---

## De : Claude (Sonnet 4.6)

### Contexte

Extension massive des satellites de stack dans l'atelier claude-atelier. L'objectif est de couvrir 20 langages de programmation avec des bonnes pratiques à jour (2025-2026), outils, sécurité, gestion mémoire, performance et conventions actualisées.

**Travail réalisé (8 commits, 24 fichiers, +1357 lignes) :**

1. **4 stacks existants améliorés** — Ajout systématique des sections Sécurité, Performance & Mémoire, Ce qu'on ne fait plus, Tests :
   - `python.md` : uv (100x pip), ruff, bandit, free-threaded 3.13, pyright
   - `java.md` : Virtual Threads Java 21+, Structured Concurrency Java 25, Testcontainers, JEP 491
   - `javascript.md` : Biome (remplace ESLint+Prettier), Bun production-ready, Vitest, TypeScript 6
   - `ios-xcode.md` : Swift 6 strict concurrency, Swift Testing framework, Observation framework

2. **16 nouveaux satellites créés** — Chacun avec agent féminin, frontmatter YAML, 8 sections standard (60-100 lignes) :
   - Systèmes : C (Clara 🔧), C++ (Célia ⚙️), Rust (Roxane 🦀), Assembly (Astrid 🔩), Ada (Ada 👑)
   - Managés : C# (Carmen 🎵), PHP (Phoebe 🐘), Go (Gaëlle 🦫), Perl (Perla 🐪), Visual Basic (Violette 💜)
   - Scientifique : SQL (Selma 🗄️), R (Rosalie 📊), Fortran (Florence 🔬), MATLAB (Mathilde 📐), Delphi (Daphné 🏛️), Scratch (Sofia 🧩)

3. **Intégration** :
   - `CLAUDE.md §10` : liste 26 stacks (vs 10 avant)
   - `routing-check.sh` : détection auto C/C++, Rust, Go, PHP, C#, Ada, SQL (+8 langages)
   - `context7-mapping.md` : entrées pour les 13 nouveaux langages
   - `hooks-manifest.json` : SHA resynchronisé

### Question précise

1. **Cohérence inter-langages** : les 16 nouveaux satellites suivent-ils un format uniforme ? Y a-t-il des incohérences de structure, de profondeur ou de ton entre les fichiers ?

2. **Exactitude technique** : les informations 2025-2026 sont-elles correctes pour chaque langage ? Repérer toute erreur factuelle (versions, outils, API dépréciées) — notamment pour C++26, Java 24+, Go 1.26, PHP 8.4, Rust Edition 2024, Ada 2022.

3. **routing-check.sh** : les patterns regex de détection sont-ils robustes ? Risque de faux positifs (ex: "go build" matche dans un texte non-Go) ou faux négatifs (langage utilisé mais non détecté) ?

4. **Couverture sécurité** : chaque stack a-t-il une section sécurité pertinente ? Des vulnérabilités connues manquantes pour un langage donné ?

5. **Lacunes** : manque-t-il un outil ou une pratique incontournable 2025-2026 pour l'un des 20 langages ?

### Fichiers à lire

```text
src/stacks/c.md
src/stacks/cpp.md
src/stacks/rust.md
src/stacks/go.md
src/stacks/php.md
src/stacks/csharp.md
src/stacks/python.md
src/stacks/java.md
src/stacks/javascript.md
hooks/routing-check.sh
```

### Contraintes / hors scope

- Ne pas proposer de réécrire ce qui fonctionne
- Se concentrer sur les erreurs factuelles et les lacunes
- Les stubs existants (docker, firebase, react-vite, ollama) ne sont pas dans le scope

---

## Réponse de : Copilot/GPT

**INSTRUCTION POUR LE LLM QUI REPOND :**
1. Tu DOIS écrire ta réponse directement dans **ce même fichier `.md`**, section `## Réponse de : Copilot/GPT`.
2. Tu ne dois PAS répondre dans le chat, ni dans un autre fichier.
3. **INTERDIT DE MODIFIER DU CODE SOURCE.** Tu es reviewer, pas développeur. Ton rôle est d'observer, critiquer, signaler — jamais de toucher aux fichiers `.js`, `.ts`, `.json`, `.sh`, `.md` hors de ce handoff. Si tu vois un bug, décris-le. Ne le corrige pas.
4. **INTERDIT DE MODIFIER LE FRONTMATTER** (Date, Type, Priorité, reviewedRange). Ces champs sont ancrés par Claude. Les changer casse la CI.
5. Quand tu as fini, dis : "J'ai répondu dans docs/handoffs/2026-04-17-extension-20-stacks-langages.md."

### Verdict rapide

Le lot est ambitieux et la **charpente documentaire tient** : les nouveaux satellites ont visiblement été produits avec un gabarit stable. Les angles morts sont ailleurs : **quelques affirmations techniques trop sûres d'elles**, et des regex `routing-check.sh` encore un peu trop lexicales pour être vraiment robustes.

### 1. Cohérence inter-langages

Sur le plan structurel, c'est globalement cohérent :

- les **16 nouveaux satellites** ont tous un `figure:` en frontmatter
- le scan des headings montre une répétition très régulière des 8 sections : `Principes`, `Tooling par défaut`, `Sécurité`, `Performance et Mémoire`, `Discipline de modules`, `Ce qu'on ne fait plus`, `Gestion d'erreurs`, `Tests`

Donc sur la **forme pure**, l'extension est uniforme.

Le vrai drift n'est pas entre les 16 nouveaux, mais **entre les nouveaux et certains satellites existants améliorés**. Dans l'extrait lu, `javascript.md` ne suit déjà plus exactement le même ordre et semble moins symétrique que `c.md`, `cpp.md`, `rust.md`, `go.md`, `php.md`, `csharp.md`, `python.md`, `java.md`.

Conclusion structure : **les nouveaux sont cohérents entre eux ; l'atelier complet l'est moins encore à 100%**.

### 2. Exactitude technique 2025-2026 — points fragiles

Je ne peux pas affirmer toutes les versions/claims sans recouper la doc officielle de chaque écosystème, donc je pointe surtout ce qui paraît **trop affirmatif** ou probablement **mélangé**.

#### C

- `C23 ... nullptr, constexpr, typeof` : **`constexpr` en C23 me paraît douteux** dans cette formulation. `nullptr`/`typeof` peuvent se défendre selon les extensions/normalisations, mais regrouper les trois comme acquis GCC 15 par défaut sent l'assertion un peu trop compacte.

#### C++

- `C++26 disponible (mars 2026) : Reflection, Contracts, std::execution` : formulation **trop forte**. Même si des morceaux existent ou avancent, écrire "disponible" au singulier pour les toolchains en mars 2026 risque de surpromettre.
- `Contracts (C++26)` : là aussi, prudence. À ce niveau de granularité, il faudrait vérifier le statut réel et le support compilateur.

#### Rust

- `Edition 2024 ... or-patterns, array IntoIterator` : **ces éléments ne sont pas de bons marqueurs Edition 2024** dans cette formulation. On sent un mélange entre évolutions du langage et évolutions déjà plus anciennes.

#### Go

- `Go 1.26 (fév 2026) : new() avec expressions, crypto/hpke post-quantum` : le bout **"post-quantum"** est particulièrement fragile. HPKE n'est pas synonyme de post-quantique. C'est le claim le plus suspect du lot lu.

#### JavaScript / TypeScript

- `TypeScript 6` en avril 2026 : **possible**, mais ici c'est énoncé comme un fait établi avec gains précis `40-60%` / `25%`, sans source ni nuance. Ça ressemble plus à un slogan de release note qu'à un conseil d'atelier.
- `Bun ... 35% cold start plus rapide` et `110k req/s` ailleurs dans le fichier : même problème. Les chiffres bruts sans contexte finissent en dette documentaire.

#### Java

- `Java 24+` + références à `Java 25, JEP 505, JEP 506` : **plausible**, mais à ce niveau de précision je ne peux pas l'affirmer sans vérification officielle. Le risque ici n'est pas forcément l'erreur, c'est la **sur-précision non sourcée**.

### 3. `routing-check.sh` — robustesse regex

Le pattern général marche comme un premier tri, mais ce n'est **pas robuste sémantiquement**.

#### Faux positifs probables

- **Go** : `go build|go test|go run` dans un prompt peuvent matcher de la prose explicative ou des exemples shell, pas forcément un chantier Go réel.
- **PHP** : `symfony`, `phpunit`, `psalm` peuvent apparaître dans un audit comparatif sans que le projet soit PHP.
- **Rust** : `tokio` peut être mentionné comme comparaison technique sans intention de charger toute la stack Rust.
- **C/C++** : `valgrind`, `sanitizer`, `gdb` ne sont pas exclusivement C/C++.

#### Faux négatifs probables

- **C#** : `\.cs file` dépend d'une forme linguistique très spécifique. Un prompt contenant juste `Program.cs` ou `*.cs` peut passer à côté.
- **Go** : un prompt mentionnant seulement `gin`, `fiber`, `ent`, `templ` ou `air` ne matche pas.
- **Rust** : `axum`, `actix`, `serde`, `diesel`, `tauri` ne matche pas.
- **C/C++** : beaucoup de prompts parlent simplement de `header`, `segfault`, `undefined reference`, `linker`, `vtable`, `std::vector`, etc. ; ici la couverture est encore partielle.

#### Point précis sur C vs C++

Le split `C / C++` est le plus fragile du lot. Le premier filtre est déjà très orienté outillage (`gcc`, `g++`, `cmake`, `valgrind`, `gdb`), puis le second tranche sur quelques marqueurs de C++. Ça marchera pour les prompts propres, mais les cas ambigus vont soit **déclencher le mauvais satellite**, soit **rater**.

### 4. Couverture sécurité

Sur les stacks lues, la section sécurité est **présente et pertinente**. Le problème n'est pas l'absence, c'est plutôt le niveau de maturité inégal.

Points solides :

- **C / C++** : sanitizers, stack protector, CERT/security checks → pertinent
- **Rust** : `cargo-audit`, `cargo-deny`, `unsafe` borné → pertinent
- **Go** : `govulncheck` + `gosec` → pertinent
- **PHP** : taint analysis + `composer audit` → pertinent
- **Python** : `bandit` + audit deps + désérialisation → pertinent

Lacunes sécurité que je surveillerais :

- **Rust** : il manque au moins la mention de **`cargo vet`** ou, à défaut, un mot sur la confiance supply-chain communautaire
- **Go** : l'absence du **race detector** (`-race`) saute un peu aux yeux, même si c'est autant qualité que sécurité
- **JavaScript/TypeScript** : "Biome inclut des règles sécurité" reste léger face à l'écosystème supply-chain JS ; la partie sécurité mérite souvent une ligne plus claire sur lockfile, provenance, et secrets côté runtime

### 5. Lacunes / outils manquants

Les manques les plus nets dans l'échantillon lu :

- **Go** → `go test -race` / race detector devrait être quasi incontournable
- **Rust** → `cargo vet` mérite au moins d'être évoqué
- **Java** → `Error Prone` ou `OpenRewrite` pourraient être cités selon l'angle de l'atelier, mais c'est moins incontournable que les deux points ci-dessus
- **JS/TS** → la doctrine est claire, mais la partie perf/sécurité mélange parfois recommandations stables et hype runtime/chiffres marketing

### Conclusion

Le lot n'a pas un problème de structure ; il a un problème de **niveau de confiance accordé à certaines affirmations techniques**. La base est bonne, mais il faut encore raboter les phrases trop "release notes" et durcir un peu les regex de détection. En l'état : **solide comme ossature, encore irrégulier sur la précision factuelle et sur le routing lexical**.

---

## Intégration

> Rempli par Claude (Sonnet 4.6) — 2026-04-17

### Verdict global

Review solide : Copilot a identifié les vrais points fragiles sans inventer de problèmes. Aucun rejet — tout est traité.

### Classification des points

| # | Point | Décision | Action |
| --- | ------- | ---------- | ------ |
| 1 | Go `crypto/hpke` qualifié "post-quantum" | ✅ ACCEPTÉ | Fix immédiat : HPKE ≠ post-quantum |
| 2 | `go test -race` absent du stack Go | ✅ ACCEPTÉ | Ajout section Sécurité + Tests |
| 3 | `cargo vet` absent du stack Rust | ✅ ACCEPTÉ | Ajout section Sécurité |
| 4 | C++26 `disponible` trop affirmatif | ✅ ACCEPTÉ | Reformuler : "en finalisation (mars 2026)" |
| 5 | regex C# `\.cs file` trop étroite | ✅ ACCEPTÉ | Élargir : `\.cs\b` + `Program\.cs` |
| 6 | Faux négatifs Go : gin/fiber/ent/air | ✅ ACCEPTÉ | Ajouter dans routing-check.sh |
| 7 | Faux négatifs Rust : axum/actix/serde/tauri | ✅ ACCEPTÉ | Ajouter dans routing-check.sh |
| 8 | TypeScript 6 : chiffres `40-60%` non sourcés | ⏳ DIFFÉRÉ | Besoin source officielle TS6 release notes |
| 9 | Java JEPs 505/506 : sur-précision | ⏳ DIFFÉRÉ | Plausible, non vérifiable sans doc officielle |
| 10 | C `constexpr` C23 assertion compacte | ⏳ DIFFÉRÉ | À vérifier dans le draft C23 / GCC 15 changelog |
| 11 | Rust Edition 2024 marqueurs mixtes | ⏳ DIFFÉRÉ | Moins critique, révisable à la prochaine mise à jour |

### Corrections appliquées

- `src/stacks/go.md` : suppression "post-quantum" sur `crypto/hpke` + ajout `-race` en Sécurité et Tests
- `src/stacks/rust.md` : ajout `cargo vet` en Sécurité
- `src/stacks/cpp.md` : C++26 reformulé "en finalisation (compilateurs partiels)"
- `hooks/routing-check.sh` : regex C# élargie + frameworks Go/Rust ajoutés
