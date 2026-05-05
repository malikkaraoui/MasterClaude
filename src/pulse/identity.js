import { createHash } from 'node:crypto';

const AGENT_HASH_LENGTH = 8;
const MAX_AGENT_SLUG_LENGTH = 63;

export function sanitizeHostname(rawHostname) {
  const normalized = String(rawHostname ?? 'unknown').trim().toLowerCase();
  const sanitized = normalized
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return sanitized || 'unknown';
}

export function legacySanitizeHostname(rawHostname) {
  return String(rawHostname ?? 'unknown').trim().toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .slice(0, MAX_AGENT_SLUG_LENGTH);
}

export function buildAgentSlug(rawHostname) {
  const raw = String(rawHostname ?? 'unknown');
  const base = sanitizeHostname(raw);
  const hash = createHash('sha1').update(raw).digest('hex').slice(0, AGENT_HASH_LENGTH);
  const maxBaseLength = MAX_AGENT_SLUG_LENGTH - AGENT_HASH_LENGTH - 1;
  const trimmedBase = base.slice(0, Math.max(1, maxBaseLength));
  return `${trimmedBase}-${hash}`;
}

export function buildAgentId(rawHostname) {
  return `claude-code/${buildAgentSlug(rawHostname)}`;
}

export function buildAgentName(rawHostname) {
  const label = String(rawHostname ?? '').trim() || 'unknown';
  return `Claude Code — ${label}`;
}

export function buildKnownAgentIds(rawHostname) {
  const raw = String(rawHostname ?? 'unknown');
  const legacy = legacySanitizeHostname(raw);

  return Array.from(new Set([
    buildAgentId(raw),
    `claude-code/${sanitizeHostname(raw)}`,
    `claude-code/${legacy}`,
    `claude-code/${raw}`,
  ]));
}