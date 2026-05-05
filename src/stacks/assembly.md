---
stack: assembly
applies_to: ["*.asm", "*.s", "*.S", "*.nasm"]
loads_from: src/fr/CLAUDE.md §0 (Contexte projet)
figure: Astrid
---

# Stack — Assembly

> **Astrid** 🔩 — Au plus près du silicium.
> Dernière mise à jour : avril 2026 (NASM 3.0+, AVX-512, intrinsics-first).

## Principes

- **Intrinsics d'abord** : utiliser les wrappers C/C++/Rust pour SIMD plutôt que l'asm brut
- **Asm brut uniquement si** : hot path prouvé par profiling, boot code, ou contrainte matérielle
- **Commentaires obligatoires** : chaque bloc asm explique le *pourquoi*, pas le *quoi*
- **ABI respectée** : conventions d'appel de la plateforme (System V AMD64, ARM AAPCS)
- **Reproductible** : assembler avec les mêmes flags donne le même binaire

## Tooling par défaut

- **Assembleurs** : NASM 3.0+ (APX, 32 registres GP), FASM 1.73+ (AMX), GAS (GNU)
- **Debug** : GDB avec `layout asm`, LLDB, `objdump -d`
- **Profiling** : `perf stat`, `perf record` + flamegraph
- **Vérification** : `nm` (symboles), `readelf` (sections), `hexdump`

## Sécurité

- Inline assembly : vérifier que les clobbers sont corrects
- Stack canaries gérés par le compilateur hôte, pas par l'asm
- Jamais de `jmp` vers une adresse calculée depuis un input utilisateur
- NX bit : données non exécutables, code non inscriptible

## Performance et Mémoire

- **AVX2** comme baseline SIMD (supporté depuis Haswell, 2013)
- **AVX-512** pour compute-heavy (+25% sur les workloads vectorisables)
- **AVX10** à l'horizon : unification AVX-512 sur tous les cores
- Alignement mémoire : 16 bytes pour SSE, 32 pour AVX, 64 pour AVX-512
- Prefetch (`prefetcht0`) uniquement si prouvé par benchmarks

## Discipline de modules

- Un fichier `.asm` = une fonction ou un groupe cohérent
- Labels locaux : `.loop`, `.done` (NASM) pour éviter les collisions
- Sections explicites : `.text` (code), `.data` (données), `.bss` (non initialisé)
- Symboles globaux : `global function_name` avec documentation

## Ce qu'on ne fait plus

- Écrire du SIMD en asm pur (utiliser intrinsics sauf micro-optimisation prouvée)
- x87 FPU (utiliser SSE2+ pour le flottant)
- Auto-modifying code (incompatible avec NX, caches, sécurité)
- Optimisation manuelle sans profiling préalable

## Gestion d'erreurs

- Codes retour dans `rax` (convention C)
- `errno` via TLS si interfaçage avec la libc
- Pas d'exceptions : gestion explicite par le code appelant

## Tests

- Tester via le langage hôte (C/Rust) qui appelle les fonctions asm
- `perf stat` pour valider les cycles/instructions
- Comparaison avec l'implémentation C pour vérifier la correction
