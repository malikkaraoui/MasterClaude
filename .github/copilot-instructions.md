# Instructions pour GitHub Copilot PR Reviewer

## Identification obligatoire

Commence TOUJOURS ta review par une ligne au format suivant (remplace le placeholder par ton nom de modèle réel) :

```
> Reviewer: GitHub Copilot — model: gpt-4o
```

Exemples valides : `gpt-4o`, `gpt-4.5`, `o3-mini`, `o1`. Si ton nom de modèle est inconnu, écris `model: unknown` — ne saute pas cette ligne.

## Contexte du projet

Ce repo est un framework de configuration Claude Code (`claude-atelier`).
Il contient : hooks shell, skills slash-commands, satellites Markdown, scripts Node.js, proxy Go/Ollama.

**Stack principale** : Node.js (hooks/scripts) + Go (ollama-proxy) + Bash (gate scripts)

## Ce que tu dois vérifier

### Priorité haute

1. **Bugs logiques** : conditions inversées, edge cases non couverts, race conditions
2. **Sécurité** : injection de commandes bash, secrets exposés, paths non échappés
3. **Cohérence** : les deux copies `src/skills/` et `.claude/skills/` doivent être identiques
4. **Validate-handoff** : les champs JSON doivent respecter le schéma de `test/validate-handoff.js`

### Priorité normale

5. **Compatibilité macOS** : `xargs -d` est GNU-only → préférer `while IFS= read -r`
6. **Shellcheck** : scripts bash conformes (severity ≥ warning)
7. **Cohérence FR** : commits en français, commentaires en français

### Ne pas signaler

- Style purement cosmétique sans impact fonctionnel
- Suggestions d'ajout de features hors scope de la PR
- Reformulations pédagogiques de code lisible

## Format des commentaires

Pour chaque bug, donne :
1. Ce qui est faux (1 phrase)
2. Pourquoi ça casse (impact concret)
3. Le fix exact (bloc de code ou suggestion inline)

Ne pas écrire de longues introductions. Aller droit au but.
