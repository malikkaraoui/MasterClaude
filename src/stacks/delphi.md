---
stack: delphi
applies_to: ["*.pas", "*.dpr", "*.dpk", "*.dfm", "*.lfm", "*.lpr"]
loads_from: src/fr/CLAUDE.md §0 (Contexte projet)
figure: Daphné
---

# Stack — Delphi / Object Pascal

> **Daphné** 🏛️ — Le RAD qui traverse les décennies.
> Dernière mise à jour : avril 2026 (Delphi 13 Florence, Lazarus 4.6, FreePascal 3.2.4).

## Principes

- **Embarcadero Delphi 13** (commercial) ou **Lazarus 4.6** (open source, Delphi-compatible)
- **Noms de units uniques** dans tout le projet (contrainte compilateur)
- **Interfaces** pour le découplage : pas de dépendances concrètes entre couches
- **RAII via interfaces** : les interfaces sont reference-counted (ARC automatique)
- **Style Guide Embarcadero** (2025) : indentation, nommage, cohérence

## Tooling par défaut

- **IDE** : RAD Studio (Delphi) ou Lazarus IDE (open source)
- **Compilateur** : Delphi compiler ou FreePascal 3.2.4
- **Packages** : boss ou MultiInstaller (installation depuis Git repos)
- **Debug** : débuggeur intégré RAD Studio / Lazarus, breakpoints conditionnels
- **Cross-platform** : FMX (FireMonkey) pour Windows, macOS, iOS, Android

## Sécurité

- Paramètres SQL bindés via les composants DB (pas de concaténation)
- `SecureZeroMemory` pour effacer les buffers sensibles
- Validation des inputs dans les formulaires (events `OnValidate`)
- HTTPS obligatoire pour les composants réseau (Indy, REST client)

## Performance et Mémoire

- **ARC** (Automatic Reference Counting) sur les plateformes mobiles
- **Gestion manuelle** sur Windows (Create/Free) : toujours `try/finally`
- `TStringBuilder` pour les concaténations en boucle (pas de `+` sur strings)
- FastMM4 : gestionnaire mémoire optimisé (détection fuites en debug)
- Profiling : AQtime, Sampling Profiler, ou instrumentation manuelle

## Discipline de modules

- `.dpr` = programme principal, `.pas` = units (modules)
- `uses` uniquement dans l'`interface` si nécessaire ; préférer `implementation`
- Un formulaire = un `.dfm`/`.lfm` + un `.pas`
- Séparer logique métier des formulaires (MVP / MVVM pattern)

## Ce qu'on ne fait plus

- `with` statement (masque la portée, source de bugs subtils)
- `Halt` / `Exit` sans cleanup (toujours `try/finally`)
- Composants BDE (Borland Database Engine) — obsolètes depuis des années
- Delphi 7 en production sans plan de migration
- `AnsiString` pour les nouvelles applications (utiliser `string` = UnicodeString)

## Gestion d'erreurs

- `try/except` pour les erreurs récupérables
- `try/finally` pour le cleanup des ressources (obligatoire sans ARC)
- Exceptions typées : `EInvalidArgument`, `EDatabaseError`, customs
- `raise` pour relancer, jamais d'exception silencieuse

## Tests

- **DUnitX** : framework de tests unitaires open source (Win32, Win64, macOS, Linux)
- **DUnit** : legacy, encore fonctionnel pour les anciens projets
- `[Test]` attributs pour marquer les méthodes de test
- Setup/Teardown pour l'initialisation/cleanup des fixtures
