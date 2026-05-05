#!/usr/bin/env node
/**
 * claude-atelier review-local — Review automatique d'un handoff via Ollama local
 *
 * Usage:
 *   claude-atelier review-local                      # dernier handoff non reviewé
 *   claude-atelier review-local --model deepseek-v3.1
 *   claude-atelier review-local --handoff <path>
 *   claude-atelier review-local --auto-integrate      # squelette Intégration inclus
 *   claude-atelier review-local --list-models         # liste modèles + qualité estimée
 *
 * Appelle Ollama directement (localhost:11434) — proxy non requis.
 */

import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT  = join(__dirname, '..');

const GREEN  = '\x1b[0;32m';
const RED    = '\x1b[0;31m';
const YELLOW = '\x1b[0;33m';
const CYAN   = '\x1b[0;36m';
const BOLD   = '\x1b[1m';
const DIM    = '\x1b[2m';
const NC     = '\x1b[0m';

const OLLAMA_URL = process.env.OLLAMA_HOST || 'http://localhost:11434';

// Qualité estimée par famille de modèle
const MODEL_QUALITY = {
  'deepseek-v3.1': { tier: 'haute',   emoji: '🔥', note: '~685B params — review profonde' },
  'deepseek-v3':   { tier: 'haute',   emoji: '🔥', note: '~685B params — review profonde' },
  'deepseek-r1':   { tier: 'haute',   emoji: '🔥', note: 'reasoning model — review profonde' },
  'gpt-oss':       { tier: 'haute',   emoji: '🔥', note: 'grand modèle — review profonde' },
  'qwen3':         { tier: 'haute',   emoji: '🔥', note: 'grand modèle — review profonde' },
  'qwen2.5':       { tier: 'moyenne', emoji: '⚡', note: 'modèle moyen — review correcte' },
  'qwen3.5':       { tier: 'moyenne', emoji: '⚡', note: 'modèle moyen — review correcte' },
  'mistral':       { tier: 'basique', emoji: '💡', note: 'petit modèle — review superficielle' },
  'llama':         { tier: 'basique', emoji: '💡', note: 'vérifie la taille — peut être léger' },
  'phi':           { tier: 'basique', emoji: '💡', note: 'petit modèle — review superficielle' },
  'gemma':         { tier: 'basique', emoji: '💡', note: 'petit modèle — review superficielle' },
  'tinyllama':     { tier: 'basique', emoji: '💡', note: 'très petit — review symbolique' },
};

function getQuality(modelName) {
  const lower = modelName.toLowerCase().replace(/:.*$/, ''); // ignorer le tag :latest
  for (const [key, val] of Object.entries(MODEL_QUALITY)) {
    if (lower.startsWith(key)) return val;
  }
  return { tier: 'inconnue', emoji: '❓', note: 'qualité inconnue — taille non référencée' };
}

// ── Ollama API ────────────────────────────────────────────────────────────────

async function ollamaListModels() {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.models || []).map(m => m.name);
  } catch (_) {
    return [];
  }
}

async function ollamaChat(model, prompt, onChunk) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama error ${res.status}: ${err}`);
  }

  let fullText = '';
  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const lines = decoder.decode(value, { stream: true }).split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        const token = obj.message?.content || '';
        if (token) {
          fullText += token;
          onChunk(token);
        }
      } catch (_) {}
    }
  }

  return fullText;
}

// ── Handoff helpers ───────────────────────────────────────────────────────────

function extractSection(content, heading) {
  const parts = content.split(/^## /m);
  for (const p of parts) {
    if (p.startsWith(heading)) return '## ' + p;
  }
  return '';
}

function stripTemplateContent(text) {
  return text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/_À compléter.*_/g, '')
    .trim();
}

function isHandoffReviewed(content) {
  const section = extractSection(content, 'Réponse de :');
  return stripTemplateContent(section).length > 100;
}

function findUnreviewedHandoff(repoRoot) {
  const dir = join(repoRoot, 'docs', 'handoffs');
  if (!existsSync(dir)) return null;

  const files = readdirSync(dir)
    .filter(f => f.match(/^202.*\.md$/) && !f.includes('_template'))
    .sort()
    .reverse();

  for (const f of files) {
    const path = join(dir, f);
    const content = readFileSync(path, 'utf8');
    if (!isHandoffReviewed(content)) return { path, content, name: f };
  }
  return null;
}

function buildPrompt(content) {
  const de = extractSection(content, 'De :');
  const contexte = de.match(/### Contexte[\s\S]*?(?=###|$)/)?.[0] || '';
  const question = de.match(/### Question précise[\s\S]*?(?=###|$)/)?.[0] || '';
  const fichiers = de.match(/### Fichiers à lire[\s\S]*?(?=###|$)/)?.[0] || '';

  return `Tu es un reviewer senior sur le projet claude-atelier (framework Claude Code en Node.js + Bash + Go).

Voici le contexte du code livré :

${contexte}

${question}

${fichiers}

**Ta mission** : reviewer ce code avec un regard externe, sans complaisance. Structure ta réponse exactement comme ceci :

### Analyse des questions

Pour chaque question posée : analyse technique directe, verdict (✅/⚠️/❌), et action recommandée si nécessaire.

### Verdict global

1-2 phrases. Le code est-il correct ? Y a-t-il des bugs ou angles morts critiques ?

### Actions prioritaires

Liste des actions (max 5) par ordre de priorité. Format : \`- [ ] description courte\`

Réponds en français. Sois direct, factuel, sans pédagogie inutile.`;
}

function injectResponse(content, responseText, modelName, autoIntegrate) {
  const now = new Date().toISOString().slice(0, 10);
  const header = `> Reviewé le ${now} par Ollama/${modelName} (review automatique — ${getQuality(modelName).tier} qualité)`;
  const newResponse = `## Réponse de : Ollama/${modelName}\n\n${header}\n\n${responseText}\n`;

  // Split sur les sections de niveau ## pour cibler précisément (évite les faux positifs dans le texte)
  const parts = content.split(/^(?=## )/m);
  let responseReplaced = false;
  const updated = parts.map(part => {
    if (part.startsWith('## Réponse de :') && !responseReplaced) {
      responseReplaced = true;
      return newResponse + '\n';
    }
    return part;
  });

  if (!responseReplaced) {
    // Section absente → injecter avant ## Intégration
    const integIdx = updated.findIndex(p => p.startsWith('## Intégration'));
    if (integIdx !== -1) {
      updated.splice(integIdx, 0, newResponse + '\n---\n\n');
    } else {
      updated.push('\n---\n\n' + newResponse);
    }
  }

  let result = updated.join('');

  if (autoIntegrate) {
    const integration = `> Intégré le ${now} par review-local (squelette automatique — compléter manuellement)

### Points retenus

_À compléter après lecture de la review ci-dessus_

### Actions concrètes

_À compléter : reprendre les "Actions prioritaires" de la review et décider quoi retenir_`;

    const integParts = result.split(/^(?=## )/m);
    result = integParts.map(part =>
      part.startsWith('## Intégration')
        ? `## Intégration\n\n${integration}\n`
        : part
    ).join('');
  }

  return result;
}

// ── Sélection interactive ─────────────────────────────────────────────────────

function promptSelect(question, choices) {
  return new Promise(resolve => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    process.stdout.write(`\n${question}\n\n`);
    choices.forEach((c, i) =>
      process.stdout.write(`  ${CYAN}${String(i + 1).padStart(2)}${NC}) ${c.label}\n`)
    );
    rl.question(`\nChoix [1-${choices.length}] : `, ans => {
      rl.close();
      const idx = parseInt(ans, 10) - 1;
      resolve(choices[Math.max(0, Math.min(idx, choices.length - 1))]);
    });
  });
}

// ── Git (spawnSync — pas d'injection shell) ───────────────────────────────────

function gitAdd(repoRoot, relPath) {
  return spawnSync('git', ['-C', repoRoot, 'add', relPath], { stdio: 'pipe' });
}

function gitCommit(repoRoot, message) {
  return spawnSync('git', ['-C', repoRoot, 'commit', '--no-gpg-sign', '-m', message], { stdio: 'pipe' });
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function runReviewLocal(argv) {
  const args = argv.slice(2);

  const modelIdx   = args.indexOf('--model');
  const handoffIdx = args.indexOf('--handoff');
  const modelFlag   = modelIdx  !== -1 ? args[modelIdx  + 1] : null;
  const handoffFlag = handoffIdx !== -1 ? args[handoffIdx + 1] : null;
  const autoIntegrate = args.includes('--auto-integrate');
  const listModels    = args.includes('--list-models');

  // Détecter le repo root
  let repoRoot = process.cwd();
  if (!existsSync(join(repoRoot, 'docs', 'handoffs'))) {
    if (existsSync(join(PKG_ROOT, 'docs', 'handoffs'))) repoRoot = PKG_ROOT;
  }

  // Vérifier Ollama
  const models = await ollamaListModels();
  if (models.length === 0) {
    process.stderr.write(`${RED}✗ Ollama non accessible${NC} (${OLLAMA_URL})\n`);
    process.stderr.write(`  Lance Ollama : ${CYAN}ollama serve${NC}\n`);
    process.stderr.write(`  Ou définit : ${CYAN}OLLAMA_HOST=http://host:11434${NC}\n`);
    return 1;
  }

  // --list-models
  if (listModels) {
    process.stdout.write(`\n${BOLD}Modèles Ollama disponibles${NC} (${OLLAMA_URL})\n\n`);
    const maxLen = Math.max(...models.map(m => m.length));
    for (const m of models) {
      const q = getQuality(m);
      process.stdout.write(`  ${q.emoji}  ${CYAN}${m.padEnd(maxLen + 2)}${NC}${q.tier.padEnd(9)} ${DIM}${q.note}${NC}\n`);
    }
    process.stdout.write('\n');
    return 0;
  }

  // Trouver le handoff cible
  let target;
  if (handoffFlag) {
    const p = handoffFlag.startsWith('/') ? handoffFlag : join(process.cwd(), handoffFlag);
    if (!existsSync(p)) {
      process.stderr.write(`${RED}✗ Handoff introuvable :${NC} ${p}\n`);
      return 1;
    }
    target = { path: p, content: readFileSync(p, 'utf8'), name: basename(p) };
  } else {
    target = findUnreviewedHandoff(repoRoot);
    if (!target) {
      process.stdout.write(`${GREEN}✓ Tous les handoffs sont déjà reviewés.${NC}\n`);
      return 0;
    }
  }

  process.stdout.write(`\n${BOLD}Handoff cible${NC} : ${CYAN}${target.name}${NC}\n`);

  // Choisir le modèle
  let selectedModel = modelFlag;
  if (!selectedModel) {
    const choices = models.map(m => {
      const q = getQuality(m);
      const padded = m.padEnd(Math.max(...models.map(x => x.length)) + 2);
      return {
        label: `${q.emoji}  ${padded}${DIM}${q.tier} — ${q.note}${NC}`,
        value: m,
      };
    });
    const picked = await promptSelect(`${BOLD}Choisis le modèle Ollama pour la review${NC}`, choices);
    selectedModel = picked.value;
  } else if (!models.includes(selectedModel)) {
    process.stderr.write(`${RED}✗ Modèle "${selectedModel}" non disponible.${NC}\n`);
    process.stderr.write(`  Modèles dispo : ${models.join(', ')}\n`);
    return 1;
  }

  const q = getQuality(selectedModel);
  process.stdout.write(`\n  ${q.emoji}  ${BOLD}${selectedModel}${NC} — qualité ${BOLD}${q.tier}${NC} (${q.note})\n`);
  if (q.tier === 'basique') {
    process.stdout.write(`\n${YELLOW}  ⚠️  Review superficielle attendue.${NC}\n`);
    process.stdout.write(`  ${DIM}Utilise deepseek-v3.1 ou gpt-oss pour une review archi fiable.${NC}\n`);
  }

  process.stdout.write(`\n${BOLD}${CYAN}══ Review en cours ══════════════════════════════════${NC}\n\n`);

  // Appel Ollama (streaming)
  let reviewText = '';
  try {
    reviewText = await ollamaChat(selectedModel, buildPrompt(target.content), chunk => {
      process.stdout.write(chunk);
    });
  } catch (err) {
    process.stderr.write(`\n${RED}✗ Erreur Ollama :${NC} ${err.message}\n`);
    return 1;
  }

  process.stdout.write(`\n\n${BOLD}${CYAN}══ Fin de la review ═════════════════════════════════${NC}\n`);

  // Injecter dans le fichier
  const updated = injectResponse(target.content, reviewText, selectedModel, autoIntegrate);
  writeFileSync(target.path, updated, 'utf8');
  process.stdout.write(`\n${GREEN}✓ Réponse injectée dans${NC} ${target.name}\n`);

  if (autoIntegrate) {
    process.stdout.write(`${YELLOW}  ⚠️  Squelette Intégration créé — complète les sections manuellement.${NC}\n`);
  }

  // Commit automatique
  const relPath = join('docs', 'handoffs', target.name);
  const addResult = gitAdd(repoRoot, relPath);
  if (addResult.status === 0) {
    const commitMsg = `docs: review-local (${selectedModel}) → ${target.name}`;
    const commitResult = gitCommit(repoRoot, commitMsg);
    if (commitResult.status === 0) {
      process.stdout.write(`${GREEN}✓ Commit créé${NC}\n`);
    } else {
      process.stdout.write(`${YELLOW}⚠️  Commit échoué — commit manuel requis.${NC}\n`);
    }
  }

  process.stdout.write(`
${BOLD}Prochaine étape${NC} :
  1. Lis la review ci-dessus
  2. Complète ${CYAN}## Intégration${NC} dans ${target.name}
  3. Commit puis ${CYAN}npm version patch${NC} débloqué
`);

  return 0;
}

// Invocation directe : node bin/review-local.js ...
if (process.argv[1] && (process.argv[1].endsWith('review-local.js') || process.argv[1].endsWith('review-local'))) {
  runReviewLocal(process.argv).then(code => process.exit(code)).catch(err => {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  });
}
