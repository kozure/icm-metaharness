// SPDX-License-Identifier: MIT
//
// SC9 / audit R3 — the `--help` surface is *guarded*, not grepped once.
//
// Why this file exists: task 2.3 deletes the `--icm` line and the
// `(implies --icm; …)` clause from the usage block, and a one-time grep proves
// nothing about the future. A later commit could reintroduce a flag reference in
// help with no failing gate — the removal would silently rot. This is the gate.
//
// Scope, deliberately narrow:
//   - `--help` output names no removed flag (`--icm`, `--no-icm`);
//   - the `--answers` line no longer claims to imply ICM (task 2.2 changed the
//     semantics: answers supply *content*, the template supplies ICM-ness).
//
// It asserts on the *rendered* help path (`main([])`, which is the bare
// invocation and returns 0 per #73) rather than on source text, so a future
// refactor that moves the usage string cannot silently bypass it.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { main } from '../src/index.js';

afterEach(() => {
  vi.restoreAllMocks();
});

/** Run the bare (usage-printing) invocation and return everything it wrote. */
async function captureHelp(): Promise<string> {
  const lines: string[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(' '));
  });
  try {
    // A bare `metaharness` prints usage and exits 0 (#73) — no TTY, no scaffold.
    const code = await main([]);
    expect(code).toBe(0);
  } finally {
    spy.mockRestore();
  }
  return lines.join('\n');
}

describe('help surface carries no removed flag (SC9)', () => {
  it('renders the usage block without --icm or --no-icm', async () => {
    const help = await captureHelp();
    // Sanity: we really did capture the usage block, not an empty string — a
    // silently-empty capture would make the assertions below vacuously pass.
    expect(help).toContain('Usage: npx metaharness');
    expect(help.length).toBeGreaterThan(200);
    expect(help).not.toContain('--icm');
    expect(help).not.toContain('--no-icm');
  });

  it('does not claim --answers implies the ICM tree', async () => {
    const help = await captureHelp();
    const answersLine = help.split('\n').find((l) => l.includes('--answers'));
    expect(answersLine, '--answers must still be documented').toBeDefined();
    expect(answersLine).not.toContain('implies --icm');
    expect(answersLine).not.toContain('ICM-ness');
    // Still advertises the headless-onboarding contract it *does* keep.
    expect(answersLine).toContain('all questions required');
  });
});
