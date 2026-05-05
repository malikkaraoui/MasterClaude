/**
 * claude-atelier — point d'entrée programmatique
 *
 * Usage :
 *   import { applyProfile } from 'claude-atelier'
 *   await applyProfile({ cwd: '/path/to/worktree', profile: 'lean' })
 */
export { applyProfile } from './src/apply-profile.js';
export { PROFILES } from './src/profiles/index.js';
/** @typedef {import('./src/profiles/index.js').ProfileName} ProfileName */
