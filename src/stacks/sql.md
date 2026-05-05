---
stack: sql
applies_to: ["*.sql", "*.pgsql", "migrations/", "flyway.conf", "liquibase.*"]
loads_from: src/fr/CLAUDE.md §0 (Contexte projet)
figure: Selma
---

# Stack — SQL

> **Selma** 🗄️ — Les données justes, les requêtes sûres.
> Dernière mise à jour : avril 2026 (SQL:2023, PostgreSQL 17, Flyway/Liquibase).

## Principes

- **Requêtes paramétrées** partout — jamais de concaténation SQL (injection = game over)
- **PostgreSQL 17** recommandé : JSON_TABLE, +35% parallel queries, pgvector amélioré
- **Migrations versionnées** : chaque changement de schéma = fichier numéroté, idempotent
- **EXPLAIN ANALYZE** avant d'optimiser : pas d'optimisation sans données
- **Least privilege** : chaque service a son propre rôle avec permissions minimales
- **Index thoughtful** : un index par pattern de requête fréquent, pas d'indexation aveugle

## Tooling par défaut

- **Migrations** : Flyway (simple, SQL pur) ou Liquibase (rollbacks, preconditions, drift)
- **Tests** : pgTAP pour PostgreSQL, dbmate comme alternative légère
- **Monitoring** : `pg_stat_statements` (identifier les requêtes lentes)
- **Lint** : sqlfluff pour le formatage et les anti-patterns
- **Modélisation** : DBeaver ou pgAdmin pour l'exploration

## Sécurité

- **Requêtes paramétrées / prepared statements** : non négociable
- **RBAC** (Role-Based Access Control) + Row-Level Security (RLS)
- **SCRAM-SHA-256** pour l'authentification PostgreSQL (pas md5)
- **pgAudit** : audit session/object-level pour la traçabilité
- **SSL/TLS** pour le transport ; `pgcrypto` pour les colonnes sensibles
- MySQL 8.0 EOL avril 2026 — planifier la migration

## Performance et Mémoire

- `EXPLAIN ANALYZE` : plan + stats d'exécution réelles
- `pg_stat_statements` : tracking des temps/appels/IO (set `max` à 5000-10000)
- `track_io_timing = on` dans postgresql.conf pour les métriques I/O bloc
- PostgreSQL 17 : parallel queries +35%, VACUUM mémoire optimisé
- Partitionnement : par range/hash/list pour les tables > 10M lignes
- Connection pooling : PgBouncer ou Supavisor

## Discipline de modules

- Un fichier de migration = un changement atomique
- Nommage : `V001__create_users_table.sql` (Flyway) ou changelog XML/SQL
- `UP` et `DOWN` pour chaque migration (rollback possible)
- Séparation DDL (schéma) et DML (données) dans des migrations distinctes
- Schémas PostgreSQL pour isoler les domaines métier

## Ce qu'on ne fait plus

- Concaténation SQL avec des variables utilisateur
- `SELECT *` en production (lister les colonnes explicitement)
- Triggers cascadés complexes (logique métier dans l'application)
- MySQL 8.0 sans plan de migration (EOL avril 2026)
- ORM sans comprendre les requêtes générées (`EXPLAIN` les queries N+1)

## Gestion d'erreurs

- Transactions explicites : `BEGIN` / `COMMIT` / `ROLLBACK`
- `SAVEPOINT` pour les rollbacks partiels dans les transactions longues
- Retry logic côté application pour les deadlocks et timeouts
- Contraintes DB (UNIQUE, CHECK, FK) comme filet de sécurité

## Tests

- **pgTAP** : tests unitaires SQL natifs PostgreSQL
- Migrations testées en CI sur une DB éphémère (Testcontainers ou Docker)
- Seed data reproductible pour les tests d'intégration
- Performance : benchmarks sur des volumes réalistes, pas sur des tables vides
