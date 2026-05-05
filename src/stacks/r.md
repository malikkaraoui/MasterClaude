---
stack: r
applies_to: ["*.R", "*.Rmd", "*.qmd", "DESCRIPTION", "renv.lock"]
loads_from: src/fr/CLAUDE.md §0 (Contexte projet)
figure: Rosalie
---

# Stack — R

> **Rosalie** 📊 — La statistique élégante.
> Dernière mise à jour : avril 2026 (R 4.4+, renv + pak, polars-r, Quarto).

## Principes

- **Tidyverse** comme dialecte principal : `dplyr`, `ggplot2`, `tidyr`, `purrr`
- **`<-`** pour l'assignation (convention R), `=` réservé aux arguments de fonctions
- **snake_case** partout : variables, fonctions, fichiers
- **Pipe** : `|>` (base R 4.1+) ou `%>%` (magrittr) pour les chaînes lisibles
- **Reproductibilité** : `renv` pour les dépendances, seed pour le random

## Tooling par défaut

- **Packages** : `renv` (lockfile reproductible) + `pak` (installation rapide)
- **Lint** : `lintr` pour les anti-patterns et le style
- **Format** : `styler` pour le reformatage automatique
- **Notebooks** : Quarto (remplace R Markdown) pour les rapports reproductibles
- **IDE** : RStudio ou VS Code + R extension

## Sécurité

- Vérifier les packages CRAN avant installation (source, mainteneur, dernière MAJ)
- Jamais de `source()` sur une URL non fiable
- Données sensibles : ne pas inclure dans les notebooks partagés
- `.Renviron` pour les clés API, jamais en dur dans le code

## Performance et Mémoire

- **polars-r** (binding Rust) : pour les gros datasets, alternative à data.table
- **data.table** : opérations in-place, 10-100x plus rapide que dplyr sur gros volumes
- **dplyr** : suffisant pour la majorité des analyses (< 1M lignes)
- `future` + `furrr` pour la parallélisation des `map` functions
- `arrow` (Apache Arrow) pour les fichiers Parquet et la lecture rapide

## Discipline de modules

- Un projet = un dossier avec `renv.lock`, `R/`, `data/`, `output/`
- Package R si code réutilisable : `R/`, `man/`, `DESCRIPTION`, `NAMESPACE`
- Scripts d'analyse numérotés : `01_import.R`, `02_clean.R`, `03_model.R`
- `here::here()` pour les chemins relatifs au projet (pas de `setwd()`)

## Ce qu'on ne fait plus

- `setwd()` (utiliser `here::here()` ou des projets RStudio)
- `attach()` / `library()` dans les fonctions (qualifier `pkg::fn()`)
- R Markdown pour les nouveaux rapports (utiliser Quarto)
- `install.packages()` sans `renv` (dépendances non reproductibles)
- Boucles `for` sur des dataframes (vectoriser ou utiliser `purrr::map`)

## Gestion d'erreurs

- `tryCatch()` pour gérer les erreurs, `withCallingHandlers()` pour les warnings
- `cli::cli_abort()` pour des messages d'erreur structurés et lisibles
- `stopifnot()` pour les assertions rapides
- Logging : `logger` package pour les scripts de production

## Tests

- **testthat 3.x** : standard pour les packages R
- `expect_equal()`, `expect_error()`, `expect_snapshot()` pour les assertions
- `covr` pour la couverture de code
- `vdiffr` pour les tests de régression visuels (ggplot2)
