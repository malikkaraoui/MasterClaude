// src/pulse/parse.js
import { readFileSync, existsSync } from 'node:fs';

export const SCHEMA_VERSION = 'pouls/1.0';

export function parsePoulsMd(filePath) {
  if (!existsSync(filePath)) return null;
  return parsePoulsMdContent(readFileSync(filePath, 'utf8'));
}

export function parsePoulsMdContent(content) {
  const m = content.match(/^---\r?\n([\s\S]+?)\r?\n---/);
  if (!m) throw new Error('pouls.md: frontmatter YAML manquant');

  const fm = _parseYaml(m[1]);
  if (fm.schema !== SCHEMA_VERSION) {
    throw new Error(`pouls.md: schema "${fm.schema}" non supporté (attendu: ${SCHEMA_VERSION})`);
  }

  return { ...fm, _body: content.slice(m[0].length).trim() };
}

export function isExpired(pouls) {
  if (!pouls.lastPulse || typeof pouls.ttl !== 'number') return true;
  return ageSeconds(pouls) > pouls.ttl;
}

export function ageSeconds(pouls) {
  if (!pouls.lastPulse) return Infinity;
  return (Date.now() - new Date(pouls.lastPulse).getTime()) / 1000;
}

function _parseYaml(yaml) {
  const result = {};
  let parent = null;

  for (const line of yaml.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const nested = line.match(/^  (\w[\w-]*):\s*(.*)$/);
    const top    = line.match(/^(\w[\w-]*):\s*(.*)$/);

    if (nested && parent) {
      if (!result[parent]) result[parent] = {};  // defensive init
      result[parent][nested[1]] = _coerce(nested[2]);
    } else if (top) {
      if (top[2] === '') {
        parent = top[1];
        result[parent] = {};
      } else {
        parent = null;
        result[top[1]] = _coerce(top[2]);
      }
    }
  }

  return result;
}

function _coerce(v) {
  const s = v.replace(/^["']|["']$/g, '').trim();
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === '') return s;
  const n = Number(s);
  if (isNaN(n) || !isFinite(n)) return s;  // reject NaN and Infinity
  return n;
}
