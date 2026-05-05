---
stack: c
applies_to: ["*.c", "*.h", "CMakeLists.txt", "Makefile", "meson.build"]
loads_from: src/fr/CLAUDE.md §0 (Contexte projet)
figure: Clara
---

# Stack — C

> **Clara** 🔧 — Le métal, sans illusion.
> Dernière mise à jour : avril 2026 (C23, sanitizers, CMake + Ninja).

## Principes

- **C23** comme standard cible (GCC 15 par défaut) : `nullptr`, `constexpr`, `typeof`
- **Ownership explicite** : chaque allocation a un propriétaire clair qui libère
- **Fonctions SafeKind** : `memset_explicit`, `memcpy_s` quand disponibles
- **Compilation stricte** : `-Wall -Wextra -Werror -pedantic` minimum
- **Un .h = une interface publique**, un .c = l'implémentation privée
- **Pas de magie** : le code fait ce qu'il dit, pas de macro-sorcellerie

## Tooling par défaut

- **Build** : CMake + Ninja (standard industrie) ; Meson pour projets neufs
- **Packages** : Conan 2.x ou vcpkg
- **Lint** : clang-tidy (intégré CI), cppcheck, PVS-Studio (si budget)
- **Format** : clang-format avec fichier `.clang-format` versionné
- **Debug** : GDB ou LLDB ; Valgrind pour les fuites

## Sécurité

- **Sanitizers obligatoires en dev** : `-fsanitize=address,undefined` (ASan + UBSan)
- MSan (MemorySanitizer) pour détecter la mémoire non initialisée
- clang-tidy checks : `bugprone-*`, `cert-*`, `security-*`
- Jamais de `sprintf` / `strcpy` / `strcat` sans borne → utiliser `snprintf`, `strncpy`
- Stack canaries : `-fstack-protector-strong`
- ASLR + PIE : `-fPIE -pie` pour les exécutables

## Performance et Mémoire

- ASan est 10x plus rapide que Valgrind pour la détection mémoire
- Profiling : `perf` (Linux), Instruments (macOS), flamegraph
- `-O2` pour la prod, `-O0 -g` pour le debug, `-Os` pour l'embarqué
- `restrict` pour aider l'optimiseur sur les pointeurs non-aliasés
- Cache-friendly : structures compactes, accès séquentiels

## Discipline de modules

- Un module = un `.h` (interface) + un `.c` (implémentation)
- Include guards : `#pragma once` ou `#ifndef MODULE_H`
- Visibilité : `static` par défaut pour les fonctions internes
- Nommage : `module_action()` (ex: `list_append()`, `buffer_free()`)

## Ce qu'on ne fait plus

- `gets()` (supprimé depuis C11)
- `strcpy()` / `sprintf()` sans borne (→ variantes `n` ou `_s`)
- `malloc` sans vérification du retour NULL
- Autotools seul (→ CMake ou Meson)
- Cast implicite de `void*` en C++ style (C le fait nativement)

## Gestion d'erreurs

- Codes de retour + `errno` : le pattern standard C
- Goto-cleanup pour libérer les ressources en cas d'erreur
- Jamais de `exit()` dans une bibliothèque
- Assertions (`assert()`) pour les invariants de développement

## Tests

- **Unity** (ThrowTheSwitch) : framework léger pour C embarqué
- **CMocka** : mocking + tests unitaires
- **CTest** (CMake intégré) pour l'orchestration
- Fuzzing : AFL++ ou libFuzzer pour découvrir les crashs
