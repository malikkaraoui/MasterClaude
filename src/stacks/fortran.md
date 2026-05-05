---
stack: fortran
applies_to: ["*.f90", "*.f95", "*.f03", "*.f08", "*.f", "fpm.toml"]
loads_from: src/fr/CLAUDE.md §0 (Contexte projet)
figure: Florence
---

# Stack — Fortran

> **Florence** 🔬 — Le calcul scientifique sans compromis.
> Dernière mise à jour : avril 2026 (Fortran 2023, fpm 0.13, ifx LLVM).

## Principes

- **Fortran 2023** standard cible, **free-form** exclusivement (`.f90`+)
- **Modules** pour tout : pas de COMMON blocks, pas d'IMPLICIT
- **`implicit none`** en tête de chaque unité de programme — non négociable
- **Intent** explicite : `intent(in)`, `intent(out)`, `intent(inout)` sur tous les arguments
- **Coarrays** pour la parallélisation native (alternative MPI légère)
- **Calcul HPC** : le domaine où Fortran reste imbattable

## Tooling par défaut

- **Build** : fpm 0.12-0.13 (Fortran Package Manager) — le cargo de Fortran
- **Compilateurs** : gfortran (GCC, gratuit), ifx (Intel LLVM, performant), flang (LLVM)
- **Lint** : `-Wall -Wextra -pedantic -fcheck=all` en dev
- **Debug** : GDB avec support Fortran, `-fbacktrace` pour les stacktraces
- **Profiling** : gprof, perf, Intel VTune

## Sécurité

- `-fcheck=bounds` en dev pour détecter les dépassements de tableaux
- `-fcheck=all` inclut bounds + pointer + overflow checks
- Pas de `EQUIVALENCE` (aliasing dangereux)
- Allocatables avec `stat=` pour gérer les erreurs d'allocation

## Performance et Mémoire

- **OpenMP** : parallélisme shared-memory (`!$omp parallel do`)
- **MPI** : parallélisme distributed-memory (communication inter-nœuds)
- **Coarrays** : parallélisme natif Fortran, plus simple que MPI brut
- `-O2 -march=native` pour la prod, `-O0 -g -fcheck=all` pour le dev
- Tableaux contiguës en mémoire (column-major : itérer d'abord sur le premier indice)
- `pure` et `elemental` fonctions pour aider l'optimiseur

## Discipline de modules

- Un module = un fichier `.f90`, nom du module = nom du fichier
- `use, only:` pour importer uniquement ce qui est nécessaire
- `private` par défaut dans les modules, `public` explicite
- Structure : `src/`, `test/`, `app/` (convention fpm)

## Ce qu'on ne fait plus

- **Fixed-form** (`.f`, `.f77`) pour du code neuf
- **COMMON blocks** (utiliser des modules)
- **GOTO** (utiliser `exit`, `cycle`, `select case`)
- **EQUIVALENCE** (aliasing non portable)
- **IMPLICIT** typing (toujours `implicit none`)
- **FORMAT statements** numérotés (utiliser des formats inline ou `write`)

## Gestion d'erreurs

- `iostat=` et `iomsg=` sur les I/O pour capturer les erreurs
- `stat=` sur `allocate`/`deallocate`
- `error stop` pour les arrêts d'urgence avec message
- Pas d'exceptions en Fortran : gestion explicite par codes retour

## Tests

- **fpm test** : exécution intégrée dans le build system
- **FRUIT** ou **pFUnit** : frameworks de tests unitaires Fortran
- Comparaison avec des solutions analytiques pour les tests numériques
- Tolérance numérique : `abs(result - expected) < epsilon`
