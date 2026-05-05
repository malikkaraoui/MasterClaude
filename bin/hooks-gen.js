import { join } from 'node:path';

export function generateHooksSection(hooksDir, scriptsDir) {
  const h = name => `bash "${join(hooksDir, name)}"`;
  const n = (name, ...args) => `node "${join(scriptsDir, name)}" ${args.join(' ')}`;
  return {
    SessionStart: [{
      matcher: '',
      hooks: [
        { type: 'command', command: h('session-model.sh') },
        { type: 'command', command: h('vault-context.sh') },
        { type: 'command', command: n('memory-read.js', '--episodes-only', '--timeout', '2000') },
      ],
    }],
    UserPromptSubmit: [{
      matcher: '',
      hooks: [
        { type: 'command', command: h('routing-check.sh') },
        { type: 'command', command: h('model-metrics.sh') },
        { type: 'command', command: h('detect-design-need.sh') },
        { type: 'command', command: n('memory-read.js', '--context', '--timeout', '2000') },
      ],
    }],
    PreToolUse: [
      {
        matcher: 'Read',
        hooks: [{ type: 'command', command: h('guard-qmd-first.sh') }],
      },
      {
        matcher: 'Bash',
        hooks: [
          { type: 'command', command: h('guard-no-sign.sh'), if: 'Bash(*git commit*)' },
          { type: 'command', command: h('guard-commit-french.sh'), if: 'Bash(*git commit*)' },
          { type: 'command', command: h('guard-tests-before-push.sh'), if: 'Bash(*git push*)' },
        ],
      },
    ],
    PostToolUse: [
      {
        matcher: 'Edit|Write',
        hooks: [{ type: 'command', command: h('guard-hooks-reload.sh') }],
      },
      {
        matcher: 'Bash',
        hooks: [
          { type: 'command', command: h('guard-review-auto.sh'), if: 'Bash(*git commit*)' },
          { type: 'command', command: h('guard-anti-loop.sh') },
        ],
      },
    ],
  };
}
