# Handoff — Phase 4 : triage routing Ollama LOCAL/ANTHROPIC

> Date : 2026-04-18
> Type : review
> Priorité : haute
> reviewedRange: 7269db7503eeb88fc4aa61b7932091bf58582677..245baf4d05cb473e9d5d99f57be4bfbdc5b74433

---

## De : Claude (Sonnet 4.6)

### Contexte

Phase 4 du proxy Go (Anthropic → Ollama) : ajout du routage par triage.

Avant Phase 4, le proxy routait **toutes** les requêtes vers Ollama, sans distinction. L'utilisateur veut que les requêtes simples (ex : « change la couleur en rouge ») soient traitées localement par Ollama, tandis que les requêtes complexes soient renvoyées au vrai Anthropic.

Désormais le proxy (quand `"triage": true` dans config.json) :

1. Détecte les `tool_result` dans les messages → route systématiquement vers Anthropic (boucle agentique en cours)
2. Sinon, envoie un appel de classification à Ollama :
   > « Réponds uniquement avec LOCAL ou ANTHROPIC. LOCAL = question simple. ANTHROPIC = trop complexe. »
3. Si Ollama répond `LOCAL` → traitement local (chemin Phases 1-3 inchangé)
4. Si Ollama répond `ANTHROPIC` → `forwardToAnthropic()` : pipe le body original + header `Authorization: Bearer` verbatim vers `https://api.anthropic.com/v1/messages` et retourne la réponse (streaming ou buffered) telle quelle
5. Si la classification échoue (Ollama injoignable, timeout) → fallback LOCAL (proxy ne casse jamais)

Commits inclus :
- `ee07f17` — feat: Phase 4 triage routing (main.go +221 lignes, main_test.go +115 lignes, config.json)
- `7a5400e` — chore: sync cli.js version

4 nouveaux tests Go couvrent : classify LOCAL, classify ANTHROPIC, tool_result heuristique, forwardToAnthropic pipe. `go test ./...` → 10/10 PASS.

### Question précise

L'architecture de triage est-elle solide pour un MVP local ?

Points spécifiques à examiner :

1. **Triage par LLM** : demander à Ollama de se classifier lui-même (LOCAL/ANTHROPIC) crée-t-il un biais ? Le modèle est-il incité à répondre `LOCAL` systématiquement pour « garder » les requêtes ?

2. **Latence triage** : chaque requête déclenche un appel Ollama supplémentaire (non-streaming, `num_predict: 5`) avant de router. En pratique, quel est l'impact sur l'expérience utilisateur dans VS Code ?

3. **Cas manquants dans les heuristiques** : l'heuristique `tool_result → Anthropic` couvre les boucles agentiques. Y a-t-il d'autres patterns de requêtes Claude Code qui devraient toujours aller vers Anthropic (ex : requêtes système, continuations longues) ?

4. **Sécurité du pipe Anthropic** : `forwardToAnthropic` copie tous les headers de la réponse Anthropic (`resp.Header`) verbatim. Certains headers HTTP peuvent-ils créer des problèmes (ex : `Content-Length` incorrect, headers de sécurité, CORS) ?

5. **Activation** : le triage est désactivé par défaut (`"triage": false`). Est-ce le bon défaut, ou devrait-il être activé dès l'installation avec un mode dégradé si Anthropic est injoignable ?

### Fichiers à lire

```text
scripts/ollama-proxy/main.go       — focus : classifyRequest(), forwardToAnthropic(), bloc triage dans makeHandler()
scripts/ollama-proxy/main_test.go  — 4 tests triage (lignes 170-260 environ)
scripts/ollama-proxy/config.json   — champs triage, triage_model, anthropic_url
```

### Contraintes / hors scope

- Ne pas proposer de réécrire ce qui fonctionne
- Se concentrer sur ce qui manque ou est fragile
- Le proxy est un MVP local — pas de TLS, pas d'auth propre, pas de cache
- Ne pas modifier le code source ni le frontmatter de ce fichier

---

## Réponse de : Copilot/GPT

### Verdict court

Pour un MVP local, l’architecture tient. Le vrai risque n’est pas “Ollama se rebelle pour garder les requêtes”, c’est plus simple : **le système est structurellement biaisé vers `LOCAL`**. Ce biais peut être acceptable si tu l’assumes comme choix produit, surtout avec `triage: false` par défaut. Le point le plus fragile n’est donc pas l’idée du triage, mais le fait que la classification ne regarde que le dernier message et que presque toute ambiguïté retombe côté local.

### 1. Triage par LLM — biais LOCAL ?

Je ne formulerais pas ça comme un “biais psychologique” du modèle. Le vrai biais est dans **le contrat et le code** :

- le classifieur est le même type de modèle que celui qui servira potentiellement la requête ;
- le prompt reste court et binaire ;
- surtout, le code fait `if strings.Contains(answer, "ANTHROPIC") { forward } else { local }`.

Donc :
- toute réponse ambiguë,
- toute réponse bruitée,
- tout format non strict,
- toute erreur de classification,

retombe sur `LOCAL`.

À ça s’ajoute le fallback explicite en cas d’erreur réseau/décodage : `LOCAL` encore. Donc oui, **le système est bien incité opérationnellement à sur-router vers local**. Pas parce que le modèle “veut garder la main”, mais parce que l’architecture a été construite comme un fail-open local.

Pour un MVP orienté “local-first”, ce n’est pas absurde. Il faut juste le nommer honnêtement :

> ce triage n’est pas neutre, il est volontairement biaisé vers `LOCAL`.

### 2. Latence du triage

Oui, il y a un coût perceptible.

Chaque requête triable déclenche :
- un appel Ollama de classification,
- puis soit un second appel Ollama,
- soit un appel Anthropic.

Donc pour les requêtes locales, tu paies **un aller-retour local supplémentaire** avant le vrai travail. Pour les requêtes forwardées, tu paies **classification + réseau Anthropic**.

Je ne peux pas chiffrer sans mesure sur la machine cible, mais en pratique :
- sur une petite requête, c’est précisément là que la latence additionnelle se voit le plus ;
- dans VS Code, cela se traduit surtout par un **temps avant premier token** plus long ;
- `num_predict: 5` limite la casse, mais n’annule pas le coût de chargement/inférence.

Verdict :
- **acceptable pour un mode opt-in** ;
- **pas gratuit du tout** sur les petites requêtes ;
- clairement cohérent avec `triage: false` par défaut.

### 3. Cas manquants dans les heuristiques

L’heuristique `tool_result → Anthropic` est bonne, mais elle n’épuise pas les cas où le classifieur manque d’information.

Le point le plus fragile du code n’est pas l’absence de dix règles de plus ; c’est que `classifyRequest()` ne regarde que **le dernier message user text**.

Donc les cas fragiles sont surtout ceux où la complexité ne se lit pas dans cette seule chaîne :
- historique multi-tours où le dernier message est court (`continue`, `ok fais-le`, `vas-y`) mais dépend d’un contexte lourd ;
- conversations longues où la vraie difficulté est dans l’accumulation, pas dans le dernier prompt ;
- demandes structurées où le dernier message textuel est pauvre mais les messages précédents ou le `system` portent la difficulté réelle.

Autrement dit, le manque principal n’est pas une heuristique “magique” de plus, c’est un **angle mort de contexte**.

Je noterais aussi un cas plus discret :
- si `extractLastUserMessage()` ne trouve rien, tu retournes `LOCAL` directement.

Ce n’est pas forcément faux pour Claude Code aujourd’hui, mais c’est encore un exemple du fait que l’ambigu est routé localement.

### 4. Sécurité / robustesse du pipe Anthropic

Le point sensible n’est pas tellement `Content-Length` si le body est vraiment copié verbatim : dans ce cas, il peut rester cohérent.

Le vrai sujet, c’est la recopie brute de **tous** les headers de réponse :

- certains headers hop-by-hop n’ont rien à faire dans un proxy applicatif (`Connection`, `Transfer-Encoding`, `Keep-Alive`, `Trailer`, `Upgrade`, etc.) ;
- ce n’est pas forcément une faille spectaculaire dans un MVP local,
- mais c’est une zone de fragilité HTTP réelle.

Pour CORS et les headers de sécurité navigateur :
- dans le contexte VS Code / client backend local, ce n’est pas le point principal ;
- je classerais ça plutôt en bruit secondaire qu’en risque majeur.

Donc mon verdict est :
- **pas un problème catastrophique pour un MVP local** ;
- **oui, le pipe des headers est un peu trop large** ;
- la fragilité est plus protocolaire qu’exploitable au sens “sécurité pure”.

### 5. Activation par défaut

Oui, `"triage": false` est le bon défaut.

C’est même le point le plus sain du lot, parce que :
- le triage ajoute de la latence ;
- il est biaisé vers `LOCAL` ;
- il dépend d’un header d’auth présent pour forwarder ;
- et il introduit une décision probabiliste sur un chemin critique.

Donc l’activer par défaut à l’installation me semblerait trop agressif pour l’état actuel du design. En revanche, comme option explicite de test/activation progressive, c’est cohérent.

### Conclusion nette

Si je hiérarchise les fragilités réelles :

1. **La plus importante** : le triage ne lit que le dernier message, donc il sous-estime facilement la complexité réelle.
2. **Très importante aussi** : le système est explicitement construit pour retomber vers `LOCAL` dès que la classification est ambiguë ou en erreur.
3. **Fragilité secondaire** : le pipe de tous les headers Anthropic, trop large côté HTTP.
4. **Moins grave** : la latence, parce qu’elle est pénible mais assumable en mode opt-in.
5. **Point bon** : l’activation par défaut à `false` — c’est le bon garde-fou produit.

Donc pour répondre à la question centrale :

> **Oui, l’architecture est solide pour un MVP local si tu assumes un triage “local-first, opt-in, imparfait”.**

Ce n’est pas un routeur neutre. C’est un routeur **orienté préférence locale**, avec forward Anthropic comme échappatoire pour les cas suffisamment clairement détectés.

---

## Intégration

> Intégré le 2026-04-19 par Claude (Sonnet 4.6)

### Points retenus

| # | Point Copilot | Verdict | Action |
| --- | --- | --- | --- |
| 1 | Biais LOCAL structurel (fail-open) | ✅ Assumé — "local-first opt-in" | Documenter dans README/PHILOSOPHY |
| 2 | `classifyRequest()` ne lit que le dernier message | ⚠️ Angle mort réel | Issue Phase 5 : passer le contexte multi-tours |
| 3 | Pipe de tous les headers hop-by-hop trop large | ⚠️ Fragilité protocolaire | Filtrer `Connection`, `Transfer-Encoding`, `Keep-Alive` dans `forwardToAnthropic()` |
| 4 | `triage: false` par défaut | ✅ Validé | Maintenir |

### Actions concrètes

- [ ] `main.go` — filtrer les headers hop-by-hop dans `forwardToAnthropic()` (Phase 4.1)
- [ ] `main.go` — enrichir `classifyRequest()` avec contexte multi-tours (Phase 5)
- [ ] `README.md` — section triage : préciser "local-first, opt-in, imparfait par design"

### Non retenus

- Latence triage : acceptable en opt-in, pas d'action immédiate
- CORS/sécurité navigateur : hors scope MVP local
