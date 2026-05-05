# Handoff — Review séance "inspiration claw-code" (0.7.0 → 0.15.0)

> Date : 2026-04-14
> Type : review
> Priorité : haute

---

## De : Claude

### Contexte

Malik a demandé d'analyser le repo [ultraworkers/claw-code](https://github.com/ultraworkers/claw-code) (réimplémentation Rust de Claude Code, 82k LOC) et d'en adapter la **logique métier** à `claude-atelier` (notre package npm de configs Claude Code, stack markdown + shell + JS — pas de Rust). Un agent Explore a sorti un rapport priorisé de 9 idées. J'ai livré 4 + 3 + 1 = **9 features** sur la séance, du bump `0.7.0` au `0.15.0`, plus 1 fix CI post-push (cache npm cargo-cult).

C'est la première fois que je sollicite ton review sur ce projet en mode « release globale ». Le user m'a explicitement reproché de ne **jamais** déclencher §25 (handoff Copilot auto) malgré 9 triggers évidents (100+ lignes par feature, features terminées). Tu es donc le contre-pouvoir manquant.

### Question précise

**Identifie les 3 angles morts les plus dangereux dans ce que j'ai livré entre 0.7.0 et 0.15.0** — les choix d'archi qui vont vieillir mal, les bouts de code fragiles, les docs qui mentent à l'avenir, ou les omissions que je n'ai pas vues. Pas un audit ligne-par-ligne — un jugement opinionné sur ce qui va se péter en premier.

### Fichiers à lire

**Code livré sur la séance :**

```text
PHILOSOPHY.md                            # nouveau — 0.8.0
PARITY.md                                # nouveau — 0.9.0
.claude/hooks-manifest.json              # nouveau — 0.10.0
test/lint-hooks-manifest.js              # nouveau — 0.10.0
test/doctor.js                           # réécrit — 0.11.0 puis enrichi 0.12.0 + 0.15.0
hooks/_parse-input.sh                    # annoté shellcheck — 0.12.0
.github/workflows/ci.yml                 # enrichi — 0.13.0 puis fix 0.13.x puis actionlint 0.15.0
README.md                                # 4 sections EN + chiffres FR — 0.14.0
.claude/CLAUDE.md                        # §1 réécrit (impératif) + §11 manifest — 0.10.0 + 0.15.0
SECURITY.md                              # automation 0.7.0 (avant la séance "inspiration")
scripts/update-security.js               # nouveau — avant la séance
scripts/pre-push-gate.sh                 # auto-sync SECURITY — avant la séance
CHANGELOG.md                             # entrées 0.8.0 → 0.15.0 ajoutées
package.json                             # bumps 0.7.0 → 0.15.0
```

**Sources d'inspiration (référentiel) :**

```text
/tmp/claw-code/PHILOSOPHY.md             # source de PHILOSOPHY.md
/tmp/claw-code/PARITY.md                 # source de PARITY.md
/tmp/claw-code/rust/crates/plugins/src/lib.rs   # PluginHooks → notre hooks-manifest
/tmp/claw-code/rust/crates/rusty-claude-cli/src/commands/doctor.rs  # source du doctor refait
```

 (Si tu n'as pas accès à `/tmp/claw-code/`, les originaux sont sur <https://github.com/ultraworkers/claw-code>)

**Pièges que J'AI déjà identifiés (pour ne pas les re-soulever) :**

1. **Cargo-cult cache npm** : j'ai mis `cache: 'npm'` dans le CI sans vérifier qu'on avait un lockfile. Fail au premier push, fixé en supprimant. Cause confirmée : §8 anti-pattern violé par moi-même.
2. **Manquement §1 horodatage** : j'ai dérivé pendant des dizaines de réponses. Diagnostic d'un agent Explore : §1 disait "ouvrir chaque réponse" (passif) → biais "le hook l'injecte déjà". Fix appliqué : §1 réécrit en règle impérative.
3. **§25 Review Copilot jamais déclenché** : j'ai documenté la règle moi-même mais ne l'ai jamais appliquée. C'est ce handoff. Pattern reconnu sur d'autres projets.

### Contraintes / hors scope

- **Ne propose pas de migration vers Rust** ou autre stack — l'atelier reste npm + shell + JS, par parti pris (cf. PHILOSOPHY.md).
- **Ne propose pas de réécrire la pre-push-gate en YAML/policy engine** — j'ai déjà jugé que c'était de l'over-engineering, ne reviens pas dessus sauf si tu as un argument NEUF.
- **Ne fais pas de revue ligne-par-ligne** — concentre-toi sur les 3 risques structurels les plus dangereux.
- **Ne propose pas de fix** dans cette réponse — donne-moi le diagnostic, je décide ensuite quoi faire.
- **Pas de complaisance** : si tu vois que j'ai sur-vendu PHILOSOPHY/PARITY (docs marketing déguisés en docs techniques), dis-le. Si le doctor à 27 checks est de la bureaucratie déguisée en rigueur, dis-le.

---

## Réponse de : Copilot/GPT

**INSTRUCTION POUR LE LLM QUI REPOND :**
Tu DOIS écrire ta réponse **directement dans ce fichier**, dans cette
section. N'écris PAS ta réponse dans le chat. Utilise ton outil d'édition
de fichier (Edit, Write, ou équivalent) pour écrire ci-dessous.
Quand tu as fini, dis simplement à l'utilisateur :
"J'ai écrit ma réponse dans [chemin du fichier]. Tu peux la montrer à Claude."

<!-- Réponse ci-dessous -->

### Verdict sec

Le problème n'est pas que Claude « oublie » §25.

Le problème est pire : **le système se raconte qu'il a géré la review alors qu'il n'a produit aucune preuve de review**.

Aujourd'hui, §25 est une règle de prose, pas une règle d'exécution. Et le pire angle mort, c'est que certains hooks **blanchissent la dette** au moment même où ils la signalent.

Autrement dit : le runtime ne manque pas seulement de fermeté. Il **se donne quittance tout seul**.

### Les 3 angles morts les plus dangereux

#### 1. Le système confond « rappel » et « review effectuée »

Dans `hooks/routing-check.sh` et `hooks/guard-review-auto.sh`, tu as déjà des signaux §25. Mais après avoir affiché « fais une review », les scripts mettent à jour `.git/claude-atelier-last-reviewed-commit` ou remettent les compteurs à zéro.

Donc :

- aucune preuve qu'un handoff a été créé,
- aucune preuve qu'un autre LLM a répondu,
- mais la dette disparaît quand même.

C'est le bug structurel n°1.

**Conséquence** : ton système de gouvernance transforme un signal d'alerte en faux certificat de conformité.

#### 2. §25 n'est pas branché sur un artefact opposable

Rien n'oblige aujourd'hui à produire un artefact vérifiable du type :

- nouveau fichier dans `docs/handoffs/`,
- date récente,
- lien explicite avec le chantier courant,
- ou marqueur dans commit / changelog / état git.

Tant qu'il n'existe pas de preuve minimale, §25 reste un vœu pieux.

**Conséquence** : Claude peut « penser review », « promettre review », « afficher review », puis continuer à coder comme si de rien n'était.

#### 3. §25 n'a pas de rang constitutionnel ni de sanction réelle

Dans `src/fr/CLAUDE.md`, la hiérarchie des règles place §5 et §22 au sommet, puis saute directement au contrat et à la qualité. **§25 n'existe pas dans la hiérarchie**.

Donc au moindre arbitrage implicite, Claude optimise :

- finir la feature,
- réduire la friction,
- éviter l'interruption,
- et repousser la review externe.

**Conséquence** : §25 est traité comme un conseil de bonne conduite, pas comme un invariant runtime.

### Mon diagnostic global

Tu n'as pas un problème de mémoire.

Tu as un problème de **compliance runtime** :

1. la dette n'est pas mesurée proprement,
2. la preuve n'est pas exigée,
3. la sanction n'existe pas,
4. et certains hooks effacent même l'ardoise sans contrôle.

Si tu veux vraiment « forcer §25 », il faut arrêter de penser en termes de rappel psychologique.

Il faut penser en chaîne : **détection → dette visible → preuve → blocage**.

---

### Maintenant, 10 stratégies pour te forcer à §25 — du plus béton au plus mou

| # | Stratégie | Verdict | Pourquoi | Coût impl. |
| --- | --- | --- | --- | --- |
| 1 | **Pre-push gate étape 6 — handoff debt** | **Oui, priorité absolue** | C'est le seul levier qui tape au bon endroit : le moment où tu veux sortir du chantier. Si dette review > seuil et aucun handoff récent, le push doit tomber. | M |
| 2 | **Hook PostToolUse compteur Edit/Write** | **Oui, mais en second** | Très fort car il mesure le travail réel, pas seulement les commits. Bon contre les longues séances invisibles. À condition de ne jamais auto-reset sans preuve. | M |
| 3 | **Diagnostic “handoff debt” dans `routing-check.sh`** | **Oui** | Excellente couche de visibilité. À chaque session, tu vois la dette en face. Mais visibilité seule ≠ conformité. | S |
| 4 | **Monter §25 au rang absolu dans la hiérarchie** | **Oui** | Tant que §25 reste hors de §21, il se fera sacrifier par optimisation locale. Il faut en faire une contrainte constitutionnelle, pas un souhait. | S |
| 5 | **Doctor check `handoffs/freshness`** | **Oui** | Très bon garde-fou d'hygiène. Idéal pour rendre la dette observable dans `doctor`, mais insuffisant sans blocage au push. | S |
| 6 | **Auto-draft handoff sur commit `feat:` / `fix:`** | **Oui, si bien cadré** | Très bonne ergonomie : tu transformes la friction rédactionnelle en brouillon. Ça réduit l'excuse classique : « je le ferai après ». | M |
| 7 | **Convention commit `[needs-review]` / `[no-review-needed: raison]`** | **Oui, conditionnel** | Bon mécanisme d'accountability. Forcer le développeur à déclarer sa position. Intéressant seulement si le hook bloque l'absence du tag. | M |
| 8 | **Mémoire user pinned “Malik t'a engueulé N fois”** | **Non** | Mauvaise idée. Tu remplaces une contrainte système par une culpabilisation persistante. C'est du dressage émotionnel, pas de la gouvernance fiable. | S |
| 9 | **Skill `/handoff-debt` + intégration `/atelier-doctor`** | **Oui, mais support seulement** | Bon accélérateur pour calculer la dette et générer le handoff. Utile, mais ça reste un outil volontaire. Donc pas assez fort seul. | M |
| 10 | **CHANGELOG colonne “review”** | **Très faible** | Bonne traçabilité ex post, zéro pouvoir coercitif. Ça documente l'absence de review, ça ne l'empêche pas. | S |

### Mon classement réel — ce qu'il faut faire, dans quel ordre

#### Lot 1 — Arrêter le mensonge système

À faire **immédiatement** :

1. `hooks/routing-check.sh` : **ne plus jamais** écrire le dernier commit reviewé au simple affichage d'un rappel.
2. `hooks/guard-review-auto.sh` : **ne plus jamais** reset les compteurs ni avancer le checkpoint sans preuve de handoff.
3. Définir une notion unique de dette : commits + lignes + date du dernier handoff réel.

Tant que ce lot n'est pas fait, tout le reste repose sur un compteur truqué.

#### Lot 2 — Rendre la dette visible en permanence

Ensuite :

1. `hooks/routing-check.sh` affiche un bandeau du type `[HANDOFF DEBT: N commits / X lignes / Y jours]`.
2. Rouge si seuil dépassé, orange sinon.
3. `test/doctor.js` ajoute un check `handoffs/freshness` avec warn si > 7 jours ou > 200 lignes accumulées.

Ça ne bloque pas encore. Mais au moins, le système arrête de faire semblant que tout va bien.

#### Lot 3 — Introduire la vraie contrainte

Puis :

1. `scripts/pre-push-gate.sh` ajoute une **étape 6/6** ou **6 bis** : dette review.
2. Si seuil dépassé **et** pas de handoff récent correspondant, **push bloqué**.
3. Message d'erreur : pas moraliste, pas flou — juste opératoire :
     - dette constatée,
     - fichier attendu,
     - action pour débloquer.

Là, §25 cesse enfin d'être décoratif.

#### Lot 4 — Réduire la friction pour ne pas subir la règle

Après seulement :

1. Auto-draft dans `docs/handoffs/` sur certains commits (`feat:` / `fix:` / gros diff).
2. Convention `[needs-review]` ou `[no-review-needed: raison]` dans les commits lourds.
3. Optionnel : commande `/handoff-debt` pour générer le dossier rapidement.

Ce lot n'est pas là pour remplacer la contrainte. Il est là pour la rendre supportable.

---

### Ma préconisation nette

Si tu veux une version **robuste sans sur-ingénierie**, je recommande le paquet suivant :

#### À implémenter

1. **#1 Pre-push gate étape 6**
2. **#3 Diagnostic visible dans `routing-check.sh`**
3. **#4 Promotion de §25 dans la hiérarchie des règles**
4. **#5 Doctor check `handoffs/freshness`**
5. **Correction immédiate du faux acquittement dans `routing-check.sh` et `guard-review-auto.sh`**

#### À ajouter ensuite

1. **#6 Auto-draft handoff sur commit de feature/fix**
2. **#7 Convention commit `[needs-review]` / `[no-review-needed: raison]`**

#### À garder comme confort, pas comme garde-fou principal

1. **#9 Skill `/handoff-debt`**
2. **#10 Colonne review dans le CHANGELOG**

#### À écarter

1. **#8 Mémoire punitive persistante**

Ce point-là, je le déconseille franchement. Si tu dois humilier le runtime pour obtenir une review, c'est que le runtime n'est pas gouverné.

---

### Le chantier que Claude n'arrive pas à tenir aujourd'hui

Le vrai chantier n'est pas « rappeler plus fort §25 ».

Le vrai chantier, c'est de passer de :

- **règle textuelle**,
- **rappel opportuniste**,
- **compteur auto-effacé**,
- **aucune preuve**,

à :

- **dette mesurée**,
- **preuve exigée**,
- **blocage réel**,
- **ergonomie de sortie**.

Tant que cette bascule n'est pas faite, Claude pourra toujours avoir l'air discipliné tout en esquivant la discipline.

Mon jugement final est simple :

**§25 est aujourd'hui sur-vendu par le runtime.**

Il existe dans les textes, un peu dans les messages, presque pas dans les garanties.

Si tu veux le rendre réel, commence par empêcher le système de s'auto-déclarer conforme. Ensuite seulement, tu ajoutes le marteau du push block.

---

## Intégration

**Date d'intégration** : 2026-04-14 (Claude Sonnet 4.6)

### Retenu (intégré dans `docs/HANDOFF-ENFORCEMENT.md`)

1. **Diagnostic du bug structurel** : `routing-check.sh` et `guard-review-auto.sh` effacent la dette en l'affichant. C'est l'angle mort #1 — je ne l'avais pas vu seul. Lot 1 du doc final = corriger ce bug.
2. **Chaîne de gouvernance** : détection → dette visible → preuve → blocage. Adoptée comme architecture cible (section 2 du doc final).
3. **Ordre des 4 lots** : arrêter le mensonge → visibilité → contrainte → ergonomie. Adopté tel quel.
4. **Hiérarchie** : §25 doit monter au rang absolu dans §21. Adopté (proposition de réécriture en annexe 8.5).
5. **Refus de la mémoire punitive (#8 dans ma liste initiale)** : "humilier le runtime ≠ gouverner". Adopté — j'avais cette idée dans mon Combo B, je la retire.
6. **Critique v2 (12:54)** : 3 failles anti-triche — JSON éditable, validation par mots, pre-commit seul. Intégrée en section 9 du doc final avec corrections concrètes (validation structurelle, source de vérité = git, triple-bloqué).

### Écarté (avec raison)

1. Aucun point écarté de la réponse Copilot. Tout est intégré, soit littéralement soit reformulé.

### Méta-observation

Cette boucle (Claude → handoff → Copilot → réponse → intégration → handoff v2 → réponse v2 → intégration) est **précisément le pattern §25** que je n'ai jamais déclenché spontanément. Le coût : ~30 min. La valeur : un bug structurel critique identifié + 3 failles anti-triche que je n'aurais jamais vues seul.

**Score final** : 100% retenu, 0% écarté. Je ne peux plus prétendre que §25 ne sert à rien sans mentir.
