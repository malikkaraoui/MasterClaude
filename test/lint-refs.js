import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const markdownRoots = [
  join(rootDir, 'README.md'),
  join(rootDir, 'CHANGELOG.md'),
  join(rootDir, 'docs'),
  join(rootDir, 'src')
];

function collectMarkdownFiles(targetPath) {
  if (!existsSync(targetPath)) {
    return [];
  }

  const stats = statSync(targetPath);

  if (stats.isFile()) {
    return extname(targetPath) === '.md' ? [targetPath] : [];
  }

  const files = [];

  for (const entry of readdirSync(targetPath, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') {
      continue;
    }

    files.push(...collectMarkdownFiles(join(targetPath, entry.name)));
  }

  return files;
}

function normalizeTarget(rawTarget) {
  const trimmed = rawTarget.trim();
  const withoutTitle = trimmed.match(/^([^\s]+)(?:\s+"[^"]*")?$/)?.[1] ?? trimmed;

  return withoutTitle.replace(/^<|>$/g, '');
}

function isIgnoredTarget(target) {
  return target === '' || target.startsWith('#') || /^(https?:|mailto:|tel:)/i.test(target);
}

function validateFile(filePath) {
  const errors = [];
  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
  let inFence = false;

  lines.forEach((line, index) => {
    if (/^```/.test(line.trim())) {
      inFence = !inFence;
      return;
    }

    if (inFence) {
      return;
    }

    const matches = line.matchAll(/(?<!!)\[[^\]]*\]\(([^)]+)\)/g);

    for (const match of matches) {
      const target = normalizeTarget(match[1]);

      if (isIgnoredTarget(target)) {
        continue;
      }

      const [relativePath] = target.split('#');
      const resolvedPath = resolve(dirname(filePath), decodeURI(relativePath));

      if (!existsSync(resolvedPath)) {
        errors.push({
          filePath,
          line: index + 1,
          target
        });
      }
    }
  });

  return errors;
}

const markdownFiles = markdownRoots.flatMap(collectMarkdownFiles);
const errors = markdownFiles.flatMap(validateFile);

if (errors.length > 0) {
  process.stderr.write('Markdown reference check failed.\n');

  for (const error of errors) {
    const relativeFile = error.filePath.replace(`${rootDir}/`, '');
    process.stderr.write(`- ${relativeFile}:${error.line} → ${error.target}\n`);
  }

  process.exit(1);
}

process.stdout.write(`Markdown references OK (${markdownFiles.length} files checked).\n`);