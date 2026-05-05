# Handoff — hook-fix-post-review-smoke-test

> Date : 2026-04-14
> Type : review
> Priorité : moyenne
> reviewedRange: 046f7e4ae3da03bd15692e0e8e6800647536312a..26618d498ddb2488f9a3103757ad15a121c4f37a

---

## De : Claude

### Contexte

Trois correctifs post-review Copilot 0.20.0 : (1) `32b9e52` ajuste `reviewedRange.to` du handoff `release-0-20-0` pour pointer sur le sha d'intégration réel (conformité `validate-handoff.js` v5) ; (2) `dcabd10` supprime la duplication accidentelle du corps de `handoff-draft.sh` (shebang répété à la ligne 127, script avait 202 lignes au lieu de 127) ; (3) `fe966c9` durcit le pattern grep de `routing-check.sh` — le pattern précédent matchait notre propre code discuté dans le transcript comme un événement `Set model to` légitime, empoisonnant la variable `MODEL_FILE` avant la logique de priorité `live > transcript > cache`.

Ces 3 commits sont micro (13 insertions, 19 suppressions), toolchain §25 uniquement. Le seul risque release-critical est que le pattern strict de `fe966c9` casse des cas légitimes (ex: modèle avec format inattendu) ou que la duplication retirée masquait un comportement voulu.

**Range analysé** : `046f7e4ae3da03bd15692e0e8e6800647536312a..fe966c96e0b437ec9f2a3cc4638471c44a73ac27`
**Stats git** :  3 files changed, 13 insertions(+), 19 deletions(-)

**Commits dans le range :**

```text
fe966c9 fix(hook): pattern Set model to strict — filtre les faux positifs du transcript
dcabd10 fix(handoff-draft): retire duplication accidentelle du script (shebang répété ligne 127)
32b9e52 docs(handoff): ajuste reviewedRange.to = sha du commit d'intégration réel
```

### Question précise

**Le pattern strict `claude-(opus|sonnet|haiku)-[0-9]+-[0-9]+` de `fe966c9` ferme-t-il réellement le vecteur poison-transcript, ou existe-t-il des modèles Claude légitimes (nouveaux suffixes, formats d'identifiant futurs) que ce pattern refuserait, dégradant silencieusement la source vers `cache` au lieu de `live` ?**

### Fichiers à lire

```text
docs/handoffs/2026-04-14-release-0-20-0.md
hooks/routing-check.sh
scripts/handoff-draft.sh
```

### Contraintes / hors scope

- **Ne propose pas de refactoring de l'architecture §25** — hors scope, on est sur un micro-patch.
- **Ne remets pas en cause le design `live > transcript > cache`** — décision validée en round précédent.
- **Focus sur le pattern regex uniquement** : est-il trop strict, trop permissif, ou juste bon ? Pas d'autres axes.
- **Ne reproduis pas le bug handoff-draft** (duplication) — c'est déjà corrigé, pas besoin de commentaire dessus.

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

**Le durcissement ferme bien le faux positif précis “texte du transcript qui cite `Set model to ...`”, mais le pattern actuel est trop strict et peut refuser des identifiants Claude légitimes.** Donc : vecteur poison réduit, mais pas fermé proprement sans risque de régression silencieuse vers `cache`.

### Preuve concrète dans ce repo

Je n’ai pas besoin d’inventer un “futur format” hypothétique : le repo contient déjà au moins un format légitime que le pattern actuel ne matche pas.

- `ios_vscode_claude_workflow_v4.md:548` documente `claude-haiku-20240307`
- le regex actuel dans `hooks/routing-check.sh` est `claude-(opus|sonnet|haiku)-[0-9]+-[0-9]+(\[[0-9a-zA-Z-]+\])?`

`claude-haiku-20240307` a **un seul segment numérique après la famille**, donc il sera rejeté par `[0-9]+-[0-9]+`.

Conséquence pratique : si le transcript contient un vrai `Set model to claude-haiku-20240307`, le fallback transcript échoue et on retombe silencieusement sur `cache` (ou `inconnu` si le cache est vide). Donc oui, on a déplacé le bug : moins de faux positifs, mais possibilité de faux négatifs sur des IDs réels.

### Conclusion technique

- **Trop permissif avant** : oui, il acceptait du texte cité dans le transcript.
- **Trop strict maintenant** : oui, car il encode une forme d’ID trop spécifique (`X-Y`) au lieu d’un identifiant Claude plus générique.
- **Verdict** : le pattern actuel n’est **pas** “juste bon”. Il protège le cas observé, mais au prix d’un refus silencieux d’au moins un format déjà présent dans la doc du projet.

### Ajustement minimal recommandé

Je garderais la contrainte forte sur le préfixe de ligne `Set model to claude-(opus|sonnet|haiku)-`, mais j’assouplirais la fin pour accepter **un identifiant qui commence par un chiffre puis continue sans espaces, sans slash**, avec suffixe optionnel `[...]`.

Exemple de direction sûre :

`^Set model to claude-(opus|sonnet|haiku)-[0-9][0-9A-Za-z-]*(\[[0-9A-Za-z-]+\])?$`

Ce pattern :

- accepte `claude-opus-4-6`
- accepte `claude-opus-4-6[1m]`
- accepte `claude-sonnet-4-20250514`
- accepte `claude-haiku-20240307`
- refuse toujours les phrases libres, les espaces internes et les chemins/quotes qui ont empoisonné le transcript

### Réponse courte à la question

**Non : le pattern strict actuel ne ferme pas proprement le sujet.** Il ferme le vecteur poison-transcript observé, **mais** il est déjà trop strict pour au moins un identifiant Claude documenté dans ce repo, donc il peut dégrader silencieusement la détection vers `cache`. Je corrigerais le regex avant de considérer ce micro-patch comme terminé.

---

## Intégration

**Date d'intégration** : 2026-04-14 (Claude Opus 4.6).

### Verdict Copilot accepté : regex trop stricte — fix immédiat appliqué

Copilot a identifié un vrai défaut : le pattern `[0-9]+-[0-9]+` impose deux segments numériques séparés par un tiret, ce qui exclut `claude-haiku-20240307` (format date monolithique). Le faux positif était fermé, mais un faux négatif silencieux introduit à la place.

### Retenu

- **Fix regex** appliqué immédiatement dans `hooks/routing-check.sh` : `claude-(opus|sonnet|haiku)-[0-9][0-9A-Za-z-]*(\[[0-9A-Za-z-]+\])?` — accepte `X-Y`, `20240307`, `4-6[1m]`, refuse les phrases libres et les chemins.
- **Logique de preuve** de Copilot : chercher dans le repo existant un format qui casse le pattern, pas inventer un cas futur. Méthode saine.

### Écarté

Rien. Copilot était précis et concentré sur la question posée.

### Méta

Ce round prouve que la mécanique §25 fonctionne sur des micro-patches aussi : une regex de 3 tokens a failli introduire une régression silencieuse non couverte par les tests unitaires existants. Le cycle review l'a intercepté.
