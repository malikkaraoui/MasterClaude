---
stack: php
applies_to: ["*.php", "composer.json", "composer.lock", "artisan"]
loads_from: src/fr/CLAUDE.md §0 (Contexte projet)
figure: Phoebe
---

# Stack — PHP

> **Phoebe** 🐘 — Le web pragmatique, modernisé.
> Dernière mise à jour : avril 2026 (PHP 8.4, property hooks, Pest, PHPStan + Psalm).

## Principes

- **PHP 8.4** : property hooks (`get`/`set`), asymmetric visibility (`public private(set)`)
- **Strict types** : `declare(strict_types=1)` en tête de chaque fichier
- **PSR-12** pour le style, **PSR-4** pour l'autoloading
- **Fat Models, Skinny Controllers** : logique métier dans les modèles
- **Typage complet** : paramètres, retours, propriétés — zéro `mixed` sauf API externe
- **Immutabilité** : `readonly` sur les propriétés qui ne changent pas après construction

## Tooling par défaut

- **Packages** : Composer 2.7+ (lockfile obligatoire)
- **Lint types** : PHPStan (niveau max) pour la correction de types
- **Lint sécurité** : Psalm avec taint analysis (injection SQL, XSS, commandes)
- **Format** : PHP CS Fixer ou Pint (Laravel)
- **Framework** : Laravel (39-64% marché, rapid dev) ou Symfony (modulaire, enterprise)

## Sécurité

- **Psalm taint analysis** : détecte les injections SQL, XSS, commandes en CI
- PHPStan ne détecte PAS les failles sécurité — utiliser Psalm en complément
- Composer `audit` : scan des CVE dans les dépendances
- Paramètres PDO bindés, jamais de concaténation SQL
- CSRF tokens sur tous les formulaires ; htmlspecialchars sur les sorties

## Performance et Mémoire

- OPcache activé en production (obligatoire)
- `preload.php` pour charger les classes fréquentes au démarrage
- Swoole / FrankenPHP pour le mode long-running (pas de cold start)
- PHPStan 2.1+ : 25-40% plus rapide, 50-70% moins de mémoire

## Discipline de modules

- Un fichier = une classe, namespace = dossier (PSR-4)
- Services injectés par le container DI du framework
- Repository pattern pour l'accès aux données
- `final` par défaut sur les classes non destinées à l'héritage

## Ce qu'on ne fait plus

- Composer sans lockfile (composer.lock est obligatoire)
- Getter/setter boilerplate (utiliser property hooks PHP 8.4)
- `@` error suppression operator
- `global` variables
- `mysql_*` functions (supprimées depuis PHP 7.0)
- Inclure des fichiers avec `include`/`require` pour le routing

## Gestion d'erreurs

- Exceptions typées : `DomainException`, `InvalidArgumentException`, customs
- Handler global pour les erreurs non attrapées (Whoops en dev, logger en prod)
- `set_error_handler` pour convertir les warnings en exceptions
- Monolog pour le logging structuré

## Tests

- **Pest** : testing moderne (syntax fonctionnelle, parallèle, watch, snapshots)
- **PHPUnit** : mature, compatible Pest (pas besoin de réécrire)
- `--parallel` pour accélérer ; `--profile` pour identifier les tests lents
- Factories (Laravel) ou Fixtures (Symfony) pour les données de test
