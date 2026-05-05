// src/pulse/write.js
import { writeFileSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { SCHEMA_VERSION } from './parse.js';

export function serialisePoulsMd(data, body) {
  const yaml = [
    `schema: ${SCHEMA_VERSION}`,
    `agent:`,
    `  id: "${data.agent.id}"`,
    `  name: "${data.agent.name}"`,
    `  role: "${data.agent.role}"`,
    `  provider: "${data.agent.provider}"`,
    ``,
    `status: "${data.status}"`,
    `lastPulse: "${data.lastPulse}"`,
    `ttl: ${data.ttl}`,
    ``,
    `phase: "${data.phase}"`,
    `intensity:`,
    `  current: ${Number(data.intensity.current).toFixed(2)}`,
    `  ceiling: ${Number(data.intensity.ceiling).toFixed(2)}`,
    ``,
    `lang: "${data.lang}"`,
  ].join('\n');

  return `---\n${yaml}\n---\n\n${body ?? ''}\n`;
}

export function writePoulsMd(filePath, data, body) {
  const targetDir = dirname(filePath);
  const tempPath = join(targetDir, `.pouls.${process.pid}.${randomUUID()}.tmp`);

  mkdirSync(targetDir, { recursive: true });
  try {
    writeFileSync(tempPath, serialisePoulsMd(data, body), 'utf8');
    try {
      renameSync(tempPath, filePath);
    } catch (renameErr) {
      if (renameErr.code !== 'EEXIST') throw renameErr;
      rmSync(filePath, { force: true });
      renameSync(tempPath, filePath);
    }
  } catch (error) {
    try { rmSync(tempPath, { force: true }); } catch {}
    throw error;
  }
}
