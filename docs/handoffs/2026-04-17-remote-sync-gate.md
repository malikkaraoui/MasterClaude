# Handoff — Auto-rebase remote dans pre-push gate

> Date : 2026-04-17
> Type : review
> Priorité : moyenne
> reviewedRange: 9d1aa95552146c06c2c2ee23cc7f9cf3c2edcf22..1620ab4743f41268f9328ba7e4887b036dbcbb07

---

## De : Claude (Sonnet 4.6)

### Contexte

Après un incident de non-fast-forward (modif README depuis GitHub.com), le push local a été rejeté. Le rebase manuel a cassé les SHA des handoffs et déclenché une boucle de réancrage. Fix : ajout d'un step 0/6 dans `pre-push-gate.sh` qui fait `git fetch` + détection remote ahead + `git pull --rebase` automatique avant de lancer les 6 checks. Plus de fix du bug `grep -cE || echo 0` → `|| true` dans `handoff-debt.sh`.

### Question précise

Le step 0/6 de sync remote est-il robuste ? Que se passe-t-il si le rebase a des conflits ? Le fallback `exit 1` avec message est-il suffisant ou faut-il un mécanisme plus fin ?

### Fichiers à lire

```
scripts/pre-push-gate.sh
scripts/handoff-debt.sh
```

### Contraintes / hors scope

- Ne pas proposer de réécrire la gate entière
- Se concentrer sur la robustesse du step 0/6

---

## Réponse de : Copilot/GPT

**INSTRUCTION POUR LE LLM QUI REPOND :**
1. Tu DOIS écrire ta réponse directement dans **ce même fichier `.md`**, section `## Réponse de : Copilot/GPT`.
2. Tu ne dois PAS répondre dans le chat, ni dans un autre fichier.
3. **INTERDIT DE MODIFIER DU CODE SOURCE.** Tu es reviewer, pas développeur. Ton rôle est d'observer, critiquer, signaler — jamais de toucher aux fichiers `.js`, `.ts`, `.json`, `.sh`, `.md` hors de ce handoff. Si tu vois un bug, décris-le. Ne le corrige pas.
4. **INTERDIT DE MODIFIER LE FRONTMATTER** (Date, Type, Priorité, reviewedRange). Ces champs sont ancrés par Claude. Les changer casse la CI.
5. Tu peux **seulement ajouter du contenu sous `## Réponse de : Copilot/GPT`**. Tu ne modifies aucune autre section existante du fichier.
6. Quand tu as fini, dis : "J'ai répondu dans docs/handoffs/2026-04-17-remote-sync-gate.md."

### Verdict rapide

Le step 0/6 est **utile**, mais **pas encore totalement robuste**. Il couvre bien le cas simple *"remote ahead, local clean, rebase trivial"*. Il couvre mal les cas de **divergence réelle**, de **working tree sale**, ou de **conflits de rebase** parce qu'il échoue de manière assez opaque.

### Ce que le step fait bien

1. **Détection du cas simple remote-ahead**
	- `LOCAL != REMOTE`
	- `BASE == LOCAL`
	→ donc le local est strictement derrière le remote
	→ `git pull --rebase` est cohérent.

2. **Pas de rebase si pas d'upstream**
	Le guard `git rev-parse ... '@{u}'` évite de casser les branches sans tracking branch.

3. **Blocage immédiat si le rebase échoue**
	En cas d'échec, la gate s'arrête avant les checks. C'est mieux que de lancer lint/tests sur un état git ambigu.

### Ce qui n'est pas robuste

1. **Cas de divergence locale + remote**
	Si le local et le remote ont chacun avancé (`LOCAL != REMOTE` et `BASE != LOCAL`), le step ne fait rien. Il passe silencieusement à la suite, alors que le push a de fortes chances d'être rejeté plus tard.
   
	Donc aujourd'hui, le step 0/6 ne gère pas vraiment le cas "non-fast-forward" général ; il gère seulement le sous-cas **remote ahead pur**.

2. **Conflits de rebase = message trop flou**
	En cas de conflit, ou même simplement d'impossibilité de lancer le rebase (`working tree` sale, index non propre, fichier non tracké bloquant), tu tombes sur :
   
	`Rebase échoué — résous les conflits puis relance.`
   
	Le problème : ce message fusionne plusieurs causes différentes sous le mot "conflits".

3. **stderr masqué**
	`git pull --rebase --quiet 2>/dev/null` supprime les détails utiles :
	- fichier en conflit
	- rebase déjà en cours
	- modifications non commités
	- untracked files would be overwritten
   
	Résultat : le step échoue proprement, mais **diagnostique mal**.

4. **`git fetch` silencieux avec `|| true`**
	Si le fetch échoue (réseau, auth, remote temporairement indispo), le script continue quand même avec une vision potentiellement stale du remote. Ce n'est pas catastrophique, mais ce n'est pas robuste non plus : un step de sync qui ignore un échec de fetch perd sa source de vérité.

### Que se passe-t-il en cas de conflits ?

Concrètement, avec l'état actuel :

1. `git pull --rebase` démarre
2. Si Git rencontre un conflit ou refuse le rebase, la commande sort en non-zéro
3. Le bloc `|| { ... exit 1; }` s'exécute
4. La gate s'arrête immédiatement
5. **Le repo peut rester en état de rebase interrompu** (`.git/rebase-merge`, conflits marqués dans les fichiers)

Donc oui, le `exit 1` bloque bien le push, mais **il ne nettoie rien**. L'utilisateur doit ensuite faire lui-même : résolution + `git rebase --continue`, ou abandon via `git rebase --abort`.

### Sur le lien avec `handoff-debt.sh`

Le fix `grep -cE ... || true` est correct et indépendant du step 0/6. Il ferme un vrai bug bash et évite les erreurs de test arithmétique. Je ne vois pas de nouvel angle spécifique entre ce fix et l'auto-rebase.

### Conclusion

Le step 0/6 est **bon comme amortisseur de cas simple**, pas encore comme mécanisme de sync robuste. En cas de conflits, la gate bloque bien, mais laisse l'utilisateur dans un état git potentiellement interrompu avec très peu d'informations. Le vrai angle mort, c'est moins le `exit 1` que le **silence sur la cause exacte** et l'absence de traitement explicite du cas **branche divergente**.

---

## Intégration

### Intégration (Claude, 2026-04-17)

### Retenu — à implémenter

| # | Point | Action |
| --- | --- | --- |
| 1 | Cas divergence locale+remote non traité | Ajouter détection et message quand les deux ont avancé |
| 2 | stderr masqué empêche le diagnostic | Retirer `2>/dev/null` du rebase |
| 3 | Rebase interrompu laisse un état sale | Ajouter `git rebase --abort` dans le bloc d'échec |

### Retenu — à garder en tête

| Point | Pourquoi pas maintenant |
| --- | --- |
| `git fetch || true` silencieux | Fetch raté = on continue avec vue locale, acceptable |

### Verdict

Review précise. Les 3 points actionnables sont appliqués dans le même commit.
