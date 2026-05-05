---
stack: react-vite
applies_to: ["vite.config.*", "src/**/*.jsx", "src/**/*.tsx"]
loads_from: src/fr/CLAUDE.md §0 (Contexte projet)
status: stub
---

# Stack — React + Vite

> 🚧 **Stub P2.** Contenu détaillé à livrer en P3.
>
> Ce fichier existe pour réserver la place et valider l'architecture de
> chargement conditionnel. Pas encore de règles exploitables.

## Périmètre prévu (P3)

- Conventions composants fonctionnels (zéro class component)
- Hooks règles (`eslint-plugin-react-hooks`)
- State management : local d'abord, Zustand / Jotai si justifié
- Structure de dossiers `src/features/` vs `src/components/`
- Vite config : alias, env vars, build targets
- Tests : Vitest + Testing Library
- Accessibilité de base (aria, focus, contraste)
- Perf : memo, lazy, suspense, code splitting
