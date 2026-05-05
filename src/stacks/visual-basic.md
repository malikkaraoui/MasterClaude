---
stack: visual-basic
applies_to: ["*.vb", "*.vbproj", "*.bas", "*.frm", "*.cls"]
loads_from: src/fr/CLAUDE.md §0 (Contexte projet)
figure: Violette
---

# Stack — Visual Basic

> **Violette** 💜 — Garder l'héritage vivant, préparer la migration.
> Dernière mise à jour : avril 2026 (VB.NET feature-complete, maintenance only).

## Principes

- **Feature-complete depuis 2020** : Microsoft ne développe plus de nouvelles features VB.NET
- **Maintenance assurée** : patches sécurité et compatibilité .NET continuent
- **Règle absolue** : ne jamais démarrer un nouveau projet en VB.NET
- **Projets existants** : maintenir, sécuriser, planifier la migration vers C#
- **VBA (Office)** : encore pertinent pour l'automatisation Excel/Word/Access

## Tooling par défaut

- **Build** : `dotnet` CLI (VB.NET sur .NET 6+), MSBuild pour legacy
- **IDE** : Visual Studio (support complet VB.NET), VS Code (limité)
- **Lint** : Roslyn analyzers (même que C#, sous-ensemble)
- **Migration** : GAPVelocity VBUC (VB6 → .NET), interop C# + VB dans une même solution

## Sécurité

- Mêmes outils que C# : Security Code Scan, RetireNET
- `Option Strict On` obligatoire (typage implicite = bugs)
- `Option Explicit On` obligatoire (variables non déclarées = chaos)
- VBA : jamais de macros auto-exécutées avec accès réseau/fichiers sans validation

## Performance et Mémoire

- Même runtime .NET que C# : performances identiques une fois compilé
- GC identique à C#, pas de différence runtime
- Le goulot est souvent le legacy code non optimisé, pas le langage

## Discipline de modules

- Un fichier = une classe/module (même convention que C#)
- Namespaces alignés sur la structure de dossiers
- `Friend` (= `internal` en C#) par défaut pour la visibilité
- VBA : un module par domaine fonctionnel, préfixe `mod_` / `cls_`

## Ce qu'on ne fait plus

- Démarrer un nouveau projet en VB.NET (utiliser C# exclusivement)
- Espérer de nouvelles features VB (Blazor, minimal APIs, cloud-native = C# only)
- VB6 en production sans plan de migration
- `On Error Resume Next` (utiliser `Try/Catch` structuré)
- `Variant` type en VBA (typer explicitement)

## Migration vers C#

- **Interop immédiat** : VB.NET et C# coexistent dans la même solution .NET
- **Migration progressive** : nouveaux fichiers en C#, legacy VB maintenu
- **Outils** : GAPVelocity VBUC, Telerik Code Converter, conversion manuelle
- **Priorité** : migrer les modules à forte vélocité de changement en premier

## Gestion d'erreurs

- `Try/Catch/Finally` structuré (pas de `On Error GoTo`)
- Exceptions typées, même pattern que C#
- VBA : `On Error GoTo ErrorHandler` avec un label en fin de procédure

## Tests

- Mêmes frameworks que C# : xUnit, NUnit (VB.NET supporté)
- VBA : Rubberduck (add-in gratuit avec tests unitaires intégrés)
- RD (Rubberduck) Code Inspections pour VBA lint
