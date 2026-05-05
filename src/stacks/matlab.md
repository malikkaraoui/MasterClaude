---
stack: matlab
applies_to: ["*.m", "*.mlx", "*.slx", "*.mat"]
loads_from: src/fr/CLAUDE.md §0 (Contexte projet)
figure: Mathilde
---

# Stack — MATLAB

> **Mathilde** 📐 — Le prototypage scientifique, du concept au déploiement.
> Dernière mise à jour : avril 2026 (R2025a, WebGL graphics, MATLAB Copilot).

## Principes

- **Vectoriser** : opérations sur matrices/vecteurs, jamais de boucles `for` sur les éléments
- **Live scripts** (`.mlx`) en format plain-text pour le versioning Git
- **Fonctions > scripts** : chaque calcul réutilisable = une fonction avec signature claire
- **Documentation** : help block en tête de chaque fonction
- **Reproductibilité** : fixer le seed (`rng`), logger les paramètres

## Tooling par défaut

- **IDE** : MATLAB Desktop ou MATLAB Online
- **Versioning** : `.mlx` plain-text (R2025a+) pour Git ; `.mat` en `.gitignore`
- **Packages** : MATLAB File Exchange, Add-On Explorer
- **Code generation** : MATLAB Coder (C/C++), GPU Coder (CUDA)
- **Simulink** : modélisation model-based pour le contrôle et le signal

## Sécurité

- Pas de `feval` / `evalc` avec des chaînes utilisateur
- Données sensibles : ne pas inclure dans les `.mat` partagés
- Crypter les `.p` files pour protéger la propriété intellectuelle
- Valider les inputs des fonctions avec `arguments` block (R2019b+)

## Performance et Mémoire

- **Vectorisation** : 10-100x plus rapide que les boucles élémentaires
- `parfor` pour la parallélisation des boucles indépendantes
- `gpuArray` pour le calcul GPU (deep learning, traitement signal)
- `tall` arrays pour les données trop grosses pour la RAM
- Profiler intégré : `profile on` / `profile viewer`
- **MEX** : fonctions C/C++ compilées pour les hot paths (avec `mex -setup`)

## Discipline de modules

- Un fichier `.m` = une fonction publique (nom fichier = nom fonction)
- Fonctions locales en fin de fichier (pas exportées)
- `+package/` dossiers pour les namespaces
- `@class/` dossiers pour les classes
- Structure projet : `src/`, `test/`, `data/`, `doc/`

## Ce qu'on ne fait plus

- Boucles `for` sur les éléments d'un vecteur (vectoriser)
- Graphics Java-based (utiliser les moteurs WebGL R2025a+)
- Compilation MEX manuelle (utiliser `mex -setup` + configuration automatique)
- Scripts sans fonctions pour du code partagé
- `clear all` en tête de script (utiliser des fonctions avec scope propre)

## Gestion d'erreurs

- `try/catch` avec `MException` objects
- `arguments` block (R2019b+) pour la validation de types/tailles
- `assert()` pour les invariants de développement
- `warning()` pour les conditions non bloquantes, `error()` pour les fatales

## Tests

- **MATLAB Unit Testing Framework** : `matlab.unittest.TestCase`
- `runtests()` pour l'exécution, `CodeCoveragePlugin` pour la couverture
- `verifyEqual`, `verifyError`, `verifyWarning` pour les assertions
- Tolérance numérique : `AbsTol`, `RelTol` sur les comparaisons
