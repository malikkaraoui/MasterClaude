---
stack: scratch
applies_to: ["*.sb3", "*.sb2", "*.sprite3"]
loads_from: src/fr/CLAUDE.md §0 (Contexte projet)
figure: Sofia
---

# Stack — Scratch

> **Sofia** 🧩 — Apprendre à penser comme un programme.
> Dernière mise à jour : avril 2026 (Scratch 3.x, TurboWarp, extensions STEM).

## Principes

- **Scratch 3.x** : standard éducatif mondial pour l'initiation à la programmation
- **Nommage descriptif** : `playerScore`, `isJumping` — pas de `x1`, `a`
- **Décomposition** : chaque sprite a une responsabilité claire
- **Messages** (broadcast) pour la communication entre sprites
- **Progression pédagogique** : simple → pratique → projet réel

## Tooling par défaut

- **Éditeur** : scratch.mit.edu (officiel) ou TurboWarp (performance)
- **TurboWarp** : compilation JIT, 10-100x plus rapide que Scratch standard
- **Extensions** : LEGO, micro:bit, capteurs, musique, texte-to-speech
- **Export** : `.sb3` (format standard), conversion vers HTML via TurboWarp Packager
- **Remix** : le partage et la modification sont au cœur de la communauté

## Bonnes pratiques pédagogiques

- **Variables locales** (par sprite) par défaut, globales uniquement si partagées
- **Commentaires** dans les blocs pour expliquer la logique
- **Pas de code dupliqué** : utiliser les blocs personnalisés (Mes Blocs)
- **Un script par comportement** : pas de scripts géants monolithiques
- **Tester souvent** : drapeau vert après chaque modification

## Performance

- TurboWarp pour les projets gourmands (simulations, jeux complexes)
- Limiter le nombre de clones actifs (< 300 pour la fluidité)
- Réduire les costumes/sons non utilisés (taille du projet)
- `turbo mode` (TurboWarp) pour les calculs lourds

## Discipline de projet

- Un sprite = un personnage/objet avec ses propres scripts
- Scène (Stage) pour le décor et la logique globale uniquement
- Conventions de nommage : camelCase pour les variables, descriptif pour les sprites
- Notes de projet : expliquer le fonctionnement et les contrôles

## Ce qu'on ne fait plus

- Scripts monolithiques (> 30 blocs sans découpage)
- Variables nommées `a`, `b`, `temp` (utiliser des noms descriptifs)
- Duplication de blocs identiques entre sprites (extraire en Mes Blocs)
- Scratch 2.x offline pour les nouveaux projets (utiliser Scratch 3 ou TurboWarp)

## Transition vers le code texte

- **Scratch → Python** : transition naturelle (boucles, conditions, variables)
- **Scratch → JavaScript** : pour le web interactif
- Concepts transférables : variables, boucles, conditions, fonctions, événements
- Outils de transition : Snap!, MakeCode, Python Turtle
