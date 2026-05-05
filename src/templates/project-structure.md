---
kind: template
name: project-structure
loads_from: src/fr/CLAUDE.md §9
---

# Template — Structure de projet recommandée

> Template optionnel, chargé à la demande. C'est une **convention par défaut**,
> pas une règle absolue. Un projet peut légitimement en dévier pour des
> raisons métier — dans ce cas, documenter le choix dans son propre `CLAUDE.md` §0.
>
> Source historique : §9 de `CLAUDE-core.md` (P1).

## Arborescence type

```text
/core       → logique métier pure, sans I/O, testable sans mocks
/modules    → fonctionnalités isolées, composables
/services   → I/O, APIs, infra (DB, HTTP, filesystem, cloud)
/utils      → helpers réutilisables (pas de logique métier)
/tests      → couverture métier (peut aussi être co-localisée)
```

## Règles d'affectation

- **Logique réutilisée ≥ 2 fois** → `/core` ou `/utils` selon qu'il s'agit
  de métier ou d'utilitaire générique
- **Un I/O = un service** dédié, jamais mélangé à du métier
- **Pas de dépendance** de `/core` vers `/services` (flèche inversée possible
  via injection, jamais par import direct)

## Principes architecturaux

- **Composition > héritage** : interfaces + implémentations, pas de hiérarchies
  profondes
- **Injection de dépendances** : les services sont fournis depuis l'extérieur,
  jamais instanciés à l'intérieur du métier
- **Pas de monolithes** : un module qui dépasse ~500 lignes est un signal pour
  découper

## Quand ne pas utiliser ce template

- Projets mono-fichier ou < 10 fichiers : overkill
- Frameworks opinionnés qui imposent leur propre structure (Next.js, Rails,
  Django, Spring Boot…) : suivre la convention du framework
- Monorepos multi-packages : chaque package a sa propre structure interne
