# Handoff — Review architecture enforcement §25

> Date : 2026-04-14
> Type : review
> Priorité : haute

---

## De : Claude

### Contexte

Sur `claude-atelier`, j'ai fini une grosse séance d'inspiration depuis `claw-code` et j'ai déjà produit un diagnostic dur sur notre angle mort principal : **§25 existe dans les textes mais pas encore dans les garanties runtime**.

Le problème identifié n'est pas un simple oubli de Claude. C'est plus structurel : nos hooks actuels (`routing-check.sh`, `guard-review-auto.sh`) savent rappeler qu'une review externe est souhaitable, mais ils **effacent ou blanchissent partiellement la dette** sans exiger de preuve réelle qu'un handoff a été créé, répondu, ou intégré.

J'ai déjà une proposition de chantier en 4 lots :

1. arrêter le faux acquittement,
2. afficher une dette de handoff visible,
3. bloquer le push si la dette dépasse le seuil sans preuve de review,
4. réduire ensuite la friction (auto-draft, tags de commit, etc.).

Je veux maintenant un **contre-pouvoir d'architecture**, avant d'implémenter. Pas une review cosmétique ; une vraie validation de la mécanique d'enforcement.

### Question précise

**Quelle est la plus petite architecture fiable pour rendre §25 réellement coercitif sans créer une usine à gaz, et où mon plan actuel risque-t-il encore de mentir sur la preuve de review ?**

Je veux une réponse opinionnée et concrète :

- l'artefact minimal à exiger comme preuve,
- le point exact où bloquer,
- et les 2 pièges structurels les plus probables si j'implémente ça naïvement.

### Fichiers à lire

```text
.claude/CLAUDE.md
hooks/routing-check.sh
hooks/guard-review-auto.sh
scripts/pre-push-gate.sh
test/doctor.js
docs/handoffs/2026-04-14-review-inspiration-claw-code-v0.7-to-0.15.md
.claude/ecosystem/challenger.md
```

### Contraintes / hors scope

- Ne pas proposer de service externe, base de données, daemon ou infra dédiée.
- Rester dans la philosophie actuelle : markdown + shell + JS, repo local, coûts d'implémentation modestes.
- Ne pas proposer de migration vers un policy engine, du Rust, ou une réécriture globale des hooks.
- Ne pas répondre avec des généralités du type « faites plus de reviews ».
- Si tu recommandes une preuve de review, définis **exactement** ce qui fait foi (ex : fichier handoff daté, réponse non vide, intégration remplie, commit taggé, etc.).
- Ne propose pas la piste punitive mémoire/culpabilisation utilisateur ; je l'ai déjà écartée.
- Focus : **minimum viable enforcement crédible**, pas framework de gouvernance total.

---

## Réponse de : Copilot/GPT

**INSTRUCTION POUR LE LLM QUI REPOND :**
Tu DOIS écrire ta réponse **directement dans ce fichier**, dans cette
section. N'écris PAS ta réponse dans le chat. Utilise ton outil d'édition
de fichier (Edit, Write, ou équivalent) pour écrire ci-dessous.
Quand tu as fini, dis simplement à l'utilisateur :
"J'ai écrit ma réponse dans [chemin du fichier]. Tu peux la montrer à Claude."

<!-- Réponse ci-dessous -->

---

## Intégration

<!-- Rempli par Claude après avoir lu la réponse.
     Qu'est-ce qui a été retenu ? Qu'est-ce qui a été écarté et pourquoi ? -->
