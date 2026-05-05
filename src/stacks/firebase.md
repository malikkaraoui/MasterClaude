---
stack: firebase
applies_to: ["firebase.json", ".firebaserc", "firestore.rules", "storage.rules", "functions/**"]
loads_from: src/fr/CLAUDE.md §0 (Contexte projet)
status: stub
---

# Stack — Firebase

> 🚧 **Stub P2.** Contenu détaillé à livrer en P3.

## Périmètre prévu (P3)

- **Sécurité des règles Firestore / Storage** : jamais de `allow read, write: if true`
- **Clés côté client** : Firebase apiKey n'est pas un secret mais les règles
  doivent toujours être défensives
- **Cloud Functions** : idempotence, gestion des cold starts, timeouts
- **Firestore** : indexation composite, structure de données denormalisée
  assumée, pagination stricte
- **Auth** : providers, custom claims, revalidation des tokens
- **Emulator Suite** : obligatoire en dev, jamais de tests contre prod
- **Secrets runtime** : Secret Manager pour Functions, jamais `.env` committé
