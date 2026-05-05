# Handoff — [SUJET]

> Date : [YYYY-MM-DD]
> Type : review | debug | architecture | exploration
> Priorité : haute | moyenne | basse
> reviewedRange: [sha-from]..[sha-to]    <!-- from = base de review, to = HEAD à l'intégration. Auto-rempli par handoff-draft.sh. -->


---

## De : [Claude | Copilot/GPT]

### Contexte

<!-- 3-5 phrases max. Qu'est-ce qui a été fait, où en est-on. -->

### Question précise

<!-- UNE question claire. Pas 10. Si tu en as 10, fais 10 handoffs. -->

### Fichiers à lire

<!-- Liste des chemins relatifs. L'autre LLM doit pouvoir les lire directement. -->

```text
src/fr/CLAUDE.md
src/fr/orchestration/subagents.md
```

### Contraintes / hors scope

<!-- Ce que l'autre LLM ne doit PAS faire (ex: "ne pas modifier le code",
     "ne pas proposer de migration", "rester sur l'architecture actuelle"). -->

---

## Réponse de : [Copilot/GPT | Claude]

**INSTRUCTION POUR LE LLM QUI REPOND :**
Tu DOIS écrire ta réponse **directement dans CE MÊME FICHIER `.md`**, à la
suite du document existant, dans la section `## Réponse de : [Copilot/GPT | Claude]`.
**Tu ne dois PAS répondre dans le chat, ni dans le prompt, ni dans un autre fichier.**
Ce document est le **vase communicant** entre les deux LLMs : la réponse utile
doit vivre ici, pas ailleurs. Utilise ton outil d'édition de fichier
(Edit, Write, ou équivalent) pour écrire ci-dessous.
Quand tu as fini, dis simplement à l'utilisateur :
"J'ai écrit ma réponse dans [chemin du fichier]. Tu peux la montrer à [l'autre LLM]."

<!-- Réponse ci-dessous -->

---

## Intégration

<!-- Rempli par le LLM d'origine après avoir lu la réponse.
     Qu'est-ce qui a été retenu ? Qu'est-ce qui a été écarté et pourquoi ? -->
