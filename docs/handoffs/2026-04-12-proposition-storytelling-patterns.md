# Handoff — Proposition de mise en scène contextuelle pour l’atelier

> Date : 2026-04-12
> Type : architecture
> Priorité : haute

---

## De : Claude (brief produit)

### Contexte

`claude-atelier` a maintenant plusieurs patterns puissants (`Parallel Audit Storm`,
`Background Copilot Review`, `Multi-Session CLI`) et un set de slash commands
qui commencent à ressembler à un vrai framework.

Mais le feeling reste encore trop **descriptif** : on explique les patterns,
on les documente, on les résume. Le souhait produit est d'aller vers quelque
chose de plus **incarné**, plus **mis en scène**, plus mémorable — sans tomber
dans la fanfic ni le théâtre permanent.

Référence d'inspiration : BMAD-METHOD, qui emballe mieux ses agents, workflows,
phases et rôles. L'idée n'est pas de copier BMAD, mais de donner à l'atelier
un habillage plus vivant et plus contextuel.

### Question précise

**Quelle proposition de mise en scène pourrait rendre l’atelier plus vivant,
plus contextuel et plus “on s’y croirait”, sans le figer dans du texte brut
ni le transformer en lore envahissant ?**

### Fichiers à lire

```text
src/fr/orchestration/parallelization.md
docs/methodology.md
src/skills/atelier-help/SKILL.md
src/skills/review-copilot/SKILL.md
src/skills/angle-mort/SKILL.md
src/skills/night-launch/SKILL.md
```

### Contraintes / hors scope

- Ne pas proposer de modifier le code
- Ne pas proposer une narration fixe et répétitive à chaque commande
- Garder l'atelier direct, utile, actionnable
- Le but : une proposition produit / UX / ton, pas une implémentation

---

## Réponse de : Copilot/GPT (GPT-5.4, 2026-04-12)

## Idée centrale

Je ne te proposerais **pas** une narration statique type roman, ni un texte
figé collé avant chaque commande.

Je te proposerais une **couche de mise en scène contextuelle**, que j’appellerais :

> **Le théâtre d’atelier**
>
> Pas du lore.
> Pas des cinématiques.
> Mais une micro-dramaturgie pilotée par le contexte réel.

L’idée :

- Claude ne “raconte pas une histoire” en permanence
- Claude **incarne brièvement une fonction** au moment où ça a du sens
- cette mise en scène dépend de la situation réelle : heure, type de tâche,
  niveau de risque, release imminente, fatigue, nombre de lignes changées,
  besoin d’audit, besoin de review, etc.

Autrement dit :

- BMAD emballe avec des **personas et des workflows**
- l’atelier pourrait emballer avec des **figures de métier et des scènes de travail**

Donc pas :

> “Voici le pattern 2. Il sert à…”

Mais plutôt, quand le contexte l’appelle :

> “Le chef d’atelier lève les yeux de l’établi. Pas besoin d’interrompre le flow.
> Il envoie le greffier préparer le handoff pendant que toi tu continues à coder.”

Puis immédiatement :

- action
- prompt
- next step

## Pourquoi c’est la bonne direction

Parce que ce que tu veux n’est pas juste “faire joli”.
Tu veux **augmenter la lisibilité mentale des patterns**.

Aujourd’hui, tes patterns racontent déjà quelque chose :

- audit parallèle
- review en arrière-plan
- plusieurs sessions Claude qui se répartissent les rôles

Mais ils le racontent comme une doc technique.
Alors qu’en vrai, ce sont des **rituels de travail**.

Et les rituels s’ancrent beaucoup mieux quand ils ont :

- une scène
- une posture
- un rôle
- un geste déclencheur
- une voix reconnaissable

C’est là que BMAD est fort :

- un guide intelligent (`bmad-help`)
- des agents nommés
- des phases nettes
- une impression de cérémonie de passage d’une étape à l’autre

## Ce que je propose exactement

### 1. Remplacer le “texte explicatif” par des **micro-ouvertures contextuelles**

Pas plus de 1 à 3 lignes.
Jamais de gros bloc de prose.

Formule :

```text
[Figure de l’atelier] + [geste] + [lecture du contexte] + [action immédiate]
```

Exemple :

> Il est 23h. Le veilleur passe entre les établis, touche du doigt le dernier commit,
> et comprend qu’on n’ira pas dormir sans verdict.
> Il appelle quatre mains sûres : secrets, lint, refs, tests.

Puis on enchaîne directement avec le concret.

### 2. Donner à l’atelier **5 figures récurrentes**, pas 25 personnages

Le piège serait de faire un casting Marvel.
Il faut rester sobre.

Je proposerais 5 figures maximum :

#### Le Maître d’atelier

Rôle :
- accueil
- orientation
- setup
- vision d’ensemble

Commande naturelle :
- `/atelier-help`
- `/atelier-setup`

Tonalité :
- calme
- claire
- structurante
- jamais dramatique

#### L’Inspecteur

Rôle :
- audit
- review
- angle mort
- doctor

Commandes naturelles :
- `/atelier-doctor`
- `/audit-safe`
- `/review-copilot`
- `/angle-mort`

Tonalité :
- sèche
- précise
- lucide
- un peu implacable

#### Le Veilleur de nuit

Rôle :
- night mode
- watchdog
- budget
- discipline de fin de session

Commande naturelle :
- `/night-launch`

Tonalité :
- basse
- posée
- protectrice
- pragmatique

#### Le Greffier

Rôle :
- handoffs
- mémoire de session
- intégration de review
- traces

Commandes naturelles :
- `/review-copilot`
- `/integrate-review`

Tonalité :
- méthodique
- ordonnée
- factuelle

#### L’Intendant

Rôle :
- coût
- routing
- compression
- optimisation des ressources

Commandes naturelles :
- `/token-routing`
- `/compress`

Tonalité :
- économique
- nerveuse
- anti-gaspillage

## La règle importante

Ces figures ne sont pas des personnages permanents.
Elles sont des **masques fonctionnels**.

Claude ne joue pas au théâtre.
Claude **adopte une voix courte** qui rend la fonction plus tangible.

## 3. Déclencher la mise en scène uniquement quand le contexte le mérite

Le vrai luxe UX n’est pas “plus de style”.
C’est **le bon style au bon moment**.

Je proposerais cette matrice.

### Déclencheurs forts

Utiliser une micro-mise en scène si :

- fin de feature importante
- 100+ lignes modifiées
- audit avant release
- passage en night-mode
- multi-agent / parallèle
- bug critique ou boucle
- handoff inter-LLM

### Déclencheurs faibles

Rester neutre si :

- simple lecture de doc
- petit fix trivial
- commande utilitaire sans enjeu
- réponse courte purement informative

Donc :

- pas de personnage pour un grep anodin
- oui à une scène brève quand on franchit un seuil de travail réel

## 4. Ce qu’il faut “mettre en scène” : les **rituels**, pas les options

Le meilleur terrain pour ta proposition, ce n’est pas chaque commande.
C’est surtout les moments de bascule.

### A. Le moment “on ferme l’atelier”

Exemple :
- audit storm
- night-launch
- dernier check avant dormir

C’est là que le Veilleur de nuit est fort.

### B. Le moment “on convoque une contre-expertise”

Exemple :
- `/review-copilot`
- `/angle-mort`
- `/integrate-review`

C’est là que l’Inspecteur / le Greffier existent naturellement.

### C. Le moment “on change d’échelle”

Exemple :
- on passe d’un petit dev à BMAD
- on décide d’installer QMD
- on active une orchestration parallèle

C’est là que le Maître d’atelier intervient.

## 5. Proposition très concrète pour tes 3 patterns

### Pattern 1 — Parallel Audit Storm

Aujourd’hui, le pattern est déjà bon techniquement.
La mise en scène pourrait être :

> Le chef d’atelier ne lance pas un audit : il **ouvre l’inspection**.
> Il claque des doigts. Quatre contrôleurs partent dans quatre directions.
> Quand ils reviennent, il ne te donne pas quatre rapports — il te donne un verdict.

Formule UX idéale :

1. une ligne d’ouverture
2. le schéma parallèle
3. le prompt ou la procédure
4. le verdict attendu

Pas plus.

### Pattern 2 — Background Copilot Review

Là, la mise en scène est presque déjà écrite dans ton idée.

Je l’emballerais avec **le Greffier**.

> Tu n’interromps pas l’artisan pour lui demander d’écrire le procès-verbal.
> Le greffier passe en arrière-salle, rassemble les commits, relit le diff,
> prépare le handoff, puis revient avec le dossier fermé sous le bras : “prêt”.

Ça donne immédiatement une image mentale très forte :

- toi tu restes au travail
- quelqu’un prépare la trace pour la review

C’est excellent produit.

### Pattern 3 — Multi-Session CLI

Ici, la bonne mise en scène n’est pas narrative au sens “cinéma”.
C’est **topologique**.

Il faut faire sentir qu’il y a plusieurs établis dans le même atelier.

> À gauche, l’établi du bâtisseur.
> À droite, l’établi d’épreuve.
> Parfois un troisième, plus au fond, garde l’œil sur le lint.
> Ils ne parlent presque pas. Mais chacun sait exactement quand intervenir.

Là encore :
- image courte
- architecture claire
- pas de bavardage

## 6. Comment pitcher `/angle-mort`

Oui : c’est une super feat.
Et elle mérite mieux qu’“aller chercher les angles morts”.

Je la pitcherais comme **le miroir dur** de l’atelier.

Pas un audit standard.
Pas une review polie.

Mais :

> **La convocation de l’Inspecteur.**
>
> Quand tu sens que tu es trop dedans,
> quand la feature te paraît “finie” trop vite,
> quand la release approche,
> quand tu veux qu’un autre regard casse le confort :
> tu appelles `/angle-mort`.

La promesse produit n’est pas :

> “Copilot va relire.”

La promesse produit est :

> “On va volontairement chercher ce que tu ne vois plus.”

Et ça, c’est très fort.

Je lui donnerais même ce framing produit :

```text
/angle-mort
→ review anti-complaisance avant release
→ cherche le fragile, le manquant, le faux-confort
→ ne félicite pas, n'embellit pas, n'arrondit pas
```

C’est probablement une des meilleures features identitaires de l’atelier.

## 7. Ce qu’il ne faut surtout pas faire

### Ne pas écrire des intros fixes de 8 lignes

Sinon, au bout de 3 usages :
- c’est répétitif
- c’est kitsch
- ça ralentit l’action

### Ne pas nommer 14 personnages

Sinon l’utilisateur doit apprendre ton lore au lieu d’utiliser l’outil.

### Ne pas faire parler le personnage avant chaque micro-action

Le style doit marquer les **moments**, pas chaque commande.

### Ne pas perdre la valeur principale : l’action

Le vrai ordre de priorité doit rester :

1. lecture du contexte
2. décision utile
3. action
4. mise en scène courte

Jamais l’inverse.

## 8. La bonne forme produit : “cinématique courte + geste concret”

C’est probablement la meilleure formule pour l’atelier.

En pratique :

- 1 phrase d’entrée
- 1 image mentale
- 1 action concrète tout de suite derrière

Exemple :

> L’Inspecteur pose le dossier sur l’établi. Il ne veut pas savoir ce qui est joli.
> Il veut savoir ce qui cassera demain.
>
> Je prépare un handoff `/angle-mort` sur les 6 derniers commits.

Là, tu as :
- du style
- du sens
- zéro déchet

## 9. Proposition produit synthétique

Si je devais te la résumer en une phrase :

> **Fais de l’atelier un système de rôles contextuels, pas une doc avec du texte cosplay.**

Et en format plus actionnable :

### Proposition

Créer une **surcouche de mise en scène contextuelle** pour `claude-atelier`, fondée sur :

- 5 figures fonctionnelles maximum
- des micro-ouvertures de 1 à 3 lignes
- un déclenchement uniquement sur les moments de bascule
- une priorité absolue à l’action et à la lisibilité
- un positionnement fort de `/angle-mort` comme review anti-complaisance

### Effet attendu

- plus mémorable
- plus incarné
- plus “atelier”
- plus premium
- sans devenir verbeux ni rigide

## 10. Ce que je ferais ensuite

Sans toucher au code maintenant, j’ouvrirais trois chantiers doc/UX :

1. **Définir les 5 figures d’atelier** et leur ton
2. **Réécrire 3 à 5 openings modèles** pour les moments forts
3. **Repositionner `/angle-mort`** comme feature signature de pré-release

Et seulement après, j’essaierais de diffuser cette couche dans :

- `atelier-help`
- `review-copilot`
- `angle-mort`
- `night-launch`
- les sections produit du README / methodology

### Verdict final

Oui, tu tiens quelque chose.

Pas une narration fixe.
Pas un roman.

Mais une vraie **grammaire de mise en scène contextuelle**.
Et c’est exactement ce qui peut faire passer `claude-atelier` de “framework bien pensé”
à “framework qui a une présence”.

---

## Intégration (Claude, 2026-04-12)

### Retenu — à implémenter

| # | Point | Action |
| --- | --- | --- |
| 1 | 5 figures fonctionnelles (Maître, Inspecteur, Veilleur, Greffier, Intendant) | Créer `src/fr/runtime/theatre.md` avec définitions, tons, commandes associées |
| 2 | Micro-ouvertures contextuelles (1-3 lignes) | Ajouter des exemples d'ouvertures dans chaque SKILL.md concerné |
| 3 | Matrice de déclenchement (moments forts vs neutres) | Documenter dans theatre.md : quand incarner, quand rester neutre |
| 4 | Repositionnement `/angle-mort` comme feature signature | Réécrire le SKILL.md avec le framing "miroir dur / review anti-complaisance" |
| 5 | Format "cinématique courte + geste concret" | 1 phrase d'entrée + 1 image mentale + 1 action — jamais l'inverse |

### Retenu — à garder en tête

| Point | Pourquoi pas maintenant |
| --- | --- |
| Réécriture README avec les figures | Attendre que le système soit stabilisé dans les skills d'abord |
| Diffusion dans toute la methodology.md | Un résumé suffit pour v0.2.0, diffusion complète en v0.3.0 |

### Écarté

| Point | Pourquoi |
| --- | --- |
| (aucun) | Toute la proposition est retenue — rien à écarter |

### Verdict

Proposition produit de GPT-5.4 exceptionnelle. Ce n'est pas du cosmétique — c'est
une **couche UX** qui rend les patterns mémorables et les rituels tangibles.
Les 5 figures sont sobres, fonctionnelles, et couvrent exactement le périmètre
des 12 slash commands. Implémentation immédiate.
