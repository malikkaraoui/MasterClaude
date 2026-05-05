---
stack: rust
applies_to: ["*.rs", "Cargo.toml", "Cargo.lock"]
loads_from: src/fr/CLAUDE.md §0 (Contexte projet)
figure: Roxane
---

# Stack — Rust

> **Roxane** 🦀 — Zéro compromis sur la sûreté.
> Dernière mise à jour : avril 2026 (Edition 2024, async closures, tokio standard).

## Principes

- **Edition 2024** stable (fév 2025) : async closures, or-patterns, array IntoIterator
- **Ownership + Borrowing** : le compilateur est ton allié, pas ton ennemi
- **`unsafe` documenté** : chaque bloc unsafe a un commentaire `// SAFETY:`
- **Erreurs typées** : `Result<T, E>` partout, jamais de `unwrap()` en prod
- **Clippy = loi** : 500+ lints activés, warnings = erreurs en CI
- **Conventions RFC strictes** : `snake_case` modules/fonctions, `UpperCamelCase` types

## Tooling par défaut

- `cargo` pour tout : build, test, bench, publish, audit
- `clippy` pour le lint (intégré cargo)
- `rustfmt` pour le format (intégré cargo)
- `cargo-nextest` : runner de tests 60% plus rapide
- `miri` : détection de comportement indéfini (UB) à l'exécution

## Sécurité

- `cargo-audit` : scan CVE des dépendances (base RustSec)
- `cargo-deny` : licences, advisories, sources autorisées
- `cargo vet` : vérification des crates par des auditeurs de confiance (supply chain)
- `miri` : détection UB dans le code unsafe
- Pas de `unsafe` sans review ; minimiser la surface unsafe
- `#[forbid(unsafe_code)]` sur les crates qui n'en ont pas besoin

## Performance et Mémoire

- Zero-cost abstractions : itérateurs, génériques, traits
- Profiling : `flamegraph` (cargo-flamegraph), `criterion` (benchmarks)
- `DHAT` pour l'analyse heap, `parca` pour le profiling continu
- `#[inline]` avec parcimonie ; laisser LLVM décider sauf hot path prouvé
- Release : `--release` + LTO (`lto = true` dans Cargo.toml)

## Discipline de modules

- Un crate = une responsabilité ; workspace pour les monorepos
- `lib.rs` expose l'API publique, `mod.rs` ou fichier direct pour les sous-modules
- `pub(crate)` par défaut ; `pub` uniquement pour l'API externe
- Nommage crates : `kebab-case` ; modules : `snake_case`

## Ce qu'on ne fait plus

- `unwrap()` / `expect()` en code de production (utiliser `?` ou `match`)
- `.clone()` systématique pour éviter les borrows (résoudre les lifetimes)
- `Box<dyn Error>` partout (utiliser `thiserror` pour libs, `anyhow` pour apps)
- Nightly obligatoire pour un projet (Edition 2024 couvre la plupart des besoins)

## Gestion d'erreurs

- **Bibliothèques** : `thiserror` pour des erreurs typées avec `#[derive(Error)]`
- **Applications** : `anyhow` pour le context wrapping rapide
- **Systèmes complexes** : `snafu` pour des hiérarchies d'erreurs riches
- Pattern : `Result<T, E>` + opérateur `?` + contexte avec `.context("msg")`

## Tests

- `#[cfg(test)]` module dans chaque fichier pour les unit tests
- `tests/` dossier pour les integration tests
- `cargo-nextest` pour l'exécution parallèle
- Property-based : `proptest` ou `quickcheck`
- Fuzzing : `cargo-fuzz` (libFuzzer) pour les parsers et encodeurs
