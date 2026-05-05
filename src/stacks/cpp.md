---
stack: cpp
applies_to: ["*.cpp", "*.cxx", "*.cc", "*.hpp", "*.hxx", "CMakeLists.txt"]
loads_from: src/fr/CLAUDE.md §0 (Contexte projet)
figure: Célia
---

# Stack — C++

> **Célia** ⚙️ — La puissance sous contrôle.
> Dernière mise à jour : avril 2026 (C++26, Reflection, Contracts, coroutines matures).

## Principes

- **C++26** en finalisation (mars 2026) : Reflection, Contracts, `std::execution` — support compilateur partiel
- **RAII absolu** : chaque ressource a un destructeur qui la libère
- **Smart pointers** : `unique_ptr` (défaut), `shared_ptr` (si partagé), `std::span` (vues)
- **`const` par défaut** sur tout : variables, méthodes, références
- **Move semantics** : déplacer plutôt que copier quand possible
- **Zéro raw new/delete** : la mémoire passe par les conteneurs et smart pointers

## Tooling par défaut

- **Build** : CMake (presets) + Ninja ; Meson pour projets neufs
- **Packages** : Conan 2.x ou vcpkg
- **Lint** : clang-tidy (`modernize-*`, `bugprone-*`, `performance-*`)
- **Format** : clang-format versionné
- **Test** : Google Test (complet), Catch2 (moderne), doctest (léger)
- **Debug** : GDB / LLDB, sanitizers

## Sécurité

- Sanitizers obligatoires en dev : ASan, UBSan, TSan (thread)
- clang-tidy `cert-*` + `security-*` checks
- Jamais de `reinterpret_cast` sans justification documentée
- `std::string_view` plutôt que `const char*` pour les références
- `-fstack-protector-strong`, `-D_FORTIFY_SOURCE=2`

## Performance et Mémoire

- Coroutines (C++20) matures : préférer pour I/O asynchrone
- `constexpr` agressif : calculs à la compilation quand possible
- `std::span` et `std::string_view` : zéro copie pour les vues
- Profiling : perf + flamegraph, Instruments, Tracy (game/realtime)
- `-O2 -march=native` pour la prod ; LTO (`-flto`) pour la taille

## Discipline de modules

- C++20 modules (`import`) si le toolchain le supporte, sinon headers classiques
- Un header = une classe/interface ; implémentation en `.cpp`
- Namespaces alignés sur la structure de dossiers
- `internal` namespace pour le privé, pas de `detail::` hack

## Ce qu'on ne fait plus

- `auto_ptr` (supprimé C++17) → `unique_ptr`
- `std::bind` → lambdas
- Raw `new` / `delete` → smart pointers ou conteneurs
- `volatile` pour la concurrence → `std::atomic`
- Macros pour les constantes → `constexpr`
- `#include` guards manuels → `#pragma once` (supporté partout)

## Gestion d'erreurs

- Exceptions pour les erreurs récupérables, `std::expected` (C++23) pour les retours
- `noexcept` sur les fonctions qui ne lèvent jamais
- Contracts (C++26) : `pre`, `post`, `assert` pour les invariants
- Jamais de `catch(...)` silencieux sauf à la frontière la plus externe

## Tests

- Google Test + Google Mock pour le mocking
- Catch2 : macro-free, BDD-style, approx floats
- Fuzzing : libFuzzer ou AFL++ avec sanitizers
- Benchmarks : Google Benchmark, Catch2 benchmarks
