#!/usr/bin/env node
/**
 * claude-atelier features — Tableau de contrôle des features
 *
 * Usage:
 *   claude-atelier features                         # affiche le tableau
 *   claude-atelier features --on  <feature>         # active
 *   claude-atelier features --off <feature>         # désactive
 *   claude-atelier features --toggle <feature>      # bascule
 *   claude-atelier features --set <param> <value>   # modifie un paramètre
 *   claude-atelier features --reset                 # restaure les défauts
 *   claude-atelier features --global                # cible ~/.claude/features.json
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT  = join(__dirname, '..');

const GREEN  = '\x1b[0;32m';
const RED    = '\x1b[0;31m';
const YELLOW = '\x1b[0;33m';
const CYAN   = '\x1b[0;36m';
const BLUE   = '\x1b[0;34m';
const BOLD   = '\x1b[1m';
const DIM    = '\x1b[2m';
const NC     = '\x1b[0m';

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadRegistry() {
  return JSON.parse(readFileSync(join(PKG_ROOT, 'src', 'features-registry.json'), 'utf8'));
}

function resolveFeaturesPath(global) {
  if (global) return join(homedir(), '.claude', 'features.json');
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const p = join(dir, '.claude', 'features.json');
    if (existsSync(p)) return p;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return join(process.cwd(), '.claude', 'features.json');
}

function loadFeatures(path) {
  if (!existsSync(path)) return {};
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch (_) { return {}; }
}

function saveFeatures(path, features) {
  const d = dirname(path);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  writeFileSync(path, JSON.stringify(features, null, 2) + '\n');
}

function isEnabled(features, registry, id) {
  if (id in features) return features[id];
  return registry.features[id]?.default ?? true;
}

function getParam(features, registry, id) {
  if (features.params && id in features.params) return features.params[id];
  return registry.params[id]?.default;
}

// ── Visual toggle ─────────────────────────────────────────────────────────────

function toggle(on) {
  if (on) return `${GREEN}${BOLD}[●━━━]${NC} ${GREEN}ON ${NC} `;
  return       `${DIM}[━━━●]${NC} ${RED}OFF${NC} `;
}

function pad(str, len) {
  // pad ignoring ANSI escape codes
  const visible = str.replace(/\x1b\[[0-9;]*m/g, '');
  return str + ' '.repeat(Math.max(0, len - visible.length));
}

// ── Display ───────────────────────────────────────────────────────────────────

function display(registry, features, featuresPath) {
  const exists = existsSync(featuresPath);
  const configLine = exists
    ? `${DIM}${featuresPath}${NC}`
    : `${DIM}${featuresPath} (créé à la 1ère modification)${NC}`;

  const W = 72;
  const border = '═'.repeat(W);
  const sep    = '─'.repeat(W);

  console.log(`\n${BOLD}╔${border}╗${NC}`);
  console.log(`${BOLD}║${NC}  ⚙  ${BOLD}claude-atelier${NC} — Panneau de contrôle${' '.repeat(W - 38)}${BOLD}║${NC}`);
  console.log(`${BOLD}╚${border}╝${NC}`);
  console.log(`   Config : ${configLine}\n`);

  // ── Features ────────────────────────────────────────────────────────────────
  for (const [, group] of Object.entries(registry.groups)) {
    console.log(`  ${CYAN}${BOLD}▸ ${group.label}${NC}`);
    console.log(`  ${DIM}${sep}${NC}`);

    const maxId = Math.max(...group.features.map(f => f.length));
    for (const id of group.features) {
      const feat = registry.features[id];
      if (!feat) continue;
      const on      = isEnabled(features, registry, id);
      const custom  = id in features ? '' : ` ${DIM}·${NC}`;
      const idStr   = id.padEnd(maxId + 2);
      console.log(`   ${idStr} ${toggle(on)} ${feat.description}${custom}`);
    }
    console.log('');
  }

  // ── Params ──────────────────────────────────────────────────────────────────
  if (registry.params && Object.keys(registry.params).length) {
    console.log(`  ${BLUE}${BOLD}▸ Paramètres configurables${NC}`);
    console.log(`  ${DIM}${sep}${NC}`);

    const maxId = Math.max(...Object.keys(registry.params).map(k => k.length));
    for (const [id, def] of Object.entries(registry.params)) {
      const val     = getParam(features, registry, id);
      const isCustom= features.params && id in features.params;
      const marker  = isCustom ? `${YELLOW}✎${NC}` : `${DIM}·${NC}`;
      const valStr  = def.unit ? `${BOLD}${val}${NC} ${DIM}${def.unit}${NC}` : `${BOLD}${val}${NC}`;
      const idStr   = id.padEnd(maxId + 2);
      console.log(`   ${idStr} ${marker} ${pad(valStr, 14)}  ${def.description}`);
    }
    console.log('');
  }

  // ── Legend ──────────────────────────────────────────────────────────────────
  console.log(`  ${DIM}${sep}${NC}`);
  console.log(`  ${DIM}· défaut   ${YELLOW}✎${NC}${DIM} modifié${NC}\n`);

  // ── Commands ────────────────────────────────────────────────────────────────
  console.log(`  ${DIM}Commandes :${NC}`);
  console.log(`   ${CYAN}! claude-atelier features --on  <feature>${NC}`);
  console.log(`   ${CYAN}! claude-atelier features --off <feature>${NC}`);
  console.log(`   ${CYAN}! claude-atelier features --toggle <feature>${NC}`);
  console.log(`   ${CYAN}! claude-atelier features --set <param> <valeur>${NC}`);
  console.log(`   ${CYAN}! claude-atelier features --reset${NC}               ${DIM}(restaure tous les défauts)${NC}`);
  console.log(`   ${CYAN}! claude-atelier features --global${NC}              ${DIM}(cible ~/.claude/features.json)${NC}\n`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

export async function runFeatures(argv) {
  const args         = argv.slice(2).filter(a => a !== 'features');
  const isGlobal     = args.includes('--global');
  const featuresPath = resolveFeaturesPath(isGlobal);
  const registry     = loadRegistry();
  let features       = loadFeatures(featuresPath);

  // --reset
  if (args.includes('--reset')) {
    saveFeatures(featuresPath, {});
    console.log(`${GREEN}✅ Features réinitialisées aux défauts${NC} — ${featuresPath}`);
    console.log(`${YELLOW}⚡ Relancez Claude Code pour appliquer.${NC}`);
    return 0;
  }

  // --set <param> <value>
  const setIdx = args.indexOf('--set');
  if (setIdx !== -1) {
    const id  = args[setIdx + 1];
    const raw = args[setIdx + 2];

    if (!id || !registry.params?.[id]) {
      const all = Object.keys(registry.params ?? {}).join(', ');
      process.stderr.write(`${RED}error${NC}: paramètre inconnu "${id || '(manquant)'}"\n`);
      process.stderr.write(`Paramètres disponibles : ${all}\n`);
      return 1;
    }

    const def = registry.params[id];
    let val;
    if (def.type === 'string') {
      val = (raw || '').trim();
      if (!val) {
        process.stderr.write(`${RED}error${NC}: valeur manquante ou vide pour "${id}"\n`);
        return 1;
      }
    } else {
      val = Number(raw);
      if (isNaN(val) || val < def.min || val > def.max) {
        process.stderr.write(`${RED}error${NC}: valeur invalide "${raw}" — attendu entre ${def.min} et ${def.max}\n`);
        return 1;
      }
    }

    if (!features.params) features.params = {};
    if (val === def.default) {
      delete features.params[id];
    } else {
      features.params[id] = val;
    }
    if (Object.keys(features.params).length === 0) delete features.params;

    saveFeatures(featuresPath, features);
    const unitStr = def.unit ? ` ${DIM}${def.unit}${NC}` : '';
    console.log(`${YELLOW}✎${NC}  ${BOLD}${id}${NC} → ${GREEN}${val}${NC}${unitStr}`);
    console.log(`${DIM}Sauvegardé : ${featuresPath}${NC}`);
    console.log(`${YELLOW}⚡ Relancez Claude Code pour appliquer.${NC}`);
    return 0;
  }

  // --on / --off / --toggle
  for (const flag of ['--on', '--off', '--toggle']) {
    const idx = args.indexOf(flag);
    if (idx === -1) continue;

    const id = args[idx + 1];
    if (!id || !registry.features[id]) {
      const all = Object.keys(registry.features).join(', ');
      process.stderr.write(`${RED}error${NC}: feature inconnue "${id || '(manquante)'}"\n`);
      process.stderr.write(`Features disponibles : ${all}\n`);
      return 1;
    }

    const current = isEnabled(features, registry, id);
    const newVal  = flag === '--toggle' ? !current : flag === '--on';

    if (newVal === registry.features[id].default && !(id in features)) {
      console.log(`${DIM}${id} est déjà à sa valeur par défaut (${newVal ? 'ON' : 'OFF'}) — aucun changement.${NC}`);
      return 0;
    }

    if (newVal === registry.features[id].default) {
      delete features[id];
    } else {
      features[id] = newVal;
    }

    saveFeatures(featuresPath, features);
    console.log(`${toggle(newVal)} ${BOLD}${id}${NC}`);
    console.log(`${DIM}Sauvegardé : ${featuresPath}${NC}`);
    console.log(`${YELLOW}⚡ Relancez Claude Code pour appliquer.${NC}`);
    return 0;
  }

  display(registry, features, featuresPath);
  return 0;
}
