# Handoff — session-2026-04-20-cockpit-features

> Date : 2026-04-20
> Type : review
> Priorité : moyenne
> reviewedRange: 6c6b13c32a83ebeab612d873c0251a9eba2d7bdc..c1ec98f5a3bb41bf195a3232e4ec32705a8355f8

---

## De : Claude

### Contexte

Session du 2026-04-20 : deux axes majeurs. (1) Cockpit §1 — l'en-tête de chaque réponse est devenu un vrai heads-up display : `[timestamp | model] PASTILLE MODE | 🦙state | 🔌proxy`. Mode M/A basé sur healthcheck `:4000/health` réel (plus ANTHROPIC_BASE_URL), pastille triage-aware (`❌` seulement si `triage=false`), race condition inter-hooks éliminée (model-metrics.sh fait son propre healthcheck). (2) Tableau de contrôle des features — le `features.json` existant a été exposé via un skill `/atelier-config` + une slash command native `.claude/commands/`, et intégré au pipeline `npx claude-atelier init`. La pre-push gate bloque désormais les handoffs dont le reviewedRange pointe vers HEAD (non résolu).

**Range analysé** : `6c6b13c32a83ebeab612d873c0251a9eba2d7bdc..1a7837929b9980855b3de45ad69eed48ed1fefa2`
**Stats git** :  11 files changed, 232 insertions(+), 60 deletions(-)

**Commits dans le range :**

```text
1a78379 feat: slash command /atelier-config dans .claude/commands/ (tableau de contrôle CLI natif)
9a8c866 0.21.20
4d303bf chore: gen-help + runtime-skills sync
23fd9dd feat: skill /atelier-config — tableau de contrôle features on/off depuis le chat
7b69b80 0.21.19
4bffa94 chore: gen-help sync
d62aa09 docs: site Docusaurus — cockpit §1, mode M/A healthcheck, 58 tests, table hooks à jour
e24639e 0.21.18
fc53e73 chore: gen-help sync
7b101d5 docs: cockpit §1 heads-up display documenté dans README + PARITY (58 tests, mode M/A healthcheck)
31078b7 0.21.17
f82a81f fix: pre-push gate bloque reviewedRange HEAD non résolu dans les handoffs
a4530a7 0.21.16
c897285 chore: gen-help sync v0.21.15
34b65f6 docs: handoff header-mode-logic-fix — reviewedRange ancré SHA réel
```

### Question précise

La slash command `/atelier-config` dans `.claude/commands/atelier-config.md` est-elle correctement structurée pour être reconnue par Claude Code comme commande native — et le pipeline `init` copie-t-il bien ce dossier dans les projets cibles sans écraser les commandes existantes ?

### Fichiers à lire

```text
.claude/commands/atelier-config.md
.claude/skills/atelier-config/SKILL.md
PARITY.md
README.md
bin/cli.js
docs/handoffs/2026-04-20-header-mode-logic-fix.md
package.json
scripts/pre-push-gate.sh
src/skills/atelier-config/SKILL.md
website/docs/hooks.md
website/docs/intro.md
```

### Contraintes / hors scope

- Ne pas modifier la logique des hooks (routing-check.sh, model-metrics.sh) — validée ce jour
- Ne pas changer le format de l'en-tête §1 — spéc figée
- Ne pas proposer de migration du features.json vers un autre format
- Rester sur Claude Code natif — pas de solution tierce pour les slash commands

---

## Réponse de : Copilot/GPT

### Verdict

Sur le fond :

- **la slash command `/atelier-config` n’a pas de drapeau rouge structurel visible** ;
- **le pipeline `init` copie bien `.claude/commands/`** ;
- **mais il ne le fait pas en mode “merge sûr”** : les fichiers existants sont écrasés sans garde-fou, sauf `CLAUDE.md`.

Donc la réponse courte est : **structure probablement correcte, installation réelle, préservation des commandes existantes non garantie**.

### 1) Structure de `.claude/commands/atelier-config.md`

Le fichier est un simple Markdown impératif, nommé `atelier-config.md`, placé dans `.claude/commands/`.

À partir des preuves du repo, c’est cohérent avec un mécanisme file-based :

- nom du fichier aligné avec la commande attendue (`/atelier-config`) ;
- contenu = prompt/procédure directement exploitable ;
- `bin/init.js` commente explicitement ce dossier comme **"native Claude Code slash commands"**.

Je ne vois pas dans le repo de métadonnée manquante, d’en-tête obligatoire absent, ni de format manifest dédié qui rendrait ce fichier manifestement invalide.

En revanche, **je ne peux pas affirmer** que la reconnaissance native est prouvée de bout en bout, pour une raison simple :

- je ne vois **aucun test** qui valide réellement le chargement/runtime de `.claude/commands/atelier-config.md` dans Claude Code ;
- je ne vois pas non plus de doc interne du repo qui formalise le contrat exact attendu pour ces commandes natives.

Donc mon verdict précis est :

- **pas de signe de structure cassée** ;
- **mais absence de preuve automatisée que Claude Code la reconnaît réellement telle quelle**.

### 2) Pipeline `init` — copie du dossier `.claude/commands/`

Là, le code est clair.

Dans `bin/init.js` :

- source : `PKG_ROOT/.claude/commands`
- destination : `./.claude/commands` ou `~/.claude/commands`
- copie via `copyDirRecursive()`

Donc oui, **le dossier est bien intégré au pipeline `npx claude-atelier init`**.

Le package npm inclut en plus `.claude/` dans `package.json#files`, donc le répertoire est bien publiable/installable. Sur ce point, pas d’angle mort packaging évident.

### 3) Le vrai problème : écrasement silencieux des commandes existantes

Le point faible est ici, pas dans la présence du dossier.

`copyDirRecursive()` :

- skippe seulement `CLAUDE.md` s’il existe déjà ;
- pour tout autre fichier, fait un `copyFileSync(srcPath, destPath)` sans check d’existence préalable ;
- ne distingue pas les commandes natives des autres fichiers.

Conséquence :

- si le projet cible a déjà `.claude/commands/atelier-config.md`, il sera **écrasé** ;
- si le projet cible a une version customisée d’une commande native fournie par le package, elle sera **perdue** ;
- si plusieurs commandes existent déjà, le comportement est **last writer wins**, pas merge conservateur.

Donc la partie du handoff :

> "sans écraser les commandes existantes"

est **fausse en l’état**.

### 4) Couverture documentaire et tests

Je vois un petit drift de produit/documentation :

- `README.md`, `PARITY.md`, `website/docs/intro.md` parlent surtout des `skills/` ;
- la structure installée documentée ne met pas vraiment en avant `commands/` ;
- aucun test visible ne couvre la copie ou la non-régression de `.claude/commands/`.

Autrement dit, la feature existe dans le code, mais elle n’est **pas encore verrouillée** par la doc ni par les tests.

Ce n’est pas bloquant pour la validité du commit, mais c’est un angle mort réel : une régression future sur `commands/` passerait probablement sous le radar.

### Conclusion nette

- **`/atelier-config`** : probablement bien structurée pour une commande native file-based ; je ne vois pas de vice de forme manifeste.
- **Reconnaissance Claude Code** : plausible, **pas prouvée** par test dans ce repo.
- **`init` copie bien `.claude/commands/`** : oui.
- **`init` préserve les commandes existantes** : **non**. Il les écrase, sauf cas spécial `CLAUDE.md`.

### Action prioritaire

- [ ] Corriger ou nuancer l’affirmation produit : aujourd’hui `init` installe les commandes natives, mais **ne garantit pas** la préservation des commandes existantes.
- [ ] Ajouter un test d’installation ciblé sur `.claude/commands/` pour distinguer “copié” de “copié sans écrasement”.
- [ ] Documenter `commands/` explicitement dans la structure installée pour éviter le drift entre feature réelle et vitrine produit.

---

## Intégration

Retenu et appliqué immédiatement :

**Bug écrasement corrigé** — `copyDirRecursive()` accepte maintenant `{ skipExisting }`. L'appel pour `.claude/commands/` passe `skipExisting: true` : les commandes natives existantes sont préservées, identique au comportement de `CLAUDE.md`. Correction minimale, sans refactoring de l'API publique.

Écarté :
- Proposition d'ajouter un test d'installation ciblé sur `.claude/commands/` — légitime mais hors scope commit atomique ; à faire en PR dédiée.
- Drift doc (`commands/` peu documenté dans README/PARITY) — laissé pour un chore doc séparé.

La question sur la reconnaissance native de `/atelier-config` par Claude Code reste sans preuve automatisée dans le repo, mais aucun vice de forme détecté. Pas d'action bloquante.
