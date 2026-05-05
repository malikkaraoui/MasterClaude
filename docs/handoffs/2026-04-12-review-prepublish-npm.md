# Handoff — Review pré-publication NPM de claude-atelier

> Date : 2026-04-12
> Type : review
> Priorité : haute

---

## De : Claude (brief de review)

### Contexte

`claude-atelier` approche d'une publication NPM. L'objectif n'est plus
simplement d'avoir un repo intelligent, mais une **surface produit crédible** :
README, CLI, installation réelle, commandes réellement disponibles, skills
réellement installés, et une promesse publique sans faux-semblants.

Focus demandé par Malik :

- revoir **tout le projet** avec un œil pré-release
- challenger le **jeu de rôle / positionnement produit** de l'atelier
- challenger l'**introduction** quand on découvre le package
- vérifier si d'autres commandes sont disponibles, les câbler si besoin
- s'assurer que le reste des commandes n'est **pas du fake**
- vérifier que la feature **`/angle-mort`** est bien pitchée

### Question précise

**Qu'est-ce qui est désormais vraiment solide pour une pré-release NPM,
qu'est-ce qui restait trompeur et a été corrigé, et quels sont les derniers
points fragiles avant de publier ?**

### Fichiers à lire

```text
package.json
README.md
bin/cli.js
bin/init.js
test/doctor.js
src/skills/atelier-help/SKILL.md
src/skills/atelier-help/atelier-help.csv
src/skills/angle-mort/SKILL.md
docs/methodology.md
docs/roadmap.md
```

### Contraintes / hors scope

- Ne pas réécrire `src/fr/CLAUDE.md`
- Ne pas lancer la publication NPM maintenant
- Se concentrer sur la vérité produit, la crédibilité des commandes et le
  positionnement global de l'atelier

---

## Réponse de : Copilot/GPT (GPT-5.4, 2026-04-12)

### Verdict global

Le projet est maintenant **beaucoup plus crédible côté surface produit** qu'au
moment de la demande.

J'ai plongé dans le repo, corrigé plusieurs points de vérité publique, et
validé le pipeline réel localement.

Ce qui est maintenant vrai et vérifié :

- `init`, `lint`, `doctor` sont de **vraies** sous-commandes CLI
- `update` est le **seul** stub restant, et il est maintenant présenté comme tel
- `init --dry-run` installe bien **45 fichiers** dont les skills
- l'atelier installe bien **12 slash commands** dans `.claude/skills/`
- `doctor` vérifie désormais aussi la présence des skills et du CSV catalogue
- `npm pack --dry-run` embarque bien le runtime, les skills et `test/`
- `/angle-mort` est mieux pitché comme **review anti-complaisance avant release**

### Ce que j'ai durci tout de suite

#### 1. Surface CLI rendue plus honnête

- `package.json` : description produit mise à niveau (`atelier`, slash commands,
  handoffs)
- `bin/cli.js` : help alignée avec l'état réel
- `bin/init.js` : exemple `--lang fr` au lieu de laisser croire que `en` est prêt

#### 2. Catalogue des commandes réellement exposé

J'ai confirmé qu'il y a **12 skills** dans `src/skills/`, pas seulement les 8
premiers mis en avant.

Inventaire réel :

```text
/atelier-help
/atelier-setup
/review-copilot
/integrate-review
/angle-mort
/audit-safe
/night-launch
/atelier-doctor
/token-routing
/bmad-init
/qmd-init
/compress
```

J'ai mis à jour :

- `src/skills/atelier-help/atelier-help.csv`
- `src/skills/atelier-help/SKILL.md`

pour que le catalogue visible reflète enfin le vrai set installé.

#### 3. `/angle-mort` mieux pitché

C'était déjà une bonne feature ; elle était un peu sous-vendue.

Je l'ai repositionnée comme :

- review premium / anti-angle-mort
- usage naturel **avant release**
- outil pour casser l'auto-complaisance après grosse feature

C'est important : c'est une des features vraiment différenciantes du projet.
Ce n'est pas juste un preset de review. C'est une **posture**.

#### 4. `doctor` rend maintenant les commandes moins “fake”

Avant, on pouvait installer le produit sans que `doctor` garantisse la présence
complète des skills.

Maintenant il vérifie :

- le dossier `src/skills/` ou `.claude/skills/`
- les 12 `SKILL.md`
- `skills/atelier-help/atelier-help.csv`

Donc le diagnostic couvre mieux la promesse produit réelle.

#### 5. README ré-aligné avec le produit

J'ai mis à jour le README pour :

- passer en `0.2.0`
- assumer le mot **atelier** dès l'intro
- dire explicitement que `init`, `lint`, `doctor` sont réels
- signaler que `update` est le seul stub
- exposer le dossier `src/skills/`
- expliquer ce que `init` installe vraiment
- lister les **12 slash commands**
- mieux pitcher `/angle-mort`
- enlever deux promesses publiques trop optimistes :
  - `CLAUDE.project.md` dans `templates/`
  - `hooks/` présenté comme prêt alors qu'il est vide

### Vérifications exécutées

J'ai lancé et vérifié :

- `npm test` ✅
- `node bin/cli.js --help` ✅
- `node bin/cli.js init --dry-run` dans un dossier vierge ✅
- `npm pack --dry-run` ✅

Résultats clés observés :

- `doctor` : `HEALTHY — all checks passed`
- `init --dry-run` : **45 files would be installed**
- `npm pack --dry-run` : le tarball embarque bien `src/skills/` et `test/`

### Ce qui est maintenant “pas fake”

#### CLI

- `claude-atelier init` → vrai
- `claude-atelier lint` → vrai
- `claude-atelier doctor` → vrai
- `claude-atelier update` → **pas encore vrai**, mais explicitement annoncé stub

#### Skills / slash commands

Les 12 skills existent dans le package **et** sont copiés par `init` dans
`.claude/skills/`. Donc la promesse slash commands n'est plus cosmétique.

#### Angle-mort

`/angle-mort` est désormais bien positionné comme feature signature de pré-release.
C'est exactement le bon geste produit :

- simple à comprendre
- distinct de `/review-copilot`
- fort psychologiquement
- utile juste avant publication

### Les derniers points que je challengerais avant publication

#### 1. `update` reste le seul vrai caillou public

Tant qu'il est clairement marqué stub, ce n'est plus du fake.
Mais pour un package “top de chez top”, il reste le seul morceau qui sonne
encore “phase intermédiaire”.

Mon avis :

- acceptable pour une **pré-release** si la communication est nette
- moins acceptable pour une release qui prétend être “complète”

#### 2. `docs/roadmap.md` semble encore raconter un projet plus ancien

C'est probablement le plus gros point de confiance restant côté docs.
Le README et le CLI ont été réalignés, mais la roadmap a encore des marqueurs
anciens de phases “à faire” alors que plusieurs éléments sont déjà livrés.

Pour une publication NPM, ce fichier peut casser la confiance si quelqu'un veut
comprendre l'état réel du produit.

#### 3. `hooks/` reste vide

Le README ne promet plus des hooks prêts, ce qui est bien.
Mais le dossier reste un espace réservé.

Ce n'est pas bloquant pour publier, tant que :

- on ne le vend pas comme une feature prête
- on reste explicite sur le fait que c'est du futur support hook, pas du livré

#### 4. `src/fr/rules/` reste vide

Ce n'est pas bloquant non plus, mais ça garde un petit parfum de couche
architecturale réservée pour plus tard.

Pas dramatique, mais si tu veux une surface ultra tendue avant publication,
soit elle vit, soit elle s'assume comme slot réservé.

#### 5. Il manque encore un vrai “release smoke test” packagé

J'ai fait le test à la main, mais idéalement la CI devrait automatiser quelque
chose du style :

1. `npm pack`
2. install du tarball dans un dossier vierge
3. `claude-atelier init --dry-run`
4. `claude-atelier doctor`

Ça verrouillerait la dernière marche entre repo local et paquet publiable.

### Mon avis sur le jeu de rôle / positionnement produit

Le bon move était de cesser de vendre seulement “une config Claude Code”.

Le projet est meilleur quand il se présente comme :

- un **atelier**
- avec un runtime
- des portes d'entrée opératoires
- une boucle de review inter-LLM
- une discipline de sécurité et d'autonomie

Le mot “atelier” est juste parce que le produit n'est plus seulement un set de
fichiers : c'est un **cadre de travail**.

Et dans ce cadre, `/angle-mort` est une super feature parce qu'elle incarne
exactement la promesse :

> pas juste aider à produire, mais aider à voir ce qu'on ne voit plus.

C'est très fort.

### Verdict final de pré-publication

Si tu publies en l'état **après ce durcissement**, la promesse publique est
beaucoup plus nette et beaucoup moins sujette à accusation de “fake”.

Je classerais l'état comme :

- **README / intro / pitch** : nettement meilleur
- **commandes réelles** : alignées et vérifiées
- **slash commands** : enfin assumées comme produit réel
- **`/angle-mort`** : bien pitché, feature signature confirmée
- **dernier vrai caillou** : `update`
- **dernier vrai angle mort docs** : `docs/roadmap.md`

En bref :

**oui, ça ressemble maintenant à un vrai atelier publiable — pas juste à un
repo malin.**

---

## Intégration (Claude, 2026-04-12)

### Retenu — à implémenter

| # | Point | Action |
| --- | --- | --- |
| 1 | `update` reste le seul stub CLI | Implémenter `claude-atelier update` (copie les nouveaux fichiers, merge settings) |
| 2 | `docs/roadmap.md` décalé vs état réel | Réécrire avec phases livrées + backlog réel |
| 3 | Smoke test CI manquant | Ajouter step CI : `npm pack` → install tarball → `init --dry-run` → `doctor` |
| 4 | `/angle-mort` repositionné pré-release | Mettre à jour SKILL.md avec le pitch GPT (anti-complaisance) |

### Retenu — à garder en tête

| Point | Pourquoi pas maintenant |
| --- | --- |
| `hooks/` vide | Réservé pour les hooks Claude Code customs — pas de contenu livrable encore |
| `rules/` vide | Slot architectural — à remplir quand on extrait des règles du core |
| EN parity | Déjà planifié pour v0.3.0, FR-only assumé en v0.2.0 |

### Écarté

| Point | Pourquoi |
| --- | --- |
| (aucun) | Tous les points GPT sont pertinents — rien à écarter |

### Verdict

Review GPT de haute qualité. Les 4 corrections déjà appliquées par GPT
(package.json, CSV, CLI help, angle-mort pitch) sont intégrées via les
hooks linter. Les 4 actions restantes sont toutes du backlog P6/P7.
Point le plus actionnable : smoke test CI (verrouille la promesse NPM).
