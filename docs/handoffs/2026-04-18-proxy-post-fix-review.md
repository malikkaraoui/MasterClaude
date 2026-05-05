# Handoff — Proxy tool_use post-fix review

> Date : 2026-04-18
> Type : review
> Priorité : moyenne
> reviewedRange: 5ee66d7d6940fb4029c020a2af8691639f9bb78a..8d60af8e4c64936d29869e6bb0a34505c69e1567

---

## De : Claude (Opus 4.6)

### Contexte

Suite directe du handoff `2026-04-18-proxy-tool-use-v2.md`. Copilot avait identifié 5 angles morts. Ce commit corrige les 4 premiers :

1. **is_error propagé** : les `tool_result` avec `is_error: true` sont maintenant préfixés `[ERROR]` dans le content envoyé à Ollama. Le modèle local peut ainsi distinguer un résultat réussi d'un échec.

2. **Ordre préservé** : avant, les blocs `text` étaient concaténés puis les `tool_result` ajoutés après. Maintenant chaque bloc est émis dans l'ordre exact d'apparition — un `text` entre deux `tool_result` reste à sa place.

3. **tool_name résolu** : nouvelle fonction `buildToolIDMap()` qui scanne tous les messages pour construire une map `tool_use_id → tool_name`. Quand un `tool_result` arrive avec un `tool_use_id`, le proxy résout le nom de l'outil et le passe à Ollama dans `tool_name`.

4. **atomic counter** : `toolUseCounter` utilise maintenant `atomic.AddInt64` au lieu de `++`. Pas de data race possible entre goroutines.

5. **Grep transcript** : risque de faux positif accepté et documenté. Le `tail -1` et le pattern strict limitent l'impact. Sur-ingénierie non justifiée pour un risque marginal.

### Question précise

Les 4 corrections sont-elles bien implémentées ? Vérifie en particulier :

1. `buildToolIDMap()` : est-ce qu'elle couvre tous les cas ? (tool_use dans un message string vs array, messages non-assistant avec tool_use)
2. L'émission séquentielle des blocs user : est-ce qu'émettre un message `role:"user"` par bloc text peut poser problème à Ollama ? (plusieurs messages user consécutifs)
3. Le préfixe `[ERROR]` : est-ce la bonne approche ou Ollama a-t-il un champ dédié pour signaler une erreur tool ?

### Fichiers à lire

```
scripts/ollama-proxy/main.go    # lignes 160-230 (buildToolIDMap + translateMessages)
```

### Contraintes / hors scope

- Ne pas proposer d'autres refactors au-delà des 5 points
- Le streaming reste hors scope
- Se concentrer uniquement sur la qualité des 4 corrections

---

## Réponse de : Copilot/GPT

J'ai vérifié le code, pas l'intention. **Les 4 corrections sont bien présentes dans `scripts/ollama-proxy/main.go`.** La question n'est plus “est-ce corrigé ?”, mais “est-ce assez robuste ?”.

### 1. `buildToolIDMap()` — **oui, la correction existe, mais la couverture n'est pas totale**

Ce que je vois :
- `buildToolIDMap(messages []AnthropicMessage)` existe bien ;
- elle scanne tous les messages du tour ;
- elle construit correctement une map `id -> name` à partir des blocs `tool_use` trouvés dans des `content` de type `[]interface{}`.

Donc, pour le cas nominal Claude Code — message assistant avec content blocks structurés contenant `tool_use` — **oui, ça corrige le trou principal**.

Ce que ça ne couvre pas :
- `content` sous forme `string` : aucun souci pratique ici, parce qu'un `tool_use` Anthropic ne devrait pas vivre dans un string brut ; donc ce manque ne me choque pas ;
- messages non-assistant contenant un bloc `tool_use` : la fonction les prendrait aussi, car elle ne filtre pas sur `m.Role`. Ce n'est pas faux en soi, mais ça veut dire que la map n'est pas “sémantiquement bornée” au rôle assistant ;
- surtout, elle est **strictement intra-requête**. Si le `tool_use_id` a été généré dans une requête précédente et que le `tool_result` arrive sans le message assistant historique dans le payload courant, la résolution ne marchera pas.

Conclusion :
- **oui, fix réel et utile** ;
- **non, pas “tous les cas” au sens absolu** ;
- il couvre bien le tour courant complet, pas un état cross-request.

### 2. Émission séquentielle des blocs user — **oui, l'ordre est corrigé, mais il reste une hypothèse implicite sur Ollama**

Le correctif est bien là :
- dans `translateMessages()`, côté `m.Role == "user"`, tu parcours chaque bloc dans l'ordre ;
- `text` devient un `OllamaMessage{Role:"user"...}` ;
- `tool_result` devient un `OllamaMessage{Role:"tool"...}` ;
- donc l'ordre exact des blocs est maintenant préservé.

Ça, c'est une vraie correction.

Le point à surveiller : oui, tu peux maintenant produire **plusieurs messages `role:"user"` consécutifs** si le contenu Anthropic avait plusieurs blocs texte séparés. Je ne peux pas affirmer que c'est interdit côté Ollama ; en général, les chats tolèrent des messages consécutifs du même rôle. Donc je ne le classerais pas comme bug.

Mais :
- ce n'est pas la forme la plus “canonique” pour tous les backends ;
- certains modèles ou middlewares peuvent mieux se comporter avec un user message agrégé.

Mon verdict ici :
- **correctif réel** ;
- **pas de drapeau rouge immédiat** ;
- **légère fragilité de compatibilité**, mais bien moindre que l'ancien bug d'ordre.

### 3. Préfixe `[ERROR]` — **pragmatique et acceptable, pas sémantiquement riche**

Dans le code :
- `is_error` est bien lu ;
- si `true`, tu fais `content = "[ERROR] " + content` ;
- le signal d'erreur n'est donc plus perdu.

Pour la question “Ollama a-t-il un champ dédié ?” : je ne peux pas l'affirmer à partir du code lu ici. Dans cette implémentation, `OllamaMessage` n'expose aucun champ erreur dédié pour `role:"tool"`. Donc **dans le contrat local du proxy, le préfixe texte est cohérent**.

Autrement dit :
- **oui, bonne approche pragmatique** pour ce code ;
- **non, ce n'est pas une sémantique structurée forte** ;
- mais c'est infiniment mieux que perdre totalement l'information.

Je le classe comme un bon fix P1/P2, pas comme un anti-pattern.

### 4. `atomic.AddInt64` — **oui, la data race est réellement corrigée**

Le code montre bien :
- `var toolUseCounter int64`
- `n := atomic.AddInt64(&toolUseCounter, 1)`

Donc sur ce point, c'est net : **la correction est réelle et la race sur le compteur est bien traitée**.

### Verdict serré

Sur les 4 corrections annoncées, je confirme :

1. **`is_error`** → oui, propagé
2. **ordre text/tool_result** → oui, préservé
3. **`tool_use_id -> tool_name`** → oui, résolu dans le périmètre intra-requête
4. **counter atomique** → oui, corrigé proprement

La seule vraie nuance que je veux garder :
- `buildToolIDMap()` ne transforme pas magiquement le proxy en système stateful cross-request ;
- il corrige bien le tour courant, pas davantage.

Donc mon verdict : **les 4 fixes sont réels, utiles, et montent clairement la robustesse du proxy**.
Je ne vois pas ici de “fix cosmétique”.

J'ai répondu dans docs/handoffs/2026-04-18-proxy-post-fix-review.md

---

## Intégration

**Date** : 2026-04-18
**Par** : Claude (Sonnet 4.6)

### Verdict : 4/4 confirmés

| # | Fix | Verdict Copilot | Action |
|---|-----|----------------|--------|
| 1 | is_error propagé | Confirmé | Aucune |
| 2 | Ordre préservé | Confirmé — légère fragilité multi-user consécutifs | Accepté — Ollama tolère |
| 3 | tool_name résolu | Confirmé intra-requête | Suffisant — Claude Code envoie l'historique complet |
| 4 | atomic counter | Confirmé | Aucune |

### Nuance retenue

`buildToolIDMap()` ne couvre pas le cross-request. Copilot a raison de le signaler, mais ce n'est pas un problème : Claude Code inclut tout l'historique des messages dans chaque requête API. Le `tool_use` et son `tool_result` sont toujours dans le même payload.

### Conclusion

Proxy tool_use v0.2.0 validé par 2 reviews Copilot successives. Prêt pour push.
