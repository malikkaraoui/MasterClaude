---
name: migrate-now
description: Préparer le handoff JSON avant migration de session par le master daemon. Déclenchée par MIGRATE_REQUEST dans l'inbox Telegram ou commande user explicite. Compose un résumé fil rouge, todos en cours, prochaine action, pièges, slice vault Malik, puis écrit le fichier handoff aux deux emplacements (live tmp + archive vault).
---

# /migrate-now — préparer l'atterrissage avant migration

Cette skill prépare un **handoff JSON** que la prochaine session Claude lira au boot. Tu écris ton propre testament — toi seul sais ce qui compte dans ce qu'on était en train de faire.

## Quand l'invoquer

- Le master a poussé `MIGRATE_REQUEST` dans l'inbox (motif : burn ≥ 60%, idle, ou commande user `/migrate`).
- L'utilisateur dit explicitement « migre », « prépare ta migration », « /migrate-now », « écris ton handoff ».

## Ce que tu dois faire (ordre strict)

1. **Récupérer les variables d'environnement** :
   - `PROJECT_KEY` : nom du projet courant. Défaut : `MasterClaude`.
   - `FROM_SESSION_ID` : si présent dans le contexte (Resume URL ou env), sinon mettre `null`.
   - `REASON` : raison annoncée par le master (passée dans le prompt MIGRATE_REQUEST). Sinon `manual`.

2. **Composer le handoff** en mémoire (pas de fichier intermédiaire) :

```json
{
  "version": 1,
  "created_at": "<ISO 8601>",
  "from_session_id": "<id ou null>",
  "project_key": "<PROJECT_KEY>",
  "cwd": "<pwd>",
  "reason": "<REASON>",
  "fil_rouge": "<≤500 mots prose : ce qu'on faisait, où on en est, ce qui vient d'être décidé>",
  "next_action": "<une phrase impérative : la première chose que ton successeur doit faire>",
  "warnings_for_successor": "<pièges, choix non triviaux, fragilités à connaître ; vide si rien>",
  "todos": [{"subject": "...", "status": "in_progress|pending|completed"}],
  "vault_malik_slice": "<3-5 lignes : ce qui est pertinent dans /Users/malik/Vault/Malik/ pour la suite — ou vide si non consulté>",
  "last_user_message": "<dernier message utilisateur récent et pertinent>"
}
```

3. **Récupérer les todos courants** via `TaskList` puis sérialise-les dans le champ `todos`.

4. **Écrire deux copies** (commande Bash unique) :
   - Live : `/tmp/masterclaude-handoff-${PROJECT_KEY}.json`
   - Archive : `vault/handoffs/$(date +%Y%m%d-%H%M%S)-${PROJECT_KEY}.json`
   
   `mkdir -p vault/handoffs` au préalable si besoin.

5. **Annoncer la fin de préparation** : envoyer à l'utilisateur (texte direct, pas Telegram — le master relaiera) :
   > « 📦 Handoff écrit. Atterrissage configuré pour mon successeur. Master peut me migrer. »

## Règles de qualité

- **fil_rouge** : prose concrète, pas de bullet-point administratif. Ton successeur doit pouvoir reprendre le fil sans relire la conversation.
- **next_action** : impérative, vérifiable. Pas « continuer le travail ». Plutôt « patcher master.js ligne 534 pour appeler executeMigration au lieu de restartSession ».
- **warnings_for_successor** : seulement si non trivial. Vide accepté.
- **vault_malik_slice** : ne consulte le vault Malik que si tu y as déjà touché dans la session OU si la tâche en cours en dépend explicitement. Sinon, vide.

## Anti-patterns

- ❌ Ne pas pinger Telegram directement. Le master orchestre la séquence.
- ❌ Ne pas écrire de markdown verbeux. JSON strict.
- ❌ Ne pas inventer un `from_session_id` — `null` si tu ne le vois pas dans le contexte.
- ❌ Ne pas faire de `git commit` du handoff archive — le master gère.
