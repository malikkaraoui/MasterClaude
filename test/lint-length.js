import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const coreRuntimePath = resolve(rootDir, 'src', 'fr', 'CLAUDE.md');
const maxLines = 150;

const lineCount = readFileSync(coreRuntimePath, 'utf8').split(/\r?\n/).length;

if (lineCount > maxLines) {
  process.stderr.write(`CLAUDE core too long: ${lineCount} lines (max ${maxLines}).\n`);
  process.exit(1);
}

process.stdout.write(`CLAUDE core length OK: ${lineCount}/${maxLines} lines.\n`);