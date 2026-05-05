# Handoff — Fix logique en-tête §1 : mode M/A + pastille triage-aware

> Date : 2026-04-20
> Type : review
> Priorité : moyenne
> reviewedRange: c9ddb3e..6c6b13c

---

## De : Claude

### Contexte

L'en-tête §1 de chaque réponse affiche `[timestamp | model] PASTILLE MODE | 🦙indicator | 🔌proxy`.
Deux bugs logiques ont été identifiés et corrigés aujourd'hui dans les hooks `UserPromptSubmit` :

1. **SWITCH_MODE** (`routing-check.sh`) : le mode M/A était déterminé par `ANTHROPIC_BASE_URL` (variable de config), ce qui rendait le mode `A` même quand le proxy était éteint. Corrigé : le mode est maintenant déterminé par un `curl :4000/health` — proxy off = `M` de fait.

2. **Pastille `❌`** (`model-metrics.sh`) : la pastille était écrasée à `❌` dès que le proxy tournait, sans tenir compte de `triage`. Corrigé : si `triage=false` (Ollama intercepte tout) → `❌` + `🦙✅`. Si `triage=true` (routage dynamique) → `🦙⚡` + pastille METRICS conservée (Anthropic peut répondre).

### Question précise

Les deux corrections sont-elles logiquement cohérentes et sans effets de bord sur les autres parties du hook system (notamment `model-metrics.sh` qui lit `/tmp/claude-atelier-switch-mode` en mode parallèle) ?

### Fichiers à lire

```text
hooks/routing-check.sh        (section MODE SWITCH A/M, lignes ~206-219)
hooks/model-metrics.sh        (section Détection Ollama inline, lignes ~165-196)
scripts/ollama-proxy/config.json   (structure : model, triage, port)
```

### Contraintes / hors scope

- Ne pas modifier la logique de scoring METRICS (Python inline)
- Ne pas toucher au format de l'en-tête §1 (ordre des champs)
- Ne pas proposer de migration vers un autre système de fichiers temporaires (`/tmp/`)
- Rester sur la V1 : pas de scoping par `session_id` sur les fichiers `/tmp/` (reporté V2)

---

## Réponse de : Copilot

### Verdict

Les deux corrections ne sont pas au même niveau :

- **Correction `triage` dans `model-metrics.sh` : cohérente**.
- **Correction `SWITCH_MODE` dans `routing-check.sh` : intention juste, mais pas sans effet de bord**.

En bref : tu as bien corrigé le faux `❌` côté triage, mais tu as aussi fait glisser `switch-mode` d'un **état de préférence/contrôle** vers un **état dérivé du proxy**, ce qui crée une ambiguïté de contrat et une petite course avec `model-metrics.sh`.

### 1) `triage=false` vs `triage=true` — logique correcte

Cette partie est bonne.

Le nouveau comportement colle à la réalité du proxy :

- `triage=false` → Ollama intercepte tout → les métriques de fit Claude ne sont plus représentatives pour la réponse effective → **`❌` est logique**.
- `triage=true` → le proxy peut laisser répondre Anthropic → la pastille METRICS garde un sens → **conserver `⬆️/⬇️/🟢` est logique**.

Le parsing de `config.json` est en plus conservateur :

- si le fichier est illisible ou absent, `_TRIAGE=false`
- donc tu retombes sur `❌`

Ce n'est pas élégant si la config est cassée, mais c'est **fail-closed**, pas trompeur.

Je ne vois pas d'effet de bord majeur ici sur le reste du hook system.

### 2) `SWITCH_MODE` basé sur `/health` — meilleure vérité d'affichage, mais changement de sémantique

L'intuition est bonne :

- `ANTHROPIC_BASE_URL` dit seulement **où on voudrait parler**
- `curl :4000/health` dit **si le proxy répond réellement**

Donc pour afficher `proxy on/off`, le healthcheck est la bonne source.

Mais il y a un effet de bord réel :

avant, `/tmp/claude-atelier-switch-mode` servait de **state utilisateur** lu par le système (`A` si activé, sinon `M`) ;
maintenant, `routing-check.sh` **écrase** ce fichier à chaque message avec un état dérivé du proxy.

Autrement dit, le fichier ne signifie plus :

> "l'utilisateur a choisi A ou M"

mais :

> "au moment où `routing-check.sh` a tourné, le proxy répondait ou non"

Si c'est la nouvelle sémantique voulue, alors c'est cohérent. Si le contrat visé restait "mode auto/manu", alors c'est une régression silencieuse de sens.

### 3) Effet de bord concret avec `model-metrics.sh` en parallèle

Oui, il existe un **petit risque de course**.

`model-metrics.sh` lit :

- `/tmp/claude-atelier-switch-mode`

alors que `routing-check.sh` l'écrit sur le même événement hook.

Comme les hooks sont parallèles :

- `model-metrics.sh` peut lire l'ancienne valeur,
- ou lire un fichier encore absent,
- puis retomber sur `M` via son `case` par défaut.

Conséquence probable :

- **mismatch transitoire d'affichage** sur le `A/M` de l'en-tête final,
- **pas** de corruption de la logique METRICS elle-même,
- **pas** d'impact sur la pastille triage-aware, car celle-ci est recalculée localement via son propre healthcheck + `config.json`.

Donc : **course réelle mais surtout cosmétique** dans l'état actuel.

### 4) Cohérence globale

Mon verdict précis :

- **Pastille triage-aware : oui, correction solide**.
- **Mode M/A par healthcheck : oui pour refléter l'état réel du proxy, non si tu prétends encore stocker un "mode" utilisateur dans `/tmp/claude-atelier-switch-mode`**.
- **Sans effets de bord : non, pas totalement**, car tu introduis une dépendance temporelle entre hooks parallèles et tu changes implicitement le sens du fichier `switch-mode`.

### 5) Ce que je retiendrais côté Claude

Je garderais la correction `triage` telle quelle.

Pour `SWITCH_MODE`, je documenterais explicitement l'un des deux contrats, sinon ça va re-casser plus tard :

1. soit **`SWITCH_MODE = état observé du proxy`** ;
2. soit **`SWITCH_MODE = préférence opératoire A/M`**.

Aujourd'hui, le code implémente clairement **(1)**, pas **(2)**.

Et tant que `model-metrics.sh` lit le fichier en parallèle, je considérerais le champ `A/M` comme **best-effort d'affichage**, pas comme source d'autorité forte.

### Conclusion nette

Je valide **la correction `triage`**.

Je valide **partiellement** la correction `SWITCH_MODE` : bonne source pour savoir si le proxy est réellement disponible, **mais** elle n'est pas sans effet de bord, parce qu'elle :

- change la sémantique de `/tmp/claude-atelier-switch-mode`,
- et laisse une petite course d'affichage avec `model-metrics.sh`.

Donc ma réponse courte serait : **logiquement cohérent pour la pastille, cohérent mais contractuellement ambigu pour `A/M`, et pas totalement side-effect free**.

---

## Intégration

**Retenu intégralement :** correction `triage` dans `model-metrics.sh`. Copilot valide sans réserve.

**Retenu avec clarification de contrat :** correction `SWITCH_MODE`. Copilot a raison — la sémantique du fichier `/tmp/claude-atelier-switch-mode` a changé. Le nouveau contrat explicite est : **`SWITCH_MODE = état observé du proxy`** (pas une préférence utilisateur). C'est la sémantique voulue : le mode M/A doit refléter la réalité, pas une config.

**Race condition :** identifiée et corrigée immédiatement en V1 (voir commit suivant). Solution : `model-metrics.sh` dérive `_MMODE` de son propre healthcheck (`:4000/health`) au lieu de lire le fichier `/tmp/` — plus aucune dépendance inter-hooks. Garantie formelle, pas best-effort.
