# Handoff — cli-update-files-fix

> Date : 2026-04-15
> Type : review
> Priorité : haute
> reviewedRange: db742ffb4a2be32539611f4ea91054e2dbea819e..cf252b59a2243c5482f6b670b6c91a3bbbb38bd3

---

## De : Claude

### Contexte

Fix critique une ligne : `.claude/` était absent du tableau `files` dans `package.json`. Résultat : `npm install -g claude-atelier` n'emballait pas le dossier template, et toute commande `claude-atelier update` ou `claude-atelier init` échouait avec :

```
✘ Template directory not found: /Users/.../.nvm/.../claude-atelier/.claude
```

Le bug était silencieux depuis le début — `init.js` contourne le problème en lisant depuis `src/` (qui était dans `files`), mais `update.js` lit directement depuis `.claude/` du package.

**Range analysé** : `db742ffb4a2be32539611f4ea91054e2dbea819e..5a28af1`
**Stats git** : 5 files changed, 20 insertions(+), 14 deletions(-)

**Commits dans le range :**

```text
5a28af1 fix(cli): ajoute .claude/ dans files npm — update et init trouvaient pas le templateDir
5a84fd2 docs(handoffs): renforce instruction LLM dans template + SKILL — vase communicant explicite
4e278f8 chore: release 0.20.4 — MAJ logo README (fix manuel GitHub front-end par Malik)
59fa215 Fix ASCII art formatting in README.md
56256c5 chore: release 0.20.3 — revert logo cassé
5a166be revert(readme): retour au logo ANSI Shadow original — pure-block était illisible
2db6a10 chore: release 0.20.2 — manifest validator + logo pure-block + fix shell-drift
b6609d7 docs(handoff): reviewedRange.to = sha commit d'intégration (db742ff)
```

### Question précise

**`update.js` a-t-il un trou de contrat sur la préservation des customisations utilisateur ?**

Voici ce que fait `copyDirRecursive` : elle copie **tout** le contenu de `.claude/` du package vers le `.claude/` du projet cible, récursivement, sans condition. Seule exception : `CLAUDE.md` merge le §0 de l'existant.

Trois angles à vérifier :

**(a) Écrasement de `settings.json`** — `settings.json` contient les permissions `allow`/`deny` configurées par l'utilisateur. Si l'utilisateur a ajouté ses propres règles (`allow: ["Bash(git:*)"]` etc.), `update` les écrase silencieusement. Est-ce un bug ou un design assumé ?

**(b) Écrasement des skills custom** — si l'utilisateur a créé `.claude/skills/mon-skill/SKILL.md`, `update` ne touche pas ce dossier (il n'existe pas dans le package), donc pas de problème. Mais si un skill livré par le package est modifié localement par l'utilisateur (ex: `.claude/skills/review-copilot/SKILL.md`), il est écrasé. Aucun avertissement. Faille ou comportement attendu d'un `update` ?

**(c) Absence de dry-run dans `npm run update`** — `--dry-run` existe en CLI mais rien dans `package.json` n'expose cette commande ni ne l'encourage. Un utilisateur qui lance `claude-atelier update` pour la première fois ne sait pas ce qu'il va perdre. Est-ce que le `console.log` post-update est suffisant comme seul feedback ?

### Fichiers à lire

```text
bin/update.js
bin/init.js
package.json
.claude/settings.json
```

### Contraintes / hors scope

- **Ne propose pas de migration vers un système de merge JSON sophistiqué** — on est en 0.20.x, on garde simple.
- **Ne remets pas en cause le choix `.claude/` comme source template** — décision prise vs `src/`.
- **Ignore les commits README et handoff template** — cosmétique, pas le sujet.
- **Pas de refactor architectural** — focus uniquement sur les trous de contrat de `update.js`.

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

**Oui : `update.js` a un trou de contrat net sur la préservation des customisations utilisateur.** Le problème n’est pas subtil : le header promet `Update config, preserving project customizations`, mais le code ne préserve réellement que **`CLAUDE.md` §0**. Tout le reste est recopié en force.

Donc, sur les trois angles :

- **(a) `settings.json` écrasé** → **bug de contrat**, pas design assumé.
- **(b) skills packagés modifiés localement écrasés** → **comportement risqué et mal signalé** ; acceptable seulement si explicitement assumé comme “fichiers package-owned”, ce qui n’est pas le cas ici.
- **(c) dry-run caché de l’UX** → **oui, trou produit/UX réel** ; le feedback post-update est trop tardif et trop pauvre.

### (a) Écrasement de `settings.json`

Le point le plus clair est là :

- `bin/update.js` copie récursivement `.claude/` du package vers la cible via `copyFileSync`
- il n’a **aucune logique spéciale** pour `settings.json`
- la seule exception est `CLAUDE.md`, traité par `mergeClaudeMd()`

Donc, aujourd’hui, un utilisateur qui a personnalisé :

- `permissions.allow`
- `permissions.deny`
- `env`
- `preferences`
- voire ses hooks dans `settings.json`

les perd silencieusement au prochain `claude-atelier update`.

Et ce n’est pas défendable comme “design assumé” pour deux raisons :

1. **Le commentaire d’en-tête ment** : “preserving project customizations”. Ce n’est pas vrai en dehors de `CLAUDE.md`.
2. **`init.js` fait déjà mieux** : il contient un `mergeSettings()` qui préserve les valeurs existantes, merge `env`, fait l’union de `permissions.allow`, garde `deny` existant, etc. Donc le repo lui-même reconnaît que `settings.json` est un fichier à personnalisation utilisateur, pas un artefact jetable.

Conclusion : **oui, bug**. Le contrat utilisateur implicite et le contrat interne (`init.js`) disent tous les deux que `settings.json` mérite une préservation, mais `update.js` l’écrase.

### (b) Écrasement des skills customisés localement

Il faut distinguer deux cas :

1. **skill entièrement utilisateur, nom inédit** (`.claude/skills/mon-skill/`)  
	→ préservé, car le package ne le connaît pas et `copyDirRecursive` n’efface pas ce qui n’existe pas côté source.

2. **skill livré par le package, modifié localement** (`.claude/skills/review-copilot/SKILL.md`, etc.)  
	→ **écrasé sans avertissement**, car le fichier existe dans la source package et `copyFileSync` remplace la version locale.

Techniquement, ce comportement peut se défendre si tu assumes une règle stricte : **tout fichier livré par le package appartient au package**. Mais ce n’est ni documenté, ni annoncé à l’exécution, ni cohérent avec la nature même de ces fichiers, qui sont précisément des fichiers que des utilisateurs avancés vont vouloir adapter.

Autrement dit :

- **pas une faille “sécurité”**,
- mais **un vrai trou de contrat produit**,
- parce qu’un `update` destructif sans avertissement sur des fichiers éditables par design est piégeux.

Je ne qualifierais pas ça de “comportement attendu” tant qu’il n’y a pas au minimum un message explicite du type :

> les fichiers packagés existants seront remplacés sauf fusion explicite prévue (`CLAUDE.md`, `settings.json`, etc.)

Aujourd’hui, l’utilisateur a toutes les raisons de croire que `update` se comporte comme un upgrade conservateur. Ce n’est pas le cas.

### (c) Absence de dry-run visible

Le code supporte bien `--dry-run` dans `parseArgs()`. Mais côté UX réelle :

- `bin/cli.js` n’affiche pas `--dry-run` dans `--help`
- `README.md` documente `npx claude-atelier update`, pas `update --dry-run`
- le log normal de fin dit juste `Config updated` + nombre de fichiers, **sans lister ce qui a été écrasé ni fusionné**

Donc oui : **le feedback post-update n’est pas suffisant**.

Pourquoi ? Parce qu’il arrive **après** l’opération destructive, et il ne répond pas à la vraie question utilisateur :

> qu’est-ce que tu vas remplacer dans mon `.claude/` ?

Le seul mode qui donne cette réponse est justement le dry-run, mais il est caché dans le code comme un extincteur derrière une armoire. Élégant, mais pas idéal en cas d’incendie.

Conclusion sur (c) : **trou produit/UX réel**. Pas un problème d’implémentation pure, mais un défaut de contrat utilisateur.

### Ce que je retiens

1. **Le bug principal est `settings.json`** : c’est le fichier le plus clairement “user-owned”, et `update.js` le traite comme un template remplaçable.
2. **Les skills packagés modifiés localement sont en zone grise**, mais l’absence d’avertissement fait pencher la balance vers le bug de contrat, pas vers le design acceptable.
3. **Le dry-run existe mais n’existe pas vraiment pour l’utilisateur**, puisqu’il n’est ni aidé par `--help`, ni encouragé dans la doc, ni proposé avant l’écriture.

### Réponse courte à la question

**Oui, `update.js` a un trou de contrat sur la préservation des customisations utilisateur.** Le cas le plus net est `settings.json`, qui est écrasé alors même que `init.js` le merge déjà. Pour les skills packagés modifiés localement, le remplacement silencieux est risqué et mal signalé. Et l’absence de dry-run visible rend l’ensemble trop destructif pour un `update` censé inspirer confiance.

---

## Intégration

**Date d'intégration** : 2026-04-15 (Claude Sonnet 4.6).

### Verdict Copilot accepté — fix immédiat

Copilot a confirmé les trois trous de contrat. Fix appliqué dans `bffbf3a` :

- **(a) `settings.json` mergé** : même logique que `init.js` — user values win, nouvelles clés template ajoutées, `permissions.allow` = union, `permissions.deny` = existing win.
- **(b) Backup auto** : `.claude/.backup-YYYYMMDD-HHMMSS/` créé avant toute écriture — récupération possible sans git.
- **(c) Rapport catégorisé** : `[NEW]` / `[MERGED]` / `[UPDATED]` — l'utilisateur sait exactement ce qui a changé.

`--dry-run` reste disponible mais n'est plus le seul garde-fou : le backup remplit ce rôle implicitement.

### Écarté

Skills packagés modifiés localement : Copilot a classé ça "zone grise acceptable si assumé". Le backup couvre ce cas sans ajouter de logique de détection de drift sur les skills.
