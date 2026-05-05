---
stack: perl
applies_to: ["*.pl", "*.pm", "*.t", "cpanfile", "Makefile.PL"]
loads_from: src/fr/CLAUDE.md §0 (Contexte projet)
figure: Perla
---

# Stack — Perl

> **Perla** 🐪 — Le couteau suisse du texte et du système.
> Dernière mise à jour : avril 2026 (Perl 5.40+, Moo/Moose, Test2, CPAN actif).

## Principes

- **`use strict; use warnings;`** en tête de chaque fichier — non négociable
- **Perl moderne** : Moo/Moose pour l'OO, pas de bless {} brut
- **CPAN** : ne pas réinventer, chercher d'abord sur MetaCPAN
- **Regex maîtrisées** : commentées avec `/x`, pas de one-liners cryptiques
- **Encore pertinent** : DevOps, sysadmin, bioinformatique, finance, traitement texte
- **`my`** pour tout : pas de variables globales implicites

## Tooling par défaut

- **Packages** : `cpanm` (cpanminus) pour installer, `cpanfile` pour déclarer
- **Build** : ExtUtils::MakeMaker ou Dist::Zilla pour la distribution
- **Lint** : Perl::Critic pour les bonnes pratiques (niveaux 1-5)
- **Format** : perltidy avec `.perltidyrc` versionné
- **Debug** : `perl -d`, Devel::NYTProf pour le profiling

## Sécurité

- Taint mode (`-T`) pour les scripts qui traitent des inputs externes
- Jamais d'interpolation directe dans les commandes système (utiliser `system LIST`)
- `DBI` avec placeholders pour SQL, jamais de concaténation
- Vérifier les dépendances CPAN : `cpan-audit`

## Performance et Mémoire

- Devel::NYTProf : profiling ligne par ligne (HTML report)
- `Moo` compile 10x plus vite que `Moose` (même API, sous-ensemble)
- `Type::Tiny` : contraintes de types rapides, compatibles Moo/Moose
- Références pour éviter les copies de grosses structures
- XS (C binding) pour les hot paths critiques

## Discipline de modules

- Namespace : `Package::SubPackage::Module` (un par fichier)
- `lib/` pour les modules, `t/` pour les tests, `bin/` pour les scripts
- Exporter uniquement le nécessaire (`@EXPORT_OK`, jamais `@EXPORT`)
- POD (Plain Old Documentation) pour la doc dans le fichier

## Ce qu'on ne fait plus

- Variables globales sans `my`/`our`
- `bless {}` brut pour l'OO (utiliser Moo ou Moose)
- `#!/usr/bin/perl` sans `use strict; use warnings;`
- `eval STRING` pour attraper les erreurs (utiliser `eval BLOCK` + `$@`)
- Formats Perl (`format`/`write`) — utiliser des modules de templating

## Gestion d'erreurs

- `eval { ... }; if ($@) { ... }` pour le try/catch natif
- `Try::Tiny` ou `Syntax::Keyword::Try` pour une syntaxe propre
- `Carp` : `croak` au lieu de `die` dans les modules (meilleur stacktrace)
- Exceptions objet avec `Throwable` ou classes custom

## Tests

- **Test2::V0** : framework moderne, remplace Test::More/Test::Simple
- Convention : `t/*.t` fichiers, `prove` pour l'exécution
- `Test2::Tools::Compare` pour les assertions structurées
- Couverture : `Devel::Cover` + rapport HTML
