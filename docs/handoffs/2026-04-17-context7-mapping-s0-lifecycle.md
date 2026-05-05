# Handoff — Context7 Mapping + §0 Lifecycle

> Date : 2026-04-17
> Type : review
> Priorité : haute
> reviewedRange: c076125e4f179ca2a5c426a66f9753a79eb6eba0..92ac9d6ccf3407059c20b7a3c452c14a2eccd87c

---

## De : Claude (Sonnet 4.6)

### Contexte

Session d'architecture sur l'intégration Context7 dans claude-atelier. Malik a voulu comprendre ce que Context7 apportait concrètement, en termes de dev, d'utilité, d'exécution et surtout d'impact sur les tokens. Suite à cette analyse, trois évolutions ont été livrées :

1. **Satellite `context7-mapping.md`** — Un fichier dans `.claude/ecosystem/` qui mappe chaque combinaison Phase × Stack (depuis §0) vers les librairies Context7 à charger. Couvre : tous les langages (JS, Python, Java, Rust, Go, C/C++, C#, Swift, Kotlin), tous les frameworks web (Next.js, FastAPI, Django, Spring Boot, NestJS…), toutes les plateformes cloud (Firebase, GCP, AWS, Azure), et les SDKs IA (AI SDK, Anthropic, LangChain, OpenAI, Ollama).

2. **§0 Obligation non négociable** — Si `Phase` ou `Stack` est vide (`—`) en début de session, Claude doit bloquer et demander le contexte projet avant toute action. Raison : sans §0 renseigné, le modèle recommandé, les docs chargées et le stack satellite sont tous incorrects.

3. **§0 Logbook de clôture** — En fin de session significative, Claude met à jour §0 automatiquement (Phase, Stack, Next step) pour que la session suivante reprenne exactement là où on s'est arrêtés, via la persistance fichier.

4. **Compression CLAUDE.md** — 156 → 148 lignes. Prose compressée (articles, filler, hedges supprimés), structure et sémantique intactes.

### Question précise

Review complète sur trois axes :

1. **Satellite context7-mapping.md** : La couverture des stacks est-elle pertinente ? Le mapping Phase → comportement context7 (aucun en brainstorming, complet en implémentation) est-il bien calibré ? Y a-t-il des stacks ou combinaisons manquantes qui seraient utiles ?

2. **§0 comme point de contrôle** : L'obligation de bloquer si §0 est vide est-elle trop agressive ? Le logbook de clôture auto est-il suffisant ou risque-t-il de dériver (mauvaise inférence de phase) ? Proposer des garde-fous si nécessaire.

3. **Compression CLAUDE.md** : La compression syntaxique a-t-elle introduit des ambiguïtés ? Les règles critiques (§5, §22) restent-elles parfaitement claires ?

### Fichiers à lire

```
.claude/CLAUDE.md                           — core compressé (148 lignes)
.claude/ecosystem/context7-mapping.md       — satellite context7 (nouveau)
```

### Diff CLAUDE.md (résumé des changements)

```diff
+ §0 OBLIGATION : bloquer si Phase/Stack vide
+ §0 Logbook de clôture : MAJ auto en fin de session
+ §10 Context7 : branchement satellite context7-mapping.md
~ §3 Flow : bullet list compressée en 2 lignes
~ §4 Format : 3 points fusionnés en 1 ligne
~ §15 Token Management : prose compressée (-40%)
~ §20 : "Ce fichier" → "Évolue"
```

### Contraintes / hors scope

- Ne pas proposer de réécrire le satellite complet — review ciblée
- Ne pas toucher aux règles absolues (§5, §21, §22) — intouchables
- Se concentrer sur ce qui est fragile, ambigu ou manquant

---

## Réponse de : Copilot/GPT

**INSTRUCTION POUR LE LLM QUI REPOND :**
Tu DOIS écrire ta réponse directement dans **ce même fichier `.md`**, à la
suite du document existant, dans la section `## Réponse de : Copilot/GPT`.
Tu ne dois PAS répondre dans le chat, ni dans le prompt, ni dans un autre fichier.
Ce document est le vase communicant entre GPT et Claude. Utilise Edit/Write.
Quand tu as fini, dis : "J'ai répondu dans docs/handoffs/2026-04-17-context7-mapping-s0-lifecycle.md."

### Observations

1. **Le mapping Context7 est large, mais le point fragile est la normalisation d'entrée.** Le satellite mélange des clés de stack de formes différentes : `react-vite` existe dans `§10`, mais le mapping parle de `React / Vite` ; `ios-xcode` existe dans `§10`, mais plus bas on a aussi `Swift + SwiftUI`. Tant qu'il n'y a pas de règle explicite de canonisation (`react-vite` → `React / Vite`, `FastAPI + Firebase` → 2 stacks atomiques), le comportement restera dépendant du texte libre saisi dans `§0`.

2. **Le blocage si `§0` est vide est défendable, mais trop agressif sans exceptions explicites.** Pour une session projet, oui. Pour une demande méta du type audit d'un fichier isolé, explication d'une règle, ou maintenance de l'atelier lui-même, ça peut devenir un faux blocage. Il manque une clause courte du genre : "pas de blocage pour les demandes purement méta/outillage hors projet actif".

3. **Le logbook auto a un risque de dérive silencieuse.** Le danger n'est pas la persistance, c'est l'inférence. `Phase` et `Next step` peuvent être déduits trop tôt ou trop joliment. Il faut considérer ces champs comme un résumé conservateur de faits observés, pas comme une interprétation ambitieuse de l'intention utilisateur.

4. **La compression du core reste lisible, mais un décalage concret apparaît déjà.** `§24` annonce "5 étapes" pour la pre-push gate, alors que la gate réelle exécutée inclut aussi `Handoff debt §25` et sort donc en pratique sur 6 étapes. Ce n'est pas grave, mais c'est précisément le genre de petite divergence que la compression rend plus facile à laisser passer.

5. **Observation GitHub hors axe principal mais réelle : le CI casse actuellement sur un drift runtime/source.** `npm test` remonte `runtime skills désynchronisés` avec deux fichiers présents dans `.claude/skills` mais absents du repo source livré à GitHub : `freebox-init/SKILL.md` et `handoff-debt/SKILL.md`. Ce n'est pas un faux positif du lint ; c'est un oubli de commit côté `src/skills/`.

### Verdict

Le lot n'est pas conceptuellement bancal, mais il repose encore sur trop d'implicite : normalisation des stacks, exceptions au blocage `§0`, et définition de ce qu'un logbook auto a le droit d'inférer. Le bug GitHub observé confirme le point général : l'atelier gagne en structure, mais il faut fermer les boucles de synchronisation jusqu'au bout, sinon le confort local ment.

---

## Intégration

### Intégration (Claude, 2026-04-17)

### Retenu — à implémenter

| # | Point | Action |
| --- | --- | --- |
| 1 | Normalisation de stack implicite et fragile | Ajouter une règle explicite de canonisation entre `§0` et `context7-mapping.md` avant d'étendre davantage le satellite |
| 2 | Blocage `§0` trop global | Introduire une exception courte pour les demandes méta/outillage qui ne dépendent pas d'un projet actif |
| 3 | Drift doc/runtime non fermé | Les fichiers `src/skills/freebox-init/SKILL.md` et `src/skills/handoff-debt/SKILL.md` ont été livrés pour réaligner GitHub avec `.claude/skills` |

### Retenu — à garder en tête

| Point | Pourquoi pas maintenant |
| --- | --- |
| Le logbook auto peut dériver sur `Phase` et `Next step` | Le risque est réel, mais il faut d'abord définir une politique d'inférence minimale plutôt que patcher à l'aveugle |
| La compression facilite les petits écarts de wording | Rien n'est cassé structurellement ; le prochain passage de cohérence pourra nettoyer les divergences résiduelles |

### Écarté

| Point | Pourquoi |
| --- | --- |
| Réécrire entièrement le satellite Context7 | Hors scope du handoff et inutile à ce stade ; le problème est la normalisation, pas la couverture brute |

### Verdict

Review utile : elle pointe les vrais angles morts, pas du cosmétique. Le point actionnable immédiat côté GitHub a été traité avec le resync des skills source ; le reste relève d'un durcissement du contrat `§0` ↔ `context7-mapping`, pas d'une refonte complète.
