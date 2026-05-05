// src/pulse/format.js
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isExpired, ageSeconds } from './parse.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const _cache = {};

export function _clearCache() {
  for (const k of Object.keys(_cache)) delete _cache[k];
}

function _loadStrings(lang) {
  if (_cache[lang]) return _cache[lang];
  const p = join(__dirname, '..', lang, 'pulse', 'strings.json');
  const fallback = join(__dirname, '..', 'fr', 'pulse', 'strings.json');
  _cache[lang] = JSON.parse(readFileSync(existsSync(p) ? p : fallback, 'utf8'));
  return _cache[lang];
}

export function statusLabel(status, lang = 'fr') {
  return _loadStrings(lang).levels[status] ?? status;
}

export function pulseIndicator(status, active, total, lang = 'fr') {
  return `💓${statusLabel(status, lang)}·${active}/${total}`;
}

export function formatAge(seconds, lang = 'fr') {
  if (!isFinite(seconds)) return '—';
  const prefix = lang === 'en' ? '' : 'il y a ';
  const suffix = lang === 'en' ? ' ago' : '';
  if (seconds < 60)   return `${prefix}${Math.round(seconds)}s${suffix}`;
  if (seconds < 3600) return `${prefix}${Math.round(seconds / 60)}min${suffix}`;
  return `${prefix}${Math.round(seconds / 3600)}h${suffix}`;
}

export function renderStatusTable(agents, lang = 'fr', options = {}) {
  const s = _loadStrings(lang);
  const phase = options.phase
    ?? agents.find(a => a && !isExpired(a))?.phase
    ?? agents[0]?.phase
    ?? '—';
  const active = agents.filter(a => !isExpired(a)).length;
  const expired = agents.filter(a => isExpired(a)).length;
  const sep = '─'.repeat(70);

  const lines = [`💓 ${s.header} — ${phase}`, sep];

  for (const a of agents) {
    const exp = isExpired(a);
    const level = statusLabel(a.status, lang);
    const role = s.roles?.[a.agent?.role] ?? a.agent?.role ?? '—';
    const cur = Number(a.intensity?.current ?? 0).toFixed(1);
    const ceil = Number(a.intensity?.ceiling ?? 0).toFixed(1);
    const ageStr = exp ? s.expired : formatAge(ageSeconds(a), lang);
    lines.push(
      `  ${(a.agent?.id ?? '—').padEnd(28)} ${role.padEnd(10)} 💓${level.padEnd(8)} ` +
      `${cur}/${ceil}  ${exp ? '✗' : '✓'} ${ageStr}`
    );
  }

  lines.push(sep);
  lines.push(`  ${agents.length} agents · ${active} actifs · ${expired} expirés`);
  return lines.join('\n');
}
