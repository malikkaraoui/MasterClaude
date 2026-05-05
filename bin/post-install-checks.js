import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const RED = '\x1b[0;31m';
const GREEN = '\x1b[0;32m';
const YELLOW = '\x1b[0;33m';
const CYAN = '\x1b[0;36m';
const DIM = '\x1b[2m';
const NC = '\x1b[0m';

export function runPostInstallChecks(projectRoot, pkgRoot) {
  console.log(`\n${CYAN}Post-install checks${NC}\n`);

  // 1. npm audit — uniquement si projectRoot est un projet Node
  //    (présence de package.json). En install --global depuis un répertoire
  //    arbitraire, ce check n'a pas de sens et produit de faux signaux.
  const hasPackageJson = existsSync(join(projectRoot, 'package.json'));

  if (hasPackageJson) {
    const auditResult = spawnSync('npm', ['audit', '--audit-level=high'], {
      cwd: projectRoot,
      encoding: 'utf-8',
    });

    if (auditResult.status === 0) {
      console.log(`${GREEN}✓${NC} npm audit OK ${DIM}(${projectRoot})${NC}`);
    } else {
      console.log(`${RED}⚠${NC} npm audit — vulnérabilités high/critical détectées`);
      if (auditResult.stdout) console.log(auditResult.stdout);
      if (auditResult.stderr) console.error(auditResult.stderr);
    }
  } else {
    console.log(`${DIM}─ npm audit ignoré (pas de package.json dans le répertoire courant)${NC}`);
  }

  // 2. lint-npm-files — vérifie le package claude-atelier lui-même (pkgRoot)
  const lintResult = spawnSync('node', ['test/lint-npm-files.js'], {
    cwd: pkgRoot,
    encoding: 'utf-8',
  });

  if (lintResult.status === 0) {
    console.log(`${GREEN}✓${NC} package.json#files OK`);
  } else {
    console.log(`${YELLOW}⚠${NC} package.json#files incomplet`);
    if (lintResult.stdout) console.log(lintResult.stdout);
    if (lintResult.stderr) console.error(lintResult.stderr);
  }
}
