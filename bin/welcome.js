import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const RED = '\x1b[0;31m';
const GREEN = '\x1b[0;32m';
const YELLOW = '\x1b[0;33m';
const CYAN = '\x1b[0;36m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const NC = '\x1b[0m';

function parseS0(content) {
  const fields = {};
  let inS0 = false;
  for (const line of content.split('\n')) {
    if (line.startsWith('## §0')) {
      inS0 = true;
      continue;
    }
    if (inS0 && /^## §[1-9]/.test(line)) break;
    if (!inS0 || !line.startsWith('| ')) continue;
    if (line.startsWith('| Clé') || line.startsWith('| ---')) continue;
    const parts = line
      .split('|')
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length >= 2) {
      fields[parts[0]] = parts[1];
    }
  }
  return fields;
}

function getProjectState(s0Fields) {
  const keysToCheck = [
    'Projet courant',
    'Phase',
    'Stack',
    'Repo',
    'Conventions',
    'Endpoints actifs',
    'Contraintes métier',
  ];
  const total = keysToCheck.length;
  const filled = keysToCheck.filter(
    (key) => s0Fields[key] && s0Fields[key] !== '—' && s0Fields[key] !== ''
  ).length;
  const ratio = filled / total;

  let state = 'vide';
  if (ratio > 0.7) state = 'mature';
  else if (ratio >= 0.2) state = 'amorçage';

  return { state, filled, total, ratio, keysToCheck, s0Fields };
}

function getVersion(pkgRoot) {
  const pkgPath = join(pkgRoot, 'package.json');
  if (!existsSync(pkgPath)) return 'unknown';
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return pkg.version || 'unknown';
  } catch {
    return 'unknown';
  }
}

function formatHeader(version, action) {
  const actionText = action === 'init' ? 'installé' : 'mis à jour';
  const line = '─'.repeat(49);
  return `${line}\n${CYAN}  claude-atelier v${version}${NC}  ${GREEN}✓${NC} ${actionText}\n${line}`;
}

function formatFooter() {
  const line = '─'.repeat(49);
  return `\n${DIM}  Docs : https://github.com/malikkaraoui/claude-atelier#readme${NC}\n${line}`;
}

function formatEmpty() {
  return `${YELLOW}  Projet vide détecté.${NC}

  Pour bien démarrer :
    ${CYAN}•${NC} Dis à Claude : "${BOLD}Mets à jour §0 : projet X, stack Y, phase MVP${NC}"
    ${CYAN}•${NC} Commandes utiles : ${BOLD}doctor${NC} · ${BOLD}lint${NC} · ${BOLD}update${NC}

  Ressources :
    ${CYAN}→${NC} /atelier-help   — état du projet
    ${CYAN}→${NC} /atelier-setup  — onboarding interactif`;
}

function formatBootstrapping(filled, total, keysToCheck, s0Fields) {
  let output = `${YELLOW}  Projet en cours de configuration.${NC}

  §0 : ${BOLD}${filled}/${total}${NC} champs renseignés\n`;

  for (const key of keysToCheck) {
    const value = s0Fields[key];
    if (value && value !== '—' && value !== '') {
      output += `    ${GREEN}✓${NC} ${key} ${DIM}→${NC} ${value}\n`;
    } else {
      output += `    ${DIM}·${NC} ${key} vide\n`;
    }
  }

  output += `\n  ${CYAN}→${NC} ${BOLD}"Mets à jour §0 : [champs manquants]"${NC} dans Claude Code`;
  return output;
}

function formatMature(s0Fields) {
  const projet = s0Fields['Projet courant'] || '—';
  const phase = s0Fields['Phase'] || '—';
  const stack = s0Fields['Stack'] || '—';

  return `${GREEN}  Projet configuré.${NC}

  ${BOLD}${projet}${NC} · ${phase} · ${stack}

  ${CYAN}→${NC} ${BOLD}claude-atelier doctor${NC} pour vérifier l'installation
  ${CYAN}→${NC} ${BOLD}${DIM}/angle-mort${NC}${NC} avant release`;
}

function formatMinimal() {
  return `${RED}  ⚠ CLAUDE.md non trouvé${NC}

  Réinstallez avec :
    ${BOLD}npm run setup${NC}`;
}

export function showWelcome({ claudeMdPath, projectRoot, pkgRoot, action }) {
  const version = getVersion(pkgRoot);

  console.log(`\n${formatHeader(version, action)}`);

  if (!existsSync(claudeMdPath)) {
    console.log(`\n${formatMinimal()}`);
    console.log(formatFooter());
    return;
  }

  let claudeContent = '';
  try {
    claudeContent = readFileSync(claudeMdPath, 'utf8');
  } catch (err) {
    console.log(`\n${RED}  ✗ Impossible de lire CLAUDE.md${NC}`);
    console.log(formatFooter());
    return;
  }

  const s0Fields = parseS0(claudeContent);
  const { state, filled, total, keysToCheck } = getProjectState(s0Fields);

  if (state === 'vide') {
    console.log(`\n${formatEmpty()}`);
  } else if (state === 'amorçage') {
    console.log(`\n${formatBootstrapping(filled, total, keysToCheck, s0Fields)}`);
  } else if (state === 'mature') {
    console.log(`\n${formatMature(s0Fields)}`);
  }

  console.log(formatFooter());
}
