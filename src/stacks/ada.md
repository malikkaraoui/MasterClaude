---
stack: ada
applies_to: ["*.adb", "*.ads", "*.gpr", "alire.toml"]
loads_from: src/fr/CLAUDE.md §0 (Contexte projet)
figure: Ada
---

# Stack — Ada

> **Ada** 👑 — La rigueur formelle au service de la sûreté.
> Dernière mise à jour : avril 2026 (Ada 2022, SPARK, Alire 2.1, ISO 26262 ASIL D).

## Principes

- **Ada 2022** standard via GNAT (GCC 13-16)
- **SPARK** pour la vérification formelle : prouve l'absence d'erreurs runtime
- **Typage fort** : sous-types, intervalles, types dérivés — le compilateur attrape les bugs
- **Concurrence native** : tasks, protected objects, rendezvous
- **Lisibilité** : le code se lit comme une spécification (Ada est verbeux par design)
- **Safety-critical** : qualification ISO 26262 ASIL D (NVIDIA + AdaCore, juin 2025)

## Tooling par défaut

- **Build** : GPRbuild (GNAT Project files `.gpr`)
- **Packages** : Alire 2.1 (`alr` CLI) — le cargo d'Ada
- **Lint** : GNATcheck pour les conventions, SPARK Examine pour la preuve
- **IDE** : GNAT Studio ou VS Code avec Ada Language Server
- **Debug** : GDB avec support Ada natif

## Sécurité

- SPARK formal verification : prouve absence de runtime errors (overflow, range, null)
- Pas de pointeurs bruts sauf `System.Address` (utiliser `access` types contrôlés)
- Ravenscar profile : sous-ensemble concurrence prouvable
- Aucune allocation dynamique en profil safety-critical (Jorvik profile)
- Vérification de bornes à la compilation via les types contraints

## Performance et Mémoire

- Pragma `Suppress` pour désactiver les checks en release (après preuve SPARK)
- `pragma Inline` pour les fonctions critiques
- Pools mémoire contrôlés : `Storage_Pool` pour les allocations
- Représentation mémoire : `for T'Size use N`, `pragma Pack`
- Profiling : GNATcoverage, Instruments, perf

## Discipline de modules

- Packages : `.ads` (spécification publique) + `.adb` (corps privé)
- Child packages pour la hiérarchie : `Parent.Child`
- Visibilité : `private` section dans `.ads` pour l'encapsulation
- Nommage : `Mixed_Case` (Snake_Case avec majuscules) — standard Ada

## Ce qu'on ne fait plus

- Pointeurs bruts (`access all`) sans justification
- `Unchecked_Deallocation` sauf cas exceptionnel documenté
- Ada 83/95 patterns : utiliser Ada 2012+ (aspects, invariants, pre/post)
- `pragma Suppress` en dev (uniquement en release après preuve)

## Gestion d'erreurs

- Exceptions typées : `Constraint_Error`, exceptions custom
- Contrats (Ada 2012+) : `Pre`, `Post`, `Type_Invariant` sur les types
- SPARK : les erreurs sont prouvées impossibles, pas gérées à l'exécution

## Tests

- AUnit : framework de tests unitaires (xUnit-style)
- GNATtest : génération automatique de harnais de test
- GNATcoverage : couverture structurelle (MC/DC pour DO-178C)
- SPARK Examine : preuve formelle remplace certains tests
