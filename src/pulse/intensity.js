// src/pulse/intensity.js

const ROLE_PROFILES = {
  secretary: { ceiling: 0.3, base: 0.2, ttl: 600 },
  dev:       { ceiling: 0.8, base: 0.3, ttl: 300 },
  marketing: { ceiling: 0.6, base: 0.3, ttl: 900 },
  cyber:     { ceiling: 1.0, base: 0.4, ttl: 120 },
  ops:       { ceiling: 0.7, base: 0.4, ttl: 180 },
};

const DEFAULT_PROFILE = { ceiling: 0.5, base: 0.2, ttl: 300 };

const PHASE_BOOSTS = [
  { keywords: ['archi', 'conception', 'design', 'spec'],        boosts: { dev: 0.3, ops: 0.2 } },
  { keywords: ['impl', 'code', 'feat', 'fix', 'dev'],           boosts: { dev: 0.4 } },
  { keywords: ['review', 'qa', 'test'],                         boosts: { secretary: 0.1, dev: 0.2 } },
  { keywords: ['deploy', 'release', 'publish', 'bump', 'prod'], boosts: { ops: 0.3, cyber: 0.2 } },
  { keywords: ['freeze', 'pause', 'repos'],                     boosts: { dev: -0.2, ops: -0.2, marketing: -0.2 } },
];

export function getProfile(role) {
  return ROLE_PROFILES[role] ?? DEFAULT_PROFILE;
}

export function computeIntensity(role, phase) {
  const profile = getProfile(role);
  const phaseLow = (phase ?? '').toLowerCase();
  let boost = 0;

  for (const { keywords, boosts } of PHASE_BOOSTS) {
    if (keywords.some(k => phaseLow.includes(k))) {
      boost += boosts[role] ?? 0;
    }
  }

  return Math.min(Math.max(profile.base + boost, 0), profile.ceiling);
}

export function intensityToStatus(intensity) {
  if (intensity === 0) return 'off';
  if (intensity <= 0.2) return 'idle';
  if (intensity <= 0.4) return 'low';
  if (intensity <= 0.6) return 'medium';
  if (intensity <= 0.8) return 'high';
  return 'critical';
}
