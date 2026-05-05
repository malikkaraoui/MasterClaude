# Handoff — V2 actionneur plugin via socket

> Date : 2026-04-15
> Type : plan-review
> Priorité : haute
> Sujet : actionneur automatique de switch modèle dans le plugin Claude Code VS Code

---

## Contexte

Objectif : passer de la V1 **capteur + recommandation** à une V2 avec **actionneur automatique réel** pour le **plugin Claude Code dans VS Code**.

Contrainte clé : on ne parle **pas** du mode terminal/CLI ici. Le problème à résoudre est le **chat plugin / webview VS Code**, où `tmux send-keys` ne pilote pas la bonne surface.

Plan soumis :

1. **Vecteur 1 — URI handler officiel**
   - `vscode://anthropic.claude-code/open`
   - utile pour ouvrir/interagir avec l’extension depuis l’extérieur
   - insuffisant pour un switch de modèle

2. **Vecteur 2 — Unix socket via `claude-commander`**
   - wrapper `claudec` qui lance Claude Code avec un socket par session : `/tmp/claudec-<SESSION_ID>.sock`
   - injection JSON :
     - `{"action":"send","text":"/model sonnet"}`
   - utilisation depuis un hook Claude Code via `session_id`

---

## Validation runtime (2026-04-15 — Claude)

### V1 — `session_id` dans les hooks ✅ CONFIRMÉ

Test : `echo "$_RAW_INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(list(d.keys()))"` dans `routing-check.sh`.

Résultat observé :
```
[DEBUG hook-keys] [‘session_id’, ‘transcript_path’, ‘cwd’, ‘permission_mode’, ‘hook_event_name’, ‘prompt’]
```

`session_id` est fourni à chaque `UserPromptSubmit`. Le chemin `/tmp/claudec-<SESSION_ID>.sock` est construisible dynamiquement.

**Action réalisée :** `hooks/_parse-input.sh` mis à jour — `HOOK_SESSION_ID` ajouté, disponible pour tous les hooks qui sourcent ce fichier.

### V2 — Protocole JSON de claudec ⏳ EN ATTENTE

`claudec` non encore installé. À valider avant implémentation : `{"action":"send","text":"/model sonnet"}` est le format supposé d’après le plan. Source à confirmer via README ou test `nc -U`.

### V3 — Full-auto vs semi-auto ⏳ EN ATTENTE

Deux options pour Step 5 :
- **A)** Switch auto immédiat sur verdict fort (⬆️ insuffisant / ⬇️ surdimensionné), sans confirmation
- **B)** Proposition + confirmation utilisateur → switch

Décision requise avant d’implémenter la boucle décisionnelle.

### V4 — `claudeCode.claudeProcessWrapper` ✅ CONFIRMÉ

Setting présent dans le manifest de l’extension installée :
```json
"claudeCode.claudeProcessWrapper": {
  "type": "string",
  "description": "Executable path used to launch the Claude process."
}
```

Point d’ancrage officiel validé. À configurer dans `.vscode/settings.json` du workspace.

---

## Verdict (Copilot/GPT)

**Oui : c’est le premier plan qui correspond vraiment au mode plugin.**

Je recommande de partir sur le **vecteur socket** comme actionneur V2 principal.

Pourquoi :

- il agit sur **la session Claude Code elle-même**, pas sur un terminal voisin ;
- il est **programmable** ;
- il évite la fragilité d’un pilotage UI pur type `osascript`/clic sur dropdown ;
- il colle mieux au besoin “transparent / automatique” que `tmux`, qui ne résout que le mode terminal.

Mais le plan doit être légèrement corrigé avant de partir en implémentation.

---

## Ce que j’ai pu vérifier

### 1. Le plugin VS Code expose un vrai point d’entrée wrapper

Dans le manifeste de l’extension `anthropic.claude-code`, il existe bien le setting :

- `claudeCode.claudeProcessWrapper`

Description du manifeste :

> Executable path used to launch the Claude process.

C’est **le point d’ancrage officiel le plus important** pour ce plan.

Donc : **oui, il existe une couture native côté extension pour lancer Claude via un wrapper**, sans bricoler le chat UI.

### 2. `nc -U` est disponible localement sur cette machine

Vérifié en terminal :

- `/usr/bin/nc` présent
- option `-U` supportée (`Use UNIX domain socket`)

Donc l’injection Unix socket via netcat est **viable sur ce macOS**.

### 3. Le point `npm install -g claude-commander` n’est pas confirmé

Le README du repo `sstraus/claude-commander` récupéré via GitHub documente :

- téléchargement du binaire depuis Releases
- ou `cargo install --git ...`

Je **n’ai pas trouvé de preuve** dans ce que j’ai vérifié qu’un package npm `claude-commander` soit la voie officielle d’installation.

Donc ce point doit être reformulé ainsi :

- **installer `claudec` via le mode documenté par le projet** (release binaire ou cargo)
- **ne pas présumer npm tant que ce n’est pas confirmé**

---

## Pourquoi le vecteur URI n’est pas la solution

Le handler `vscode://anthropic.claude-code/open` est utile comme **preuve de canal natif** vers l’extension.

Mais ce n’est **pas** un actionneur de switch modèle :

- il ouvre/focus l’extension
- il ne fournit pas un transport de commande vers la session active
- il ne remplace ni `/model`, ni une API d’injection

Conclusion :

- **garder l’URI handler comme outil auxiliaire** éventuellement
- **ne pas le traiter comme backend d’actionneur**

---

## Pourquoi le socket est meilleur que tmux et meilleur que l’UI scripting

### Meilleur que tmux

`tmux` ne règle que le **REPL terminal**.

Dans le plugin VS Code :

- le chat n’est pas un TTY pilotable depuis le workspace ;
- injecter dans un terminal ne garantit pas d’atteindre la session plugin ;
- tu perds le contexte “vraie session active du chat”.

### Meilleur que `osascript`

Un pilotage UI macOS reste possible, mais il est fragile :

- dépend du focus ;
- dépend du libellé visuel du menu ;
- dépend du layout et des changements UI extension ;
- casse plus facilement après update de VS Code ou de l’extension.

Le socket, lui, cible la **session** plutôt que l’apparence de l’UI.

---

## Les corrections à apporter au plan avant feu vert

### 1. Ne pas formuler `session_id` comme acquis universel

Le README de `claude-commander` indique que les hooks reçoivent du JSON contenant `session_id` pour construire le chemin de socket.

Mais dans le repo `claude-atelier` actuel :

- `hooks/_parse-input.sh` **ne parse pas** `session_id`
- aucun hook existant ne l’extrait aujourd’hui

Donc la bonne formulation est :

> Si la session Claude Code est lancée via `claudec` et que le hook reçoit bien `session_id`, alors on peut construire dynamiquement `/tmp/claudec-<SESSION_ID>.sock`.

Autrement dit :

- **le plan est crédible**
- mais **le contrat runtime doit être validé une fois en prod** avant d’être considéré verrouillé

### 2. Le wrapper doit devenir le backend plugin officiel

Le vrai choix d’architecture n’est pas juste “ajouter un script socket”.

Il faut décider une hiérarchie d’actionneurs claire :

1. **plugin + wrapper socket** → backend prioritaire
2. **terminal + tmux** → fallback CLI
3. **manuel** → dernier recours

Sinon tu garderas plusieurs chemins actifs sans savoir lequel est la vérité runtime.

### 3. Garder l’injection JSON minimale

Pour V2, il faut rester minimal :

- `{"action":"send","text":"/model sonnet"}`

Pas de protocole maison, pas de couche additionnelle tant que le transport socket n’est pas validé de bout en bout.

---

## Plan d’implémentation recommandé

### Étape 1 — Activer le wrapper côté plugin

Configurer l’extension Claude Code avec :

- `claudeCode.claudeProcessWrapper = <chemin vers claudec>`

Objectif : faire en sorte que **la session plugin elle-même** soit lancée via le wrapper socket.

### Étape 2 — Étendre le parseur des hooks

Ajouter dans `hooks/_parse-input.sh` :

- `HOOK_SESSION_ID`

à partir du JSON stdin du hook.

Objectif : rendre `session_id` disponible partout sans réécrire chaque hook.

### Étape 3 — Ajouter un backend socket dans `scripts/switch_model.py`

Au lieu de créer un deuxième script sans nécessité, je recommande :

- **étendre `scripts/switch_model.py`**

avec logique de backend :

1. si `session_id` + socket existent → **socket**
2. sinon si `tmux` disponible → **tmux**
3. sinon → **échec explicite + instruction manuelle**

Objectif : conserver **un seul point d’entrée** pour le switch.

### Étape 4 — Préflight avant injection

Avant envoi :

- vérifier que `session_id` n’est pas vide
- vérifier que le socket existe
- idéalement tester `{"action":"status"}` ou `{"action":"ping"}` si supporté
- n’envoyer `/model <alias>` que si le backend répond

Objectif : éviter les faux succès silencieux.

### Étape 5 — Brancher la décision V1 sur l’actionneur V2

Le capteur existe déjà :

- `[METRICS]` + flèche `⬆️ / ⬇️ / =`

La couche décisionnelle devient :

- si verdict neutre → rien
- si verdict non neutre → Claude propose
- si validation utilisateur → appel `scripts/switch_model.py <alias>`
- le script choisit le backend (`socket` si plugin wrapper actif, sinon `tmux` si terminal)

---

## Risques réels à garder en tête

### Risque 1 — Dépendance externe non officielle

`claude-commander` n’est pas le client officiel Anthropic.

Donc :

- très bon candidat technique
- mais dépendance externe à versionner / surveiller
- possible drift si le wrapper cesse d’être compatible avec Claude Code

### Risque 2 — Contrat hook/session non encore prouvé dans ce repo

Le repo externe dit que `session_id` arrive dans les hooks.

Je n’ai pas de preuve locale dans `claude-atelier` que :

- le plugin lancé via wrapper
- + les hooks actuels
- + le JSON runtime réel

fournissent déjà ce champ exactement comme attendu.

C’est un risque de **validation runtime**, pas un veto architectural.

### Risque 3 — Multiplication des backends

Si tu laisses coexister sans règle claire :

- socket plugin
- tmux terminal
- osascript UI

alors tu vas accumuler du comportement implicite.

Il faut une priorité nette.

Ma reco :

- **socket > tmux > manuel**
- `osascript` seulement comme outil de diagnostic ou fallback expérimental, pas comme backend principal

---

## Recommandation finale

**Oui, je pousserais ce plan à Claude pour relecture.**

Mais dans cette forme :

- **vecteur socket = backend V2 principal**
- **URI handler = canal auxiliaire, pas solution**
- **installation de `claudec` via méthode documentée par le projet, pas npm présumé**
- **validation runtime de `session_id` obligatoire avant merge**
- **backend unique dans `switch_model.py` avec priorité socket > tmux > manuel**

---

## Résumé ultra-court à partager

- `tmux` ne résout que le CLI, pas le plugin
- le plugin Claude Code expose `claudeCode.claudeProcessWrapper` : c’est la vraie couture officielle à exploiter
- `claude-commander` + socket par `session_id` est le meilleur candidat V2 pour un switch transparent dans VS Code
- attention : le point `npm install -g claude-commander` n’est pas confirmé ; le README du projet documente surtout binaire/cargo
- avant implémentation, il faut valider une fois que les hooks lancés via wrapper reçoivent bien `session_id`
