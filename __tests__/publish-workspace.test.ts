// Unit coverage for the idempotent publish decision + release set.
// The script's I/O (npm view / npm publish) needs a live registry, but the
// skip-or-publish decision and the curated release order are pure — and
// the decision is exactly what was missing when publish.yml 403'd on
// already-published versions (7/7 failed runs before this fix).
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error — .mjs script, no types; runtime import is fine under vitest.
import { needsPublish, RELEASE_ORDER } from '../scripts/publish-workspace.mjs';

describe('needsPublish', () => {
  it('skips when the version is already on the registry (exit 0 + version echoed)', () => {
    expect(needsPublish({ exitCode: 0, stdout: '0.4.2\n' })).toBe(false);
  });

  it('publishes when npm view 404s (package or version missing, npm >= 10)', () => {
    expect(needsPublish({ exitCode: 1, stdout: '' })).toBe(true);
  });

  it('publishes when npm view exits 0 with empty output (older npm, version missing)', () => {
    expect(needsPublish({ exitCode: 0, stdout: '' })).toBe(true);
    expect(needsPublish({ exitCode: 0, stdout: '  \n' })).toBe(true);
  });

  it('attempts publish on unknown outcomes rather than silently skipping', () => {
    // Network/auth failures must not masquerade as "already published".
    expect(needsPublish({ exitCode: 7, stdout: '' })).toBe(true);
  });
});

describe('RELEASE_ORDER', () => {
  it('pins the curated release set (deliberate ratchet, not a glob)', () => {
    // This list is pinned on purpose: publish-workspace.mjs says "widen this
    // list consciously, not by directory glob". Update this expectation in the
    // same commit that widens the production list.
    expect(RELEASE_ORDER).toEqual([
      'kernel-js',
      'sdk',
      'host-claude-code',
      'host-codex',
      'host-pi-dev',
      'host-hermes',
      'host-openclaw',
      'host-rvm',
      'host-prime-agent',
      'vertical-base',
      'vertical-trading',
      'field-memory',
      'create-agent-harness',
      'avo',
    ]);
  });

  it('every entry exists in packages/ with a package.json', () => {
    for (const dir of RELEASE_ORDER) {
      expect(
        existsSync(join(__dirname, '..', 'packages', dir, 'package.json')),
        `packages/${dir}/package.json`,
      ).toBe(true);
    }
  });
});
