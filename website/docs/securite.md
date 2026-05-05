---
id: securite
title: Sécurité
---

La sécurité dans `claude-atelier` est **structurelle** : enforced par des hooks et des scripts, pas par la bonne volonté de Claude.

---

## Gate pré-push — 5 étapes

```bash
bash scripts/pre-push-gate.sh
```

| Étape | Vérification | Bloquant |
|---|---|---|
| 1. Audit secrets | Patterns dangereux dans le diff | Oui |
| 2. Fichiers sensibles | `.env`, `.pem`, `.key` trackés | Oui |
| 3. Lint | ESLint / ruff / Checkstyle | Oui |
| 4. Build | `npm build` / `mvn compile` | Oui |
| 5. Tests | `npm test` / `pytest` | Oui |

:::danger
Un seul `[FAIL]` bloque le push. **Jamais de `--no-verify`.**
:::

```bash
# Gate rapide (secrets + fichiers sensibles seulement)
bash scripts/pre-push-gate.sh --quick
```

---

## Fichiers interdits de commit

`.gitignore` **et** `.claudeignore` :

```gitignore
.env
.env.*
*.pem
*.key
*.p12
id_rsa
id_ed25519
google-services.json
GoogleService-Info.plist
serviceAccountKey.json
*credentials*.json
*secret*.json
.aws/credentials
node_modules/
dist/
```

---

## Permissions — deny list

```json
{
  "permissions": {
    "deny": [
      "Bash(sudo:*)",
      "Bash(rm -rf /*)",
      "Bash(git push --force:*)"
    ],
    "allow": [
      "Bash(git push:*)",
      "Bash(git commit:*)"
    ]
  }
}
```

:::info Mode nuit
En `acceptEdits` : `git push` est autorisé après gate verte. `sudo` et `rm -rf /` restent en `deny`.
:::

---

## Hooks de sécurité

| Hook | Ce qu'il bloque |
|---|---|
| `guard-secrets.sh` | Patterns secrets dans le diff |
| `guard-no-force-push.sh` | `git push --force` |
| `guard-claudeignore.sh` | Premier commit sans `.claudeignore` |
| `guard-gitignore.sh` | Premier commit sans `.gitignore` |
| `guard-pre-push.sh` | Lance la gate complète |

---

## Urgence — secret commité

```bash
# 1. Ne pas pusher
# 2. Révoquer le secret IMMÉDIATEMENT
# 3. Nettoyer l'historique
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch <fichier>' HEAD
# 4. Notifier l'équipe
```

Détails : `.claude/security/emergency.md`
