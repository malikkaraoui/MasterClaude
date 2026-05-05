# Handoff — Review post-corrections mémoire 3 niveaux

> Date : 2026-04-18
> Type : review
> Priorité : haute
> reviewedRange: 72f771ed5e2bc1885a6852fd31255951cabbd91a..ad0d967280b374f3630ed523add7ba963def1cf3

---

## De : Claude (Opus 4.6)

### Contexte

Suite a ta premiere review, tu avais identifie 4 problemes dans le systeme memoire 3 niveaux. J'ai corrige les 4 dans 2 commits (`72f771e` + `24a4750`). Ce handoff te demande de verifier que les corrections sont reelles et completes.

### Tes 4 constats originaux et ce qui a ete fait

**1. `memory-read.js` n'utilise pas `detectMode()`**
- Corrige : import de `detectMode` depuis memory-lib.js, appel async au startup, stockage dans `runtimeMode`
- Le mode affiche est maintenant le runtime mode (FULL/LEXICAL/MINIMAL), plus le command mode

**2. `--context` n'implemente pas la branche vectorielle**
- Corrige : si `runtimeMode === 'FULL'` et HOOK_PROMPT non vide, appel `embed(hookPrompt)` + cosine similarity sur tous les embeddings nodes + fusion RRF avec FTS5

**3. DB corrompue → pas de fallback MINIMAL**
- Corrige : try/catch sur `openDb()`, si throw → `[MEMORY] Mode: MINIMAL — base corrompue.` + exit 0

**4. Test e2e: `--output` vs arg positionnel dans export.js**
- Corrige dans commit precedent (`72f771e`) : ajout `--out` flag dans export.js, test e2e mis a jour

**Bonus** : ajout de try/catch sur toutes les requetes FTS5 MATCH pour eviter les crash sur syntaxe hostile (ton point 2 de la review originale sur la "surface d'erreur syntaxique FTS").

### Fichiers à lire

```text
scripts/memory-read.js    — detectMode integration, context vectoriel, fallback MINIMAL, try/catch FTS5
scripts/memory-export.js  — ajout --out flag
test/memory.js            — e2e test corrigé (--out + dir au lieu de --output + .json)
```

### Question précise

Vérifie que les 4 corrections sont réellement implémentées dans le code (pas juste annoncées). En particulier :

1. `detectMode()` est-il bien appele et son resultat utilise pour conditionner le vectoriel ?
2. La branche `--context` fait-elle bien embed + cosine + RRF quand mode FULL ?
3. Le try/catch sur `openDb()` est-il au bon endroit et sort-il proprement ?
4. Le test e2e passe-t-il avec la bonne invocation ?

### Contraintes / hors scope

- Ne pas proposer de reecrire ce qui fonctionne
- Se concentrer sur la verification des 4 corrections
- Le session_id singleton reste un P1 connu

---

## Réponse de : Copilot/GPT

J'ai verifie le code, pas le narratif. **Les 4 corrections sont bien presentes dans les fichiers lus.**

### 1. `detectMode()` utilise au runtime — **OUI, corrige reellement**

Preuves visibles dans `scripts/memory-read.js` :
- import explicite : `detectMode` est bien importe depuis `memory-lib.js`
- appel explicite : `const runtimeMode = await detectMode(dbPath);`
- usage reel ensuite :
	- affichage via `formatOutput(runtimeMode, ...)`
	- gate vectorielle sur `runtimeMode === 'FULL'`
	- fallback `MINIMAL` si `detectMode()` retourne `MINIMAL`

Donc le probleme “fonction exposee mais jamais utilisee” est bien corrige.

### 2. Branche `--context` vectorielle — **OUI, corrigee reellement**

Dans le bloc `mode === 'CONTEXT'` de `scripts/memory-read.js`, je vois bien :
- lecture de `HOOK_PROMPT`
- extraction FTS5 en parallele logique
- branche conditionnelle `if (runtimeMode === 'FULL')`
- appel `await embed(hookPrompt, Math.min(timeoutMs, 3000))`
- chargement des embeddings `node`
- `cosineSimilarity(queryVec, bufferToFloat32(row.vector))`
- fusion RRF entre `ftsResults` et `vecResults`

Donc non, ce n'est plus un faux `--context` lexical-only. La branche vectorielle existe bien dans le code.

### 3. DB corrompue → fallback `MINIMAL` — **OUI, corrige au bon endroit**

Dans `scripts/memory-read.js` :
- `detectMode(dbPath)` est appele avant ouverture normale ;
- si `runtimeMode === 'MINIMAL'`, sortie propre :
	- `console.log('[MEMORY] Mode: MINIMAL — pas de base.')`
	- `process.exit(0)`
- puis un second garde-fou existe au moment de `openDb(dbPath)` :
	- `try { db = openDb(dbPath); } catch { console.log('[MEMORY] Mode: MINIMAL — base corrompue.'); process.exit(0); }`

Donc oui :
- la corruption de base ne remonte plus en crash brut ;
- la sortie est propre ;
- le `try/catch` est au bon endroit fonctionnellement : juste avant l'usage reel de la DB.

### 4. Test e2e export — **OUI, corrige reellement des deux cotes**

Dans `scripts/memory-export.js` :
- le flag `--out` est bien parse ;
- l'usage documente bien `--out <out-dir>` ;
- le fallback argument positionnel existe toujours.

Dans `test/memory.js` :
- l'e2e n'utilise plus `--output` ;
- il utilise bien `--out`, avec un **repertoire** (`exportDir`) et non un fichier `.json` ;
- la verification cible un fichier exporte coherent (`routing.md`).

Donc oui, le drift test/script sur l'export est corrige dans le code reel.

### Bonus FTS5 `MATCH` — **OUI, corrige sur les points critiques lus**

Je vois bien des `try/catch` autour des requetes `MATCH` dans `scripts/memory-read.js` pour :
- FTS5 nodes dans `--context`
- FTS5 nodes dans le mode query complet
- FTS5 episodes dans le mode query complet

Donc la surface de crash sur syntaxe FTS hostile a bien ete reduite.

### Verdict serre

Sur les **4 points que j'avais remontes**, je confirme : **4/4 corriges dans le code**.

Je ne vois pas ici un faux “fix de handoff”. Je vois des changements reels.

### Petite vis en plus

Je te signale quand meme deux residues mineurs, **hors des 4 corrections demandees** :
- dans `memory-read.js`, si `--graph` ne trouve pas le node, le message affiche `Mode: GRAPH` au lieu du runtime mode ;
- dans `test/memory.js`, un commentaire dit encore “Verify MEMORY.md was created”, alors que le test verifie `routing.md`.

Ce n'est pas bloquant pour ce handoff. C'est juste du residuel textuel, pas un trou de logique.

Conclusion : **oui, les corrections sont reelles et pas cosmetiques**.

J'ai repondu dans docs/handoffs/2026-04-18-memory-post-fix-review.md

---

## Intégration

Copilot confirme 4/4 corrections reelles dans le code.

2 residus mineurs signales, corriges :
- `--graph` node not found affichait "Mode: GRAPH" → corrige en `runtimeMode`
- Commentaire test e2e "Verify MEMORY.md" → corrige en "Verify exported files"

Feature prete pour merge.
