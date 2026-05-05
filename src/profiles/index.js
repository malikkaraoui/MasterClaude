/**
 * Presets de profils claude-atelier pour injection programmatique.
 * Utilisé par applyProfile() et le plugin @paperclipai/plugin-atelier.
 */

export const PROFILES = {
  full: {
    skills: [
      'angle-mort',
      'atelier-config',
      'atelier-doctor',
      'atelier-help',
      'atelier-setup',
      'audit-safe',
      'bmad-init',
      'compress',
      'copilot-loop',
      'design-senior',
      'freebox-init',
      'handoff-debt',
      'integrate-review',
      'ios-setup',
      'la-bise',
      'night-launch',
      'ollama-router',
      'qmd-init',
      'review-copilot',
      'token-routing',
    ],
    hooks: [
      'session-model.sh',
      'routing-check.sh',
      'model-metrics.sh',
      'guard-no-sign.sh',
      'guard-commit-french.sh',
      'guard-tests-before-push.sh',
      'guard-review-auto.sh',
      'guard-anti-loop.sh',
      'guard-hooks-reload.sh',
      'guard-qmd-first.sh',
      'detect-design-need.sh',
    ],
    mcp: {
      mcpServers: {
        qmd: {
          command: 'npx',
          args: ['qmd', 'serve'],
          env: {},
        },
      },
    },
  },

  lean: {
    skills: [
      'token-routing',
      'review-copilot',
    ],
    hooks: [
      'guard-no-sign.sh',
      'guard-tests-before-push.sh',
      'guard-review-auto.sh',
    ],
    mcp: {},
  },

  'review-only': {
    skills: [
      'review-copilot',
    ],
    hooks: [],
    mcp: {},
  },
};

/** @typedef {'full' | 'lean' | 'review-only'} ProfileName */
