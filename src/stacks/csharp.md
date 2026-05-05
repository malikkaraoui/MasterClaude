---
stack: csharp
applies_to: ["*.cs", "*.csproj", "*.sln", "*.razor"]
loads_from: src/fr/CLAUDE.md §0 (Contexte projet)
figure: Carmen
---

# Stack — C#

> **Carmen** 🎵 — L'élégance du framework managé.
> Dernière mise à jour : avril 2026 (C# 13, .NET 9, Lock type, AOT natif).

## Principes

- **C# 13 / .NET 9** : `Lock` type pour la synchronisation, params collections, partial properties
- **Async/await partout** : `Task<T>` standard, nom de méthode suffixé `Async`
- **Nullable reference types** activés : `#nullable enable` global
- **Records** pour les value objects et DTOs immutables
- **Pattern matching** pour le control flow (switch expressions, `is` patterns)
- **PascalCase** : classes, méthodes, propriétés, namespaces, membres publics

## Tooling par défaut

- **Build** : `dotnet` CLI (cross-platform), NuGet pour les packages
- **Lint** : Roslyn analyzers + EditorConfig ; SonarC# pour la qualité
- **Format** : `dotnet format` + EditorConfig versionné
- **IDE** : Visual Studio 2026 ou VS Code + C# Dev Kit
- **AOT** : Native AOT pour les microservices (startup < 50ms)

## Sécurité

- Security Code Scan : IntelliSense temps réel + intégration CI
- RetireNET, Audit.NET : scan des dépendances NuGet
- OWASP Dependency-Check : support .NET natif
- `Span<T>` et `stackalloc` plutôt que pointeurs unsafe
- Jamais de concaténation SQL directe (utiliser des requêtes paramétrées)

## Performance et Mémoire

- .NET 9 GC amélioré, native AOT via Trimmed Self-Contained
- `Span<T>`, `Memory<T>`, `stackalloc` pour les allocations zero-heap
- `ref struct` pour les types stack-only haute performance
- `System.Threading.Lock` (C# 13) remplace `Monitor.Enter` pour la synchronisation
- Profiling : dotnet-trace, dotnet-counters, PerfView

## Discipline de modules

- Un fichier = une classe/interface (sauf types imbriqués simples)
- Namespaces alignés sur la structure de dossiers
- `internal` par défaut ; `public` uniquement pour l'API externe
- `_fieldName` pour les champs privés, `s_fieldName` pour les statiques

## Ce qu'on ne fait plus

- .NET Framework (utiliser .NET 6+ LTS)
- `Monitor.Enter` / `lock(obj)` sur object (utiliser `System.Threading.Lock`)
- Manipulation de pointeurs unsafe sauf hot path prouvé
- VB.NET pour les nouveaux projets (utiliser C# exclusivement)
- `Task.Run` pour simuler de l'async (utiliser de vrais appels async)

## Gestion d'erreurs

- Exceptions pour les cas exceptionnels, pas pour le control flow
- `ArgumentException`, `InvalidOperationException` pour la validation
- `ILogger<T>` (Microsoft.Extensions.Logging) structuré
- `Result<T>` pattern pour les opérations qui peuvent échouer normalement

## Tests

- **xUnit** : standard de facto (parallélisation par défaut)
- **FluentAssertions** : assertions en langage naturel (`value.Should().Be(5)`)
- **Moq** : mocking par interfaces
- **Verify** : snapshot testing pour détecter les changements d'API
- Nommage : `MethodName_Should_ExpectedBehavior_When_Condition`
