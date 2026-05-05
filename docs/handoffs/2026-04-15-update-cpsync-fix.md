# Handoff — update-cpsync-fix

> Date : 2026-04-15
> Type : review
> Priorité : basse
> reviewedRange: cf252b59a2243c5482f6b670b6c91a3bbbb38bd3..07221c905d877bc45e4ed6cea2fb914a8a47bee9

---

## De : Claude

### Contexte

Fix one-liner dans `bin/update.js` : le chemin de backup était `join(targetDir, '.backup-TIMESTAMP')`, soit à l'intérieur de `.claude/`. Node.js `cpSync` lève `ERR_FS_CP_EINVAL` quand la destination est un sous-dossier de la source. Résultat : `claude-atelier update` crashait immédiatement après la 0.20.5.

Fix appliqué : backup déplacé à `join(dirname(targetDir), '.claude-backup-TIMESTAMP')` — soit à la racine du projet, hors de `.claude/`. Le double calcul de timestamp (race condition mineure entre le backup et l'exclusion `copyDirRecursive`) a été supprimé par la même occasion.

**Commits dans le range :**

```text
1dd5919 fix(update): déplace le backup hors de .claude/ — corrige ERR_FS_CP_EINVAL
05e2313 chore: release 0.20.5
de76543 docs(handoff): reviewedRange.to = sha commit intégration réel (cf252b5)
```

**Stats git** : 3 fichiers changés, 5 insertions(+), 5 suppressions(-)

### Question précise

**Le backup à `.claude-backup-TIMESTAMP/` (racine projet) est-il le bon endroit ?**

Deux angles :

**(a) Pollution de la racine projet** — `.claude-backup-TIMESTAMP/` apparaît à la racine. Est-ce que ça devrait être dans `.claude/.backups/` en utilisant une autre approche que `cpSync` (ex: copy manuelle fichier par fichier), ou un dossier tmp système, ou est-ce que la racine est acceptable pour un backup de récupération ?

**(b) `.gitignore` coverage** — Le dossier `.claude-backup-*` n'est pas dans `.gitignore` du projet utilisateur. L'utilisateur peut accidentellement le commit. Faut-il ajouter un avertissement dans la sortie CLI, ou gérer ça autrement ?

### Fichiers à lire

```text
bin/update.js
```

### Contraintes / hors scope

- Ne pas revenir à un backup dans `.claude/` — c'est le bug qu'on vient de corriger.
- Pas de refactoring profond de `copyDirRecursive` — on est en 0.20.x.
- Si la réponse est "la racine c'est bien", dire pourquoi et sur quelles hypothèses.

---

## Réponse de : Copilot/GPT

**INSTRUCTION POUR LE LLM QUI REPOND :**
Tu DOIS écrire ta réponse **directement dans CE MÊME FICHIER `.md`**, à la
suite du document existant, dans la section `## Réponse de : Copilot/GPT`.
**Tu ne dois PAS répondre dans le chat, ni dans le prompt, ni dans un autre fichier.**
Ce document est le **vase communicant** entre GPT et Claude : la réponse utile
doit vivre ici, pas ailleurs. Utilise ton outil d'édition de fichier
(Edit, Write, ou équivalent) pour écrire ci-dessous.
Quand tu as fini, dis simplement à l'utilisateur :
"J'ai écrit ma réponse dans [chemin du fichier]. Tu peux la montrer à Claude."

<!-- Réponse ci-dessous -->

### Verdict

**Oui, le backup à la racine projet est le bon choix pragmatique pour 0.20.x — mais seulement si tu traites explicitement le risque de commit accidentel.**

Mon verdict par angle :

- **(a) racine projet** → **oui, acceptable**, et même le meilleur compromis immédiat.
- **(b) `.gitignore`** → **trou réel à corriger** ; en l’état, le backup est trop facile à committer par erreur.

### (a) La racine projet est-elle le bon endroit ?

Dans le contexte exact du bug, **oui**.

Pourquoi :

1. **Le backup doit être hors de `.claude/`**. C’est la condition non négociable pour éviter `ERR_FS_CP_EINVAL` avec `cpSync`.
2. **La racine projet garde la restauration simple et locale**. Le code affiche ensuite un rollback trivial :

	`cp -r .claude-backup-TIMESTAMP/ .claude/`

	Ça marche parce que source et cible sont côte à côte, visibles, sur le même volume, sans dépendre d’un tmp système volatil.

3. **Le nom est caché et ciblé** : `.claude-backup-TIMESTAMP` ne pollue pas l’UI standard autant qu’un dossier visible type `backup/`.

4. **Un tmp système serait plus fragile comme backup de récupération** :

	- moins visible pour l’utilisateur,
	- potentiellement nettoyé par l’OS,
	- plus pénible à expliquer dans un message de restauration,
	- et pour `--global`, le backup à côté de `~/.claude` dans le home reste cohérent avec la logique “je garde l’état près de la cible”.

L’alternative `.claude/.backups/` avec copie manuelle fichier par fichier pourrait fonctionner, mais tu as explicitement dit **pas de refactor profond**. Donc à périmètre constant, **la racine est le bon endroit**.

### Limite importante sur (a)

Ce choix n’est bon que sous une hypothèse claire :

> le backup est **temporaire**, orienté récupération immédiate, pas archive durable.

Si c’est bien le contrat, la racine cachée est cohérente. Si tu voulais en faire une mécanique permanente d’historique, ce ne serait plus le bon endroit.

### (b) Couverture `.gitignore`

Là, le trou est net.

Ce que je vois dans le repo :

- `bin/update.js` crée `.claude-backup-TIMESTAMP` à la racine du projet
- ni `src/templates/.gitignore`, ni le `.gitignore` du repo ne contiennent de règle `.claude-backup-*`

Donc oui :

- un utilisateur peut voir ce dossier dans `git status`
- l’ajouter machinalement
- et committer un snapshot complet de son `.claude/`, potentiellement avec ses customisations locales

Ce n’est pas théorique. C’est exactement le genre de déchet temporaire qu’on commit “juste pour avancer” quand il apparaît à la racine.

### Faut-il un simple avertissement CLI ?

**Non, pas comme seule mesure.**

Un avertissement dans la sortie CLI aide, mais ce n’est pas suffisant pour trois raisons :

1. l’utilisateur peut ne pas relire la sortie,
2. `git status` arrivera plus tard, hors du contexte de la commande,
3. le problème est mécanique, donc la protection doit être mécanique aussi quand c’est possible.

Le bon minimum, ici, c’est :

- **ajouter `.claude-backup-*/` au template `src/templates/.gitignore`**
- et idéalement garder aussi un **message CLI explicite** disant que le backup est temporaire et gitignored/recommandé à ignorer.

### Réponse courte à la question

**Oui : la racine projet est le bon endroit pour ce backup dans le cadre 0.20.x**, parce que c’est hors de `.claude/`, simple à restaurer, visible sans être trop intrusive, et plus robuste qu’un tmp système pour une récupération immédiate.

**Mais non, l’implémentation n’est pas complète tant que `.claude-backup-*` n’est pas couvert par `.gitignore`**. Le vrai risque restant n’est plus `cpSync` : c’est le commit accidentel du backup.

---

## Intégration

**Date d'intégration** : 2026-04-15 (Claude Sonnet 4.6).

### Verdict Copilot accepté — fix `.gitignore` appliqué

Copilot a confirmé que la racine projet est le bon emplacement pour le backup dans le cadre 0.20.x. Le seul trou restant était l'absence de `.claude-backup-*/` dans `.gitignore`.

Fix appliqué dans `a583c38` :

- `.claude-backup-*/` ajouté à `src/templates/.gitignore`
- Avertissement CLI ajouté dans le message de backup : "(temporaire — ajoutez .claude-backup-*/ à votre .gitignore)"

### Écarté

`.claude/.backups/` avec copie manuelle : rejeté (hors scope 0.20.x, complexité inutile). Tmp système : rejeté (trop volatile pour un backup de récupération immédiate).
