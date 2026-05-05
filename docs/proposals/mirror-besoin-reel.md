# MIRROR — Besoin réel

Date : 2026-05-02  
Statut : cadrage besoin, avant architecture

## Problème réel

Je capture beaucoup d’idées, mais elles ne produisent pas assez d’impact.

Sources actuelles :

- notes iPhone / Apple Notes ;
- vocaux ;
- captures d’écran ;
- vidéos YouTube ;
- liens ;
- idées écrites tard, loin du Mac ;
- notes de roadmap pensées hors session de dev.

Le problème n’est pas de stocker ces éléments. Le problème est qu’ils sont oubliés, sous-exploités ou réexpliqués manuellement à Claude plusieurs jours plus tard.

## Besoin central

Avoir un point de dépôt simple, accessible depuis iPhone et Mac, où je peux jeter tout ce qui me semble pertinent.

Ce dépôt doit ensuite produire un effet réel :

- alimenter un projet existant ;
- faire naître un futur projet ;
- enrichir une roadmap ;
- préparer une session Claude ;
- déclencher une proposition de plan ou de challenge ;
- éviter de devoir recoller une capture ou réexpliquer une note à Claude.

## Formulation courte

Je veux que chaque note utile finisse par atteindre le bon contexte Claude, sans que je doive m’en souvenir moi-même.

Je veux aussi que chaque projet ait une mémoire réelle, attachée au projet, pour que Claude puisse s’y retrouver sans relire tout le repo ni brûler les tokens.

## Contexte de travail

- Plus de 20 projets existent.
- Environ 5 projets sont actifs.
- Environ 2 projets sont vraiment sur le feu.
- Les idées circulent entre projets : les vases communicants sont une source d’économie d’échelle.
- Le Mac peut rester allumé H24.
- Un LLM local via Ollama peut tourner en arrière-plan.
- Claude peut reprendre ensuite via les vaults projet.

## Ce que le système doit permettre

### Capture immédiate

Depuis iPhone ou Mac, je dois pouvoir déposer rapidement :

- une note brute ;
- un vocal ;
- une capture d’écran ;
- un lien YouTube ;
- une URL ;
- une idée de roadmap ;
- une intuition de feature ;
- une remarque sur un projet existant ;
- une idée sans projet encore défini.

La capture doit être plus importante que le rangement initial. Le système range ensuite.

### Digestion automatique

Un assistant de niveau supérieur doit :

- lire les nouvelles entrées ;
- transcrire les vocaux ;
- résumer les vidéos ou liens ;
- extraire les intentions ;
- détecter le ou les projets concernés ;
- distinguer idée, bug, roadmap, décision, ressource, inspiration ;
- proposer une destination ;
- garder une trace de la source.

### Distribution vers les projets

Le système doit alimenter les vaults projet avec le bon niveau de synthèse.

Claude ne doit pas avoir à relire tout le dépôt global. Il doit trouver, dans le projet courant, le courrier pertinent déjà préparé.

### Vault projet

Le vault projet est le besoin initial et reste la pièce centrale.

Son rôle :

- donner à Claude une mémoire locale fiable du projet ;
- éviter de répéter le contexte à chaque session ;
- réduire la consommation de tokens ;
- augmenter la qualité des échanges ;
- garder les décisions, roadmaps, découvertes et angles morts au même endroit ;
- permettre à Claude de continuer le travail sans repartir de zéro.

Le vault projet ne doit pas être une archive passive. Il doit être le point de reprise opérationnel de Claude pour ce projet.

Le vault global est une extension de cette idée : si les vaults projet sont utiles, un niveau global peut permettre de faire circuler les apprentissages entre projets.

Mais le global ne doit pas écraser le local. Le vault projet reste la mémoire de travail principale.

### Reprise de session

Quand Claude démarre sur un projet, il doit pouvoir voir rapidement :

- ce qui est arrivé depuis la dernière session ;
- quelles notes externes concernent ce projet ;
- quelles idées méritent un plan ;
- quelles idées doivent être challengées ;
- quelles captures, vocaux ou liens sont liés à ce travail.

### Interaction proactive

À terme, Claude ou l’assistant doit pouvoir dire :

> Une idée issue de ton vocal d’hier soir semble concerner ce projet. Tu veux qu’on en fasse un plan et qu’on la challenge ?

Le système ne doit pas seulement archiver. Il doit préparer l’action.

## Ce que je ne veux pas

- Un vault pour le plaisir d’avoir un vault.
- Une base documentaire morte.
- Une organisation qui demande plus de discipline qu’elle n’en économise.
- Recopier manuellement les notes dans Claude.
- Rechercher une capture pendant 10 minutes pour expliquer un contexte.
- Redire à Claude ce que j’avais déjà noté.
- Une mémoire globale qui pollue tous les projets.
- Une automatisation qui décide trop vite sans contrôle.

## Principe produit

Le dépôt global est une boîte d’entrée intelligente, pas une encyclopédie.

Les vaults projet sont des boîtes aux lettres préparées pour Claude.

L’assistant supérieur trie, résume et propose. Claude projet lit, challenge et transforme en plan ou en dev.

## Architecture implicite du besoin

### Niveau global

Un fichier ou dossier d’entrée unique, accessible partout :

- depuis iPhone ;
- depuis Mac ;
- via réseau local ou synchronisation ;
- lisible par un assistant local.

Rôle : capturer sans friction.

### Niveau digestion

Un assistant local H24 ou lancé par cron :

- traite les nouvelles entrées ;
- extrait le sens ;
- classe ;
- route ;
- garde la trace ;
- prépare les messages pour les projets.

Rôle : transformer le brut en contexte exploitable.

### Niveau projet

Chaque projet reçoit uniquement ce qui le concerne :

- brief court ;
- nouvelles entrées pertinentes ;
- idées à challenger ;
- roadmaps candidates ;
- liens vers sources.

Rôle : permettre à Claude de reprendre vite et d’agir.

Le niveau projet est prioritaire sur le niveau global : l’objectif premier est que Claude travaille mieux sur le projet courant, avec moins de tokens et moins de répétition.

## Risque principal

Le risque n’est pas de manquer de stockage. Le risque est de créer une mémoire qui classe mais ne déclenche jamais d’action.

Le système doit donc être conçu autour de la question :

> Quelle prochaine action Claude peut-il proposer grâce à cette note ?

## MVP recommandé

Commencer avec trois surfaces seulement :

1. `inbox.md` ou dossier `inbox/` global accessible depuis iPhone/Mac.
2. `digest.md` global produit par l’assistant local.
3. `mailbox.md` par projet, lu par Claude au démarrage.

Flux minimal :

```text
note/vocal/capture/lien
→ inbox globale
→ digestion locale
→ mailbox du ou des projets concernés
→ Claude lit
→ Claude propose plan/challenge/action
```

## Critère de réussite

Le système réussit si une note prise vendredi soir peut provoquer lundi :

- une proposition de plan ;
- un challenge d’idée ;
- une entrée roadmap ;
- ou une session de dev ;

sans que j’aie à me souvenir de la note ni à la recoller manuellement à Claude.
