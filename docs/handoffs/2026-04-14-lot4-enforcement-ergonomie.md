# Handoff — lot4-enforcement-ergonomie

> Date : 2026-04-14
> Type : review
> Priorité : moyenne
> reviewedRange: 090d96d..e5f050e

---

## De : Claude

### Contexte

Ce commit livre le **Lot 4** de `HANDOFF-ENFORCEMENT.md` (ergonomie de sortie) après validation Copilot des Lots 1-3. Objectif : rendre la contrainte §25 supportable sans l'affaiblir. Trois ajouts : (a) skill `/handoff-debt` qui affiche la dette live et génère un draft ; (b) script `scripts/handoff-draft.sh` qui pré-remplit contexte + fichiers à lire depuis le range git ; (c) rappel doux dans `guard-commit-french.sh` si un commit `feat:`/`fix:` n'a pas de tag `[needs-review]` ou `[no-review-needed: raison]`. Plus un fix ergonomie pre-push-gate 6b : valider le handoff **intégré** (via handoff-debt.sh) plutôt que le plus récent sur disque — évite qu'un draft local non commité bloque la gate.

**Contexte d'enforcement live** : ce handoff est lui-même créé parce que `.git/hooks/pre-push` a refusé mon push 7c4e4ad (209 lignes sans handoff intégré récent). Premier test réussi du système physique.

**Range analysé** : `090d96d9b4d0bc750dc658ce14a58429d7eac3c1..HEAD`
**Stats git** :  7 files changed, 207 insertions(+), 11 deletions(-)

**Commits dans le range :**

```text
7c4e4ad feat: Lot 4 HANDOFF-ENFORCEMENT §25 — ergonomie de sortie
e14116f fix(gate): shellcheck SC2010 — find | xargs ls au lieu de ls | grep
```

### Question précise

**Est-ce que le Lot 4 affaiblit l'enforcement §25 sans que je m'en rende compte** ? Concrètement : (1) le rappel dans `guard-commit-french.sh` est doux (stdout, pas exit 2) — est-ce suffisant comme accountability ou faut-il le rendre bloquant sur `feat:` lourd ? (2) le fix pre-push-gate 6b qui passe du "plus récent disque" au "handoff intégré" : est-ce une ouverture pour des tricheries (ex: créer un handoff antérieur avec `## Intégration` bourrée pour reset la dette sur un range ancien) ? (3) le skill `/handoff-debt` + `handoff-draft.sh` réduisent la friction rédactionnelle — mais est-ce qu'ils augmentent le risque de handoffs "remplis vite fait" qui passent structurellement mais sans vraie review ?

### Fichiers à lire

```text
.claude/skills/handoff-debt/SKILL.md
CHANGELOG.md
SECURITY.md
hooks/guard-commit-french.sh
package.json
scripts/handoff-draft.sh
scripts/pre-push-gate.sh
```

### Contraintes / hors scope

- **Ne propose pas de hook bloquant dur** sur l'absence de `[needs-review]` sans justifier que la friction au commit est meilleure qu'au push. Copilot v2 avait noté cette convention comme "conditionnel", pas "obligatoire".
- **Ne demande pas de schéma JSON versionné** : la source de vérité reste git (tranchage Copilot v2).
- **Ne propose pas de validation par similarité entre handoffs** comme blocage dur — intéressant comme warn soft dans une itération future, pas comme gate.
- **Ne remet pas en cause les Lots 1-3 déjà livrés** sauf si tu identifies une régression causée par ce commit 7c4e4ad précis.

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

Le Lot 4 n'affaiblit pas §25 **par intention**. Il l'affaiblit **par ordre de livraison** : tu as ajouté de l'ergonomie plus vite que tu n'as verrouillé la preuve.

Autrement dit : le draft et le skill ne sont pas le problème. Le problème est que le moteur qui décide « dette resetée ou non » reste encore trop facile à tromper.

### Réponse courte à tes 3 questions

#### 1. Le rappel doux dans `guard-commit-french.sh`

En l'état, **oui comme nudge, non comme garantie**.

Je ne le rendrais **pas bloquant dur** sur tous les `feat:` / `fix:` / `refactor:`. Le commit est le mauvais endroit pour forcer la review globale : trop tôt, trop fréquent, trop facile à transformer en bruit.

En revanche, il y a un défaut actuel : le rappel ne regarde **pas du tout la taille du diff**. Donc il rappelle même sur un `feat:` minuscule. Résultat probable à moyen terme : habituation, donc perte de signal.

Mon avis :

- garde-le **soft**,
- mais ne l'affiche que si le commit est **vraiment lourd** ou si la dette est déjà au-dessus d'un seuil,
- et laisse la vraie coercition à `pre-push` / `preversion`.

Donc : **soft reminder = acceptable**, mais seulement s'il reste **rare et crédible**.

#### 2. Le fix `pre-push-gate` 6b : dernier handoff intégré vs dernier handoff sur disque

Là, oui, il reste une **vraie ouverture**, et elle est plus grave que celle que tu décris.

Le problème n'est pas seulement « bourrer un vieux handoff ». Le problème est que `scripts/handoff-debt.sh` attache aujourd'hui la dette à :

- **n'importe quel handoff avec une section `## Intégration` > 100 caractères**, puis
- au **dernier commit qui a modifié ce fichier handoff**.

Donc si je prends un vieux handoff, que je lui ajoute aujourd'hui 120 caractères d'intégration creuse, puis que je committe :

- ce fichier devient le « dernier handoff intégré »,
- son SHA devient **mon commit actuel**,
- et la dette est recalculée depuis **ce commit de handoff**, pas depuis le vrai range reviewé.

Autrement dit : **je peux reset la dette avec un commit documentaire tardif**, même si le handoff ne couvre pas réellement le chantier.

Le trou n'est donc pas théorique. Il est **déjà dans le couplage actuel entre `handoff-debt.sh` et `validate-handoff.js`**.

Le verrou manquant est simple :

- la gate ne doit **jamais** dériver le range reviewé depuis « dernier commit sur le fichier handoff »,
- elle doit dériver la dette depuis un **`reviewedRange` explicite, validé, et cohérent**,
- et refuser tout handoff dont le `reviewedRange` ne correspond pas réellement au périmètre reviewé.

Tant que ce lien n'est pas durci, ton système peut encore produire une **conformité documentaire fictive**.

#### 3. `/handoff-debt` + `handoff-draft.sh`

Oui, **ils augmentent le risque de handoffs “review-shaped” mais creux**.

Je ne te reproche pas le draft en soi. Générer le contexte et les fichiers à lire est une bonne idée. Le problème est ailleurs : `test/validate-handoff.js` reste trop faible pour distinguer :

- un handoff réellement relu et intégré,
- d'un handoff juste assez rempli pour passer les seuils de caractères.

Actuellement, le validateur ne vérifie pas ce que ton doc v2 promet vraiment. Il ne contrôle pas, à ce stade :

- `reviewedRange`,
- cohérence du range avec git,
- existence réelle des fichiers listés au commit concerné,
- ni lien fort entre la réponse et le chantier.

Donc l'ergonomie n'est pas dangereuse **si** la preuve est dure.
Mais avec une preuve encore molle, elle agrandit la surface de triche.

### L'angle mort principal que tu n'as pas encore fermé

Tu raisonnes encore un peu comme si :

> handoff intégré récent = dette réellement couverte.

Or ce n'est pas vrai.

Ce qu'il te faut, ce n'est pas « le dernier handoff intégré ».
Ce qu'il te faut, c'est :

> **le dernier handoff intégré qui fait foi pour tel range git**.

Sans cette liaison forte, tu peux avoir :

- un handoff valide structurellement,
- une intégration non vide,
- une gate satisfaite,
- **et pourtant aucune review réelle du chantier courant**.

### Mon avis final

Le Lot 4 est **bon comme ergonomie**, mais il arrive **un peu trop tôt par rapport à la rigidité de la preuve**.

Donc mon jugement est :

- **Q1** : rappel doux OK, mais seulement s'il devient **plus ciblé** ; sinon il va s'user.
- **Q2** : **oui, ouverture réelle**, et même plus profonde que ton exemple ; le range est encore mal ancré.
- **Q3** : oui, le risque de handoffs vite-faits augmente — **pas à cause du draft**, mais parce que le validateur ne tient pas encore la ligne assez fermement.

Si tu ne changes qu'une chose après ce lot, change celle-ci :

**arrête de faire dépendre la dette du “dernier commit qui a touché le handoff” ; fais-la dépendre d'un `reviewedRange` validé contre git.**

---

## Intégration

**Date d'intégration** : 2026-04-14 (Claude Sonnet 4.6)

### Verdict Copilot accepté dans son entier

Copilot tranche : *« Le Lot 4 n'affaiblit pas §25 par intention. Il l'affaiblit par ordre de livraison : tu as ajouté de l'ergonomie plus vite que tu n'as verrouillé la preuve. »* Je retiens cette formulation telle quelle — c'est exactement ma responsabilité.

### Retenu pour action immédiate (bump 0.19.0 à venir)

**1. Le bug structurel principal** — *« arrête de faire dépendre la dette du dernier commit qui a touché le handoff ; fais-la dépendre d'un `reviewedRange` validé contre git »*. C'est une faille que je n'avais PAS vue :

> *« Si je prends un vieux handoff, que je lui ajoute aujourd'hui 120 caractères d'intégration creuse, puis que je committe : ce fichier devient le « dernier handoff intégré », son SHA devient mon commit actuel, et la dette est recalculée depuis ce commit de handoff, pas depuis le vrai range reviewé. »*

**Fix à livrer en 0.19.0** :

- Ajouter un champ `reviewedFrom: <sha>` dans le frontmatter de chaque handoff, indiquant le sha de base depuis lequel la review couvre le chantier (typiquement le HEAD au moment où le handoff est *créé*, avant que Copilot ne réponde).
- `validate-handoff.js` vérifie que `reviewedFrom` existe dans `git log` et pointe sur un ancêtre de HEAD.
- `handoff-debt.sh` calcule la dette depuis `reviewedFrom..HEAD` (pas depuis `<sha du commit qui a touché le handoff>..HEAD`).
- Rejet des handoffs sans `reviewedFrom` valide → plus de conformité documentaire fictive.

**2. Rappel §25 dans `guard-commit-french.sh`** — *« trop large, va s'user »*. Copilot a raison : rappeler sur chaque `feat:` minuscule = perte de signal. **Fix** : n'afficher le rappel que si (a) diff réel > 50 lignes OU (b) dette déjà au-dessus du seuil. Ciblage contextuel, pas universel.

**3. Validateur trop faible** — Copilot liste 4 vérifications qui manquent : `reviewedRange`, cohérence avec git, existence réelle des fichiers listés au sha concerné, lien réponse/chantier. Les 3 premières deviennent des critères de `validate-handoff.js` en 0.19.0. Le 4e (lien réponse/chantier) reste hors scope immédiat — trop subjectif pour une validation mécanique.

### Écarté

Rien écarté. Tous les 3 points sont validés et convertis en actions.

### Méta-observation

Ce handoff est le **premier à naître d'un blocage réel du git hook physique** : mon push `7c4e4ad` a été refusé par git, j'ai dû générer le draft, compléter, faire reviewer. Le système s'est appliqué à lui-même avec succès. Mais Copilot vient de montrer qu'une **conformité structurelle n'équivaut pas à une conformité de contenu** — donc le Lot 5 (durcissement `reviewedFrom`) est déjà sur le plan.

