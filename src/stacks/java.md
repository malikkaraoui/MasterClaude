---
stack: java
applies_to: ["*.java", "pom.xml", "build.gradle", "build.gradle.kts"]
loads_from: src/fr/CLAUDE.md §0 (Contexte projet)
---

# Stack — Java

> Satellite chargé conditionnellement si la stack courante contient Java.
> Dernière mise à jour : avril 2026 (Java 24+, Virtual Threads, Structured Concurrency).

## Principes

- **`Optional<T>` jamais `null`** pour les retours. Un `null` franchi sans
  vérification explicite est un bug qui attend son heure
- **`Consumer` / `Function` / `Supplier` / `Predicate`** pour les APIs
  fonctionnelles ; pas de re-création d'interfaces équivalentes
- **Exceptions toujours loggées** à la frontière métier ; jamais de
  `catch (Exception e) {}` silencieux
- **Immutabilité** : `final` par défaut sur les champs et variables locales
- **Records** pour les DTOs et value objects (Java 16+)
- **Virtual Threads** (Java 21+) pour tout I/O concurrent
- **Pattern Matching** + **Record Patterns** pour le switch/instanceof

## Tooling par défaut

- Maven ou Gradle (hérite de l'existant, pas de migration gratuite)
- `checkstyle` + `spotbugs` + Find Security Bugs pour lint et sécurité
- `jacoco` pour la couverture de tests
- JUnit 5 + AssertJ + Testcontainers pour les tests (pas JUnit 4 sur du code neuf)
- GraalVM native-image pour microservices (startup 100ms vs 3-4s)

## Sécurité

- OWASP Dependency-Check en CI : scan NVD des dépendances
- SpotBugs + Find Security Bugs : 826 signatures de vulns
- JFR (Java Flight Recorder) pour monitoring production
- Jamais de concaténation SQL ou de commandes shell avec input utilisateur

## Performance et Mémoire

- Virtual Threads : 1M+ threads concurrents pour I/O sans overhead
- JEP 491 (Java 24) : plus de pinning sur `synchronized`
- Structured Concurrency (Java 25, JEP 505) : scope tasks liés au parent
- Scoped Values (Java 25, JEP 506) : remplace `ThreadLocal` (thread-safe)
- Profiling : `async-profiler` (low-overhead), JFR events

## Discipline de modules

- Packages par feature, pas par couche technique
- Visibilité minimale : `package-private` par défaut, `public` si justifié
- Pas de circular deps entre packages

## Ce qu'on ne fait plus

- `ReentrantLock` pour monitors (Java 24+ : `synchronized` ne pinne plus)
- Reflection-heavy DI à chaud (compile-time : Micronaut, Quarkus)
- Gestion manuelle de thread pools pour I/O (utiliser Virtual Threads)
- JUnit 4 + Hamcrest (utiliser JUnit 5 + AssertJ)
- `new Thread().start()` (utiliser `Executors.newVirtualThreadPerTaskExecutor()`)

## Gestion d'erreurs

- Exceptions métier = sous-classes explicites de `RuntimeException`
- `try-with-resources` pour toute ressource `AutoCloseable`
- Logger SLF4J + Logback, paramètres structurés (`log.info("user={}", id)`)

## Tests

- JUnit 5 + `@ParameterizedTest` pour le data-driven testing
- Testcontainers : vraie DB/Redis/Kafka en test (pas de mocks DB)
- Testcontainers statiques : start once, réutiliser entre méthodes
- Mockito pour les APIs externes uniquement
