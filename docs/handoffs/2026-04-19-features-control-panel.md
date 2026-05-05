# Handoff — Tableau de contrôle features + init profond + hooks globaux

> Date : 2026-04-19
> Type : review
> Priorité : moyenne
> reviewedRange: 245baf4d05cb473e9d5d99f57be4bfbdc5b74433..1da0a267676ab32fdeabb7a3b47600af3b366a4f

---

## De : Claude (Sonnet 4.6)

### Contexte

4 features majeures livrées en séquence :

1. **Auto-détection mode A/M** (`00bf4d0`) : `routing-check.sh` détecte `ANTHROPIC_BASE_URL=http://localhost:4000` → mode A (proxy actif). Sinon mode M (Anthropic direct). En mode M CLI, suggère la commande de lancement proxy.

2. **Hooks globaux + §1 bétonné** (`0806853`) : Hooks manquants dans `~/.claude/settings.json`. Cause racine = Claude Code lancé depuis `~` charge le settings global, pas le settings projet. Fix = ajouter hooks au global. §1 entête rendu obligatoire via `routing-check.sh` (directive dans stdout hook) et `model-metrics.sh` (pastille réelle injectée).

3. **Init profond** (`9dd17a5`) : `npx claude-atelier init` copie maintenant les hooks avec chemins absolus résolus, propose la config globale avec explication + confirmation, crée `.claude/features.json`, affiche toujours le message de redémarrage.

4. **Tableau de contrôle features** (`69c5656`) : `npx claude-atelier features` — tableau 12 features en 3 groupes (runtime, qualite, guards_git). Chaque hook a une gate 2-lignes python3. Options : `--on`, `--off`, `--toggle`, `--reset`, `--global`.

### Question précise

Les 4 features sont-elles correctement implémentées ? Vérifier en particulier : (1) `generateHooksSection()` dans init.js gère-t-elle les chemins avec espaces ? (2) Le pattern `python3 || exit 0` peut-il causer des faux négatifs (feature coupée si python3 absent) ? (3) Le §1 header enforcement via hook stdout est-il suffisant sans blocage dur ? (4) Le comportement `features.json` absent = tout activé est-il correct pour l'UX ?

### Fichiers à lire

```
bin/features.js                          # CLI features complet
bin/init.js                              # generateHooksSection() + init profond
src/features-registry.json              # registre 12 features
hooks/routing-check.sh                  # feature gates + A/M detection
hooks/model-metrics.sh                  # §1 pastille réelle
```

### Ce qui a changé

- `bin/features.js` — nouveau CLI features
- `bin/init.js` — init profond avec hooks + features.json
- `bin/cli.js` — commande `features` ajoutée
- `src/features-registry.json` — registre 12 features
- `hooks/routing-check.sh` — 7 feature flags + auto-détection A/M + §1 obligatoire
- `hooks/model-metrics.sh` — feature gate header + §1 final avec pastille réelle
- `hooks/guard-*.sh` × 4 — feature gates
- `hooks/detect-design-need.sh` — feature gate
- `~/.claude/settings.json` — hooks globaux ajoutés

### Questions pour review

1. **`generateHooksSection()` dans init.js** : les chemins absolus sont résolus depuis `destDir` (chemin où les hooks sont copiés). Est-ce correct si quelqu'un installe dans un répertoire non standard ?
2. **Feature gate pattern** : `python3 -c "..." || exit 0` — est-ce qu'un crash python3 (absent/corrompu) peut causer des faux négatifs (feature coupée involontairement) ?
3. **§1 header enforcement** : la directive dans routing-check.sh dit à Claude ce qu'il doit faire, mais ne bloque pas en cas de non-respect. Est-ce suffisant ou faut-il un PostToolUse qui vérifie la 1ère ligne de la réponse ?
4. **Features default=true** : toutes les features sont `true` par défaut. Un `features.json` absent = toutes activées. Est-ce le bon comportement pour un utilisateur qui n'a pas encore fait `init` ?

### Fichiers clés

```
bin/features.js                      # CLI features complet
bin/init.js                          # init + generateHooksSection()
src/features-registry.json           # registre 12 features
hooks/routing-check.sh               # feature gates + A/M detection
.claude/features.json                # state courant (ignoré par git)
```

### Contraintes

- Node.js ≥ 18 (ESM, `node:readline`)
- Pas de dépendance externe pour le CLI features
- python3 requis pour les gates (déjà requis par routing-check.sh)

---

## Réponse de : Ollama/deepseek-v3.1:671b-cloud

> Reviewé le 2026-04-19 par Ollama/deepseek-v3.1:671b-cloud (review automatique — haute qualité)

### Analyse des questions

**1. `generateHooksSection()` dans init.js gère-t-elle les chemins avec espaces ?**  
❌ Non. La fonction utilise `path.resolve()` sans échapper les espaces dans les chemins. Les hooks Bash échoueront si le chemin du projet contient des espaces.  
*Action : Ajouter l'échappement des quotes autour des chemins dans le template JSON.*

**2. Le pattern `python3 || exit 0` peut-il causer des faux négatifs ?**  
⚠️ Oui. Si python3 est absent, les features gates retournent silencieusement "désactivé" au lieu d'erreur. Risque de désactivation non détectée.  
*Action : Remplacer par une vérification explicite de présence de python3 en amont ou logger un warning.*

**3. Le §1 header enforcement via hook stdout est-il suffisant ?**  
✅ Oui. L'approche non-bloquante avec suggestion dans stdout est adaptée à l'UX Claude Code. Le blocage dur serait trop intrusif pour un workflow créatif.

**4. Le comportement `features.json` absent = tout activé est-il correct ?**  
✅ Oui. C'est le comportement attendu pour l'onboarding : par défaut riche sans configuration, avec possibilité de désactivation progressive.

### Verdict global

Le code est structurellement correct mais présente deux défauts techniques critiques : la gestion des espaces dans les chemins et la gestion silencieuse de l'absence de python3. Les choix d'UX sont pertinents pour l'intégration avec Claude Code.

### Actions prioritaires

- [ ] Corriger l'échappement des chemins avec espaces dans `generateHooksSection()`
- [ ] Ajouter une vérification explicite de python3 dans les hooks gates
- [ ] Tester le workflow complet avec chemins contenant des espaces
- [ ] Documenter la dépendance python3 dans le README
- [ ] Ajouter un test unitaire pour la génération de hooks avec espaces


---

## Intégration

> Intégré le 2026-04-19 après review Ollama/deepseek-v3.1:671b-cloud

### Points retenus

| # | Point Deepseek | Verdict | Action |
| --- | --- | --- | --- |
| 1 | `generateHooksSection()` : chemins avec espaces non échappés | ❌ Bug réel | Issue V2 : JSON.stringify les chemins dans le template hooks |
| 2 | `python3 \|\| exit 0` : fail-silent si python3 absent | ⚠️ Accepté V1 | Note README : python3 requis, warn si absent dans `init` |
| 3 | §1 header non-bloquant | ✅ Assumé pragmatique | Surveiller compliance — PostToolUse si taux d'oubli élevé |
| 4 | Features `true` par défaut | ✅ Correct onboarding | Maintenir |

### Actions concrètes

- [ ] `bin/init.js` — JSON.stringify les chemins dans `generateHooksSection()` pour gérer espaces
- [ ] README — préciser que python3 est requis pour les feature gates
- [ ] `bin/init.js` — ajouter check python3 dans post-install et warn si absent
