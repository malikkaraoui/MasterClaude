#!/usr/bin/env node
/**
 * test/validate-handoff.js — Validation structurelle d'un fichier handoff
 *
 * Supporte deux formats :
 *   - .md  : frontmatter "> Date/Type/reviewedRange", sections ## De/Réponse/Intégration
 *   - .json : champs meta.date, meta.type, meta.reviewedRange, from, response, integration
 *
 * Critères communs (anti-triche) :
 *   1. Date et type présents
 *   2. reviewedRange <sha>..<sha> avec SHAs valides dans git
 *   3. Question précise ≥ 50 chars
 *   4. Fichiers à lire : ≥ 1 fichier listé
 *   5. Réponse ≥ 100 chars DISTINCTE du template, PAS une auto-review Claude
 *   6. Intégration ≥ 100 chars DISTINCTE du template
 *
 * Usage:
 *   node test/validate-handoff.js <path/to/handoff.md|.json>
 *   node test/validate-handoff.js --all
 *
 * Exit : 0 = valide, 1 = invalide
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve, dirname, join, basename, relative } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node test/validate-handoff.js <path> | --all');
  process.exit(2);
}

const TEMPLATE_MARKERS = [
  'INSTRUCTION POUR LE LLM QUI REPOND',
  "Rempli par le LLM d'origine",
  'Rempli par Claude après avoir lu',
  'Réponse ci-dessous',
  'Écrire la réponse dans le champ',
];

const SELF_REVIEW_PATTERN = /\b(claude|sonnet|opus|haiku|auto-review|auto_review)\b/i;

function stripTemplateContent(text) {
  if (!text) return '';
  let cleaned = text.replace(/<!--[\s\S]*?-->/g, '');
  for (const marker of TEMPLATE_MARKERS) {
    const re = new RegExp(`.*${marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*`, 'g');
    cleaned = cleaned.replace(re, '');
  }
  cleaned = cleaned.replace(/^#+\s.*$/gm, '');
  return cleaned.trim();
}

function gitOk(gitArgs) {
  return spawnSync('git', gitArgs, { cwd: ROOT, stdio: 'pipe' }).status === 0;
}

function gitStdout(gitArgs) {
  const r = spawnSync('git', gitArgs, { cwd: ROOT, stdio: 'pipe' });
  return r.status === 0 ? r.stdout.toString('utf8') : '';
}

function gitRevParse(rev) {
  return gitStdout(['rev-parse', rev]).trim();
}

function validateRange(fromSha, toSha, errors) {
  const okFrom = gitOk(['cat-file', '-e', `${fromSha}^{commit}`]);
  const okTo = gitOk(['cat-file', '-e', `${toSha}^{commit}`]);
  if (!okFrom) errors.push(`reviewedRange from-sha ${fromSha} introuvable dans git`);
  if (!okTo) errors.push(`reviewedRange to-sha ${toSha} introuvable dans git`);
  if (okFrom && okTo && !gitOk(['merge-base', '--is-ancestor', fromSha, toSha])) {
    errors.push(`reviewedRange invalide : ${fromSha} n'est pas un ancêtre de ${toSha}`);
  }
}

// ─── Format Markdown ────────────────────────────────────────────────────────

function extractSection(content, heading) {
  const parts = content.split(/^## /m);
  for (const p of parts) {
    if (p.startsWith(heading)) return '## ' + p;
  }
  return '';
}

function findFirstIntegratedCommitMd(filePath) {
  const relPath = relative(ROOT, filePath);
  const history = gitStdout(['log', '--format=%H', '--reverse', '--follow', '--', relPath])
    .split('\n').map((l) => l.trim()).filter(Boolean);

  for (const sha of history) {
    const fileAtCommit = gitStdout(['show', `${sha}:${relPath}`]);
    if (!fileAtCommit) continue;
    const integration = extractSection(fileAtCommit, 'Intégration');
    if (stripTemplateContent(integration).length >= 100) return sha;
  }
  return '';
}

function validateMd(filePath) {
  const errors = [];
  const content = readFileSync(filePath, 'utf8');

  if (!/^>\s*Date\s*:/m.test(content)) errors.push('Frontmatter "> Date :" manquant');
  if (!/^>\s*Type\s*:/m.test(content)) errors.push('Frontmatter "> Type :" manquant');

  const rangeMatch = content.match(/^>\s*reviewedRange\s*:\s*([a-f0-9]{7,40})\.\.([a-f0-9]{7,40})\s*$/m);
  if (!rangeMatch) {
    errors.push('Frontmatter "> reviewedRange: <sha>..<sha>" manquant ou malformé');
  } else {
    const [, fromSha, toSha] = rangeMatch;
    validateRange(fromSha, toSha, errors);
    if (errors.length === 0) {
      const firstIntegrated = findFirstIntegratedCommitMd(filePath);
      if (!firstIntegrated) {
        errors.push('Impossible de determiner le premier commit d integration reel');
      } else if (!gitOk(['merge-base', '--is-ancestor', gitRevParse(toSha), firstIntegrated])) {
        errors.push(`reviewedRange to-sha ${toSha} doit être un ancêtre du commit d intégration ${firstIntegrated}`);
      }
    }
  }

  const deSection = extractSection(content, 'De :');
  if (!deSection) errors.push('Section "## De :" manquante');

  const question = deSection.match(/### Question précise[\s\S]*?(?=###|$)/);
  if (!question || stripTemplateContent(question[0]).length < 50) {
    errors.push('### Question précise absente ou < 50 caractères réels');
  }

  const files = deSection.match(/### Fichiers à lire[\s\S]*?(?=###|$)/);
  if (!files || !files[0].includes('```')) {
    errors.push('### Fichiers à lire doit contenir un bloc de code');
  }

  const reponse = extractSection(content, 'Réponse de :');
  const reponseClean = stripTemplateContent(reponse);
  if (reponseClean.length < 100) {
    errors.push(`## Réponse de : trop courte (${reponseClean.length} chars réels, min 100)`);
  }
  const reponseHeading = reponse.match(/^## Réponse de\s*:\s*(.*)$/m)?.[1]?.trim() || '';
  if (reponseHeading && SELF_REVIEW_PATTERN.test(reponseHeading)) {
    errors.push(`Auto-review Claude interdite ("${reponseHeading}")`);
  }

  const integration = extractSection(content, 'Intégration');
  if (stripTemplateContent(integration).length < 100) {
    errors.push(`## Intégration trop courte (min 100 chars réels)`);
  }

  return { valid: errors.length === 0, errors, checksum: createHash('sha256').update(content).digest('hex').slice(0, 12) };
}

// ─── Format JSON ─────────────────────────────────────────────────────────────

function findFirstIntegratedCommitJson(filePath) {
  const relPath = relative(ROOT, filePath);
  const history = gitStdout(['log', '--format=%H', '--reverse', '--follow', '--', relPath])
    .split('\n').map((l) => l.trim()).filter(Boolean);

  for (const sha of history) {
    const raw = gitStdout(['show', `${sha}:${relPath}`]);
    if (!raw) continue;
    try {
      const d = JSON.parse(raw);
      const integ = d.integration;
      if (integ && typeof integ === 'object') {
        // Format classique : verdict + retained_implement
        const verdict = stripTemplateContent(integ.verdict || '');
        const retainedText = JSON.stringify(integ.retained_implement || []);
        if ((verdict + retainedText).length >= 100) return sha;
        // Format alternatif (status + summary) : status présent + summary >= 50 chars
        const summary = stripTemplateContent(integ.summary || '');
        if (integ.status && summary.length >= 50) return sha;
      }
    } catch {
      continue;
    }
  }
  return '';
}

function validateJson(filePath) {
  const errors = [];
  let d;
  try {
    d = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (e) {
    return { valid: false, errors: [`JSON invalide : ${e.message}`] };
  }

  const meta = d.meta || {};
  if (!meta.date) errors.push('meta.date manquant');
  if (!meta.type) errors.push('meta.type manquant');

  const rangeRaw = meta.reviewedRange || '';
  const rangeMatch = rangeRaw.match(/^([a-f0-9]{7,40})\.\.([a-f0-9]{7,40})$/);
  if (!rangeMatch) {
    errors.push('meta.reviewedRange "<sha>..<sha>" manquant ou malformé');
  } else {
    const [, fromSha, toSha] = rangeMatch;
    validateRange(fromSha, toSha, errors);
    if (errors.length === 0) {
      const firstIntegrated = findFirstIntegratedCommitJson(filePath);
      if (!firstIntegrated) {
        errors.push('Impossible de determiner le premier commit d integration reel');
      } else if (!gitOk(['merge-base', '--is-ancestor', gitRevParse(toSha), firstIntegrated])) {
        errors.push(`meta.reviewedRange to-sha ${toSha} doit être un ancêtre du commit d intégration ${firstIntegrated}`);
      }
    }
  }

  const from = d.from || {};
  const question = stripTemplateContent(from.question || '');
  if (question.length < 50) errors.push(`from.question trop court (${question.length} chars, min 50)`);

  const files = Array.isArray(from.filesToRead)
    ? from.filesToRead.filter((f) => {
        if (typeof f !== 'string') return false;
        const value = f.trim();
        return value && !value.startsWith('[');
      })
    : [];
  if (files.length === 0) errors.push('from.filesToRead doit lister ≥ 1 fichier réel');

  const response = d.response || {};
  const responseContent = stripTemplateContent(typeof response.content === 'string' ? response.content : '');
  if (responseContent.length < 100) {
    errors.push(`response.content trop court (${responseContent.length} chars réels, min 100)`);
  }
  if (response.model != null && typeof response.model !== 'string') {
    errors.push('response.model doit être une chaîne');
  }
  const responseModel = typeof response.model === 'string' ? response.model.toLowerCase() : '';
  if (SELF_REVIEW_PATTERN.test(responseModel)) {
    errors.push(`Auto-review Claude interdite (response.model: "${response.model}")`);
  }

  const integration = d.integration;
  if (!integration || typeof integration !== 'object') {
    errors.push('integration null ou absent — champ requis après review');
  } else {
    const integText = stripTemplateContent(JSON.stringify(integration));
    if (integText.length < 100) errors.push(`integration trop court (${integText.length} chars réels, min 100)`);
  }

  const content = JSON.stringify(d);
  return { valid: errors.length === 0, errors, checksum: createHash('sha256').update(content).digest('hex').slice(0, 12) };
}

// ─── Dispatch ────────────────────────────────────────────────────────────────

function validate(filePath) {
  if (!existsSync(filePath)) return { valid: false, errors: [`Fichier absent : ${filePath}`] };
  return filePath.endsWith('.json') ? validateJson(filePath) : validateMd(filePath);
}

// ─── Main ────────────────────────────────────────────────────────────────────

let targets = [];
if (args[0] === '--all') {
  const dir = join(ROOT, 'docs', 'handoffs');
  const mdFiles = readdirSync(dir).filter((f) => /^202.*\.md$/.test(f) && !f.includes('_template')).map((f) => join(dir, f));
  const jsonFiles = readdirSync(dir).filter((f) => /^202.*\.json$/.test(f) && !f.includes('_template')).map((f) => join(dir, f));
  targets = [...mdFiles, ...jsonFiles];
} else {
  targets = [resolve(args[0])];
}

let failures = 0;
for (const t of targets) {
  const r = validate(t);
  const name = basename(t);
  if (r.valid) {
    console.log(`OK    ${name}  (sha256: ${r.checksum})`);
  } else {
    console.log(`FAIL  ${name}`);
    r.errors.forEach((e) => console.log(`      - ${e}`));
    failures++;
  }
}

if (failures > 0) {
  console.log(`\n${failures} handoff(s) invalide(s) sur ${targets.length}`);
  process.exit(1);
}
console.log(`\n${targets.length} handoff(s) valide(s)`);
