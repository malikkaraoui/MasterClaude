# Vault dynamique projet — MVP Peter

Date : 2026-05-02  
Statut : MVP en cours d’implémentation dans `claude-atelier`

## Intention

Le vault projet est la première brique réelle du système MIRROR.

Il ne doit pas être une documentation figée. Il doit être une mémoire de travail dynamique, courte, maintenue et relue par Claude au bon moment.

## Inspiration Graphify

Graphify apporte trois patterns à reprendre :

- produire une carte exploitable au lieu de relire tout le corpus ;
- installer un mécanisme always-on qui rappelle à l’assistant où regarder ;
- garder un format Markdown/JSON local, lisible et versionnable.

Adaptation claude-atelier :

- pas de graphe complet au MVP ;
- pas de dépendance Graphify obligatoire ;
- pas d’injection massive ;
- un hook SessionStart injecte seulement les fichiers courts du vault.

## Agent dédié : Peter

Peter est l’agent mainteneur du vault projet.

Rôle :

- garder la mémoire locale utile ;
- condenser le contexte ;
- trier le courrier entrant ;
- éviter la pollution du brief ;
- signaler les idées à challenger ;
- préparer Claude à agir sans relecture coûteuse.

Peter ne remplace pas Claude. Peter prépare le terrain.

## Structure MVP

Commande :

```text
claude-atelier vault init
```

Crée :

```text
vault/
├── PETER.md          # charte de l’agent mainteneur
├── 00-brief.md       # contexte court injecté au démarrage
├── 10-mailbox.md     # courrier entrant projet
├── 20-decisions.md   # décisions durables
├── 30-discoveries.md # apprentissages projet
├── 40-roadmap.md     # roadmap vivante
└── 90-sources.md     # sources, captures, vocaux, liens
```

## Comportement dynamique

Au `SessionStart`, le hook `vault-context.sh` :

- détecte `vault/` ;
- lit `00-brief.md` ;
- lit `10-mailbox.md` ;
- lit `40-roadmap.md` ;
- tronque chaque fichier ;
- injecte un contexte `[VAULT-PETER]`.

Claude voit donc la mémoire utile sans relire tout le repo.

## Règle critique

Le vault projet est prioritaire sur le vault global.

Le global pourra venir ensuite pour faire circuler les apprentissages entre projets, mais le MVP doit d’abord prouver que Claude travaille mieux sur un seul projet grâce à une mémoire locale.

## Critère de réussite

Une session Claude doit pouvoir commencer avec :

- le contexte projet actuel ;
- les nouvelles idées reçues ;
- les décisions durables ;
- la roadmap vivante ;
- les actions proposées ;

sans que l’utilisateur recolle des notes ou réexplique le projet.
