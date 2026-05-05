---
stack: python
applies_to: ["*.py", "pyproject.toml", "requirements*.txt", "uv.lock"]
loads_from: src/fr/CLAUDE.md §0 (Contexte projet)
---

# Stack — Python

> Satellite chargé conditionnellement si la stack courante contient Python.
> Dernière mise à jour : avril 2026 (Python 3.13+, uv, ruff, free-threaded).

## Principes

- **PEP 8** appliqué par tooling, pas relu à la main (`ruff format`)
- **Typage explicite** : `def fn(x: int) -> str:`, jamais `def fn(x, y):`
  sur du code non-trivial
- **Lisibilité > cleverness** : un `for` explicite bat une compréhension
  imbriquée sur trois niveaux
- **Dataclasses** ou `pydantic` pour les structures, jamais de `dict` opaque
  partagé entre plusieurs fonctions
- **`pyproject.toml`** comme unique fichier de config projet (PEP 621)

## Tooling par défaut

- `uv` pour tout : dépendances, venv, versions Python, scripts (100x pip)
- `ruff` pour lint + format (remplace black + flake8 + isort en un seul binaire Rust)
- `pyright` pour le typage (3-5x plus rapide que mypy) ; `mypy --strict` si legacy
- `pytest` + `pytest-cov` pour les tests ; `hypothesis` pour property-based testing

## Sécurité

- `bandit` en CI : détecte 80% des vulns OWASP Python (YAML-driven depuis 1.8)
- `pip-audit` ou `uv audit` : scan CVE des dépendances
- Jamais de désérialisation non fiable (utiliser JSON, pas de formats binaires opaques)
- `secrets` module pour tokens/clés, jamais `random`

## Performance et Mémoire

- Python 3.13+ free-threaded (expérimental) : vrai parallélisme sans GIL
- PGO (Profile-Guided Optimization) disponible dans CPython 3.12+
- `__slots__` sur les classes instanciées massivement
- Profiling : `cProfile` + `snakeviz`, `memray` pour mémoire

## Discipline de modules

- Un package = un domaine métier
- `__init__.py` minimal : juste les re-exports publics
- Pas de logique d'import-time (I/O, connexions DB) dans les modules
- Structure : `src/`, `tests/`, `pyproject.toml` (layout src)

## Ce qu'on ne fait plus

- `setup.py` comme CLI (utiliser `python -m build` ou `uv build`)
- `virtualenv` package séparé (utiliser `uv venv` ou `python -m venv`)
- `pip install` direct (utiliser `uv pip install` ou `uv sync`)
- `requirements.txt` écrits à la main (utiliser `uv lock` / `uv.lock`)
- `flake8` + `black` + `isort` séparés (utiliser `ruff` seul)

## Gestion d'erreurs

- Exceptions typées spécifiques, jamais de `except Exception` sauf à la
  frontière la plus extérieure
- `logging` avec niveau structuré, jamais `print` en prod
- Context managers (`with`) pour toute ressource (fichiers, connexions, locks)

## Tests

- `pytest` standard universel, `pytest-xdist` pour parallélisation
- Couverture : `pytest-cov` (coverage.py 7.13+)
- Property-based : `hypothesis` pour les edge cases automatiques
- Fixtures modulaires, pas de setup/teardown monolithique
