---
stack: javascript
applies_to: ["*.js", "*.jsx", "*.ts", "*.tsx", "*.mjs", "*.cjs"]
loads_from: src/fr/CLAUDE.md §0 (Contexte projet)
---

# Stack — JavaScript / TypeScript

> Satellite chargé conditionnellement si la stack courante contient JS/TS.
> Dernière mise à jour : avril 2026 (TypeScript 6, Biome, Bun, Node.js native TS).

## Principes

- **Fonctions pures** par défaut, side-effects isolés en frontière
- **Immutabilité** : préférer `const` + nouvelles copies à la mutation
- **Typage strict** : zéro `any`, zéro `as unknown as X`, zéro `@ts-ignore`
  sans commentaire justifiant la dette technique
- `map` / `filter` / `reduce` > boucles impératives **quand** la lisibilité
  est au moins égale ; pas de chaînes illisibles pour le principe
- **Zéro `var`**, `let` uniquement si réassignation indispensable
- **ESM only** pour tout nouveau code ; CommonJS = legacy uniquement

## Tooling par défaut

- **Runtimes** : Node.js 22+ (native TS via `--experimental-strip-types`),
  Bun (production-ready, 35% cold start plus rapide), Deno 2 (full npm compat)
- **Package manager** : `pnpm` recommandé (70% moins de disque) ; `bun install` si Bun
- **Bundler** : Vite (consensus) ; Turbopack si Next.js ; Rspack si migration Webpack
- **Lint + Format** : Biome (remplace ESLint+Prettier, 10-25x plus rapide) ;
  ESLint 9 flat config si plugins spécialisés requis
- **TypeScript 6** : 40-60% plus rapide, 25% moins de mémoire

## Discipline de modules

- Un module = une responsabilité
- Exports nommés > export default (refactor-friendly)
- Chemins relatifs courts uniquement ; chemins longs → alias (`@/`)

## Sécurité

- `npm audit` / `pnpm audit` en CI pour les dépendances
- Biome inclut des règles sécurité (injection SQL, XSS)
- CSP headers pour tout frontend ; `DOMPurify` si HTML dynamique

## Performance

- Bun : 110k req/s HTTP (Node.js ~60k) ; cold start 8-15ms
- Vite : démarrage instantané + HMR < 50ms
- `isolatedDeclarations` (TS 5.5+) pour accélérer la génération de `.d.ts`
- TC39 2026 : `Iterator` global, Set methods (union/intersection), `Promise.try`

## Qualité runtime

- Jamais de `console.log` laissé en production → logger structuré
- Erreurs typées : jamais `throw "string"`, toujours une `Error` ou sous-classe
- `Promise.all` pour le parallélisme légitime, `for await` pour le séquentiel
- Gestion d'erreurs : `try/catch` **à la frontière**, pas à chaque ligne

## Ce qu'on ne fait plus

- Jest pour nouveau projet (utiliser Vitest, 3-5x plus rapide, native ESM)
- Webpack comme bundler principal (utiliser Vite ou Turbopack)
- ESLint + Prettier séparés (utiliser Biome seul, sauf plugins ESLint spécialisés)
- CommonJS (`require`) dans du nouveau code (utiliser ESM `import`)
- `npm` workspaces pour monorepos (utiliser pnpm/Yarn Berry + Turborepo)

## Tests

- Unitaires : **Vitest** (natif ESM, API compatible Jest)
- Composants : Testing Library (framework-agnostic)
- E2E : Playwright pour les flows critiques uniquement
- Couverture obligatoire : logique métier, transformations, edge cases
