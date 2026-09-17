// SPDX-License-Identifier: MIT

import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { dispatch } from '../src/subcommands.js';

async function makeHarness(opts: { withHash?: boolean; withWitness?: boolean } = {}): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'cah-sub-'));
  await mkdir(join(dir, '.harness'), { recursive: true });
  await mkdir(join(dir, '.claude'), { recursive: true });
  const manifest = JSON.stringify({
    schema: 1,
    generator: '0.1.0',
    template: 'minimal',
    template_version: '0.0.0',
    vars: { name: 'demo' },
    hosts: ['claude-code'],
    files: { 'package.json': 'fakehash' },
    generated_at: '2026-06-13T00:00:00Z',
  }, null, 2);
  await writeFile(join(dir, '.harness', 'manifest.json'), manifest);
  if (opts.withHash) {
    await writeFile(
      join(dir, '.harness', 'manifest.sha256'),
      createHash('sha256').update(manifest, 'utf-8').digest('hex') + '\n',
    );
  }
  await writeFile(join(dir, 'package.json'), JSON.stringify({
    name: 'demo',
    dependencies: { '@metaharness/kernel': '0.1.0' },
  }));
  await writeFile(join(dir, '.claude', 'settings.json'), '{}');
  if (opts.withWitness) {
    await writeFile(join(dir, '.harness', 'witness.json'), JSON.stringify({
      schema: 1,
      harness: 'demo',
      version: '0.1.0',
      entries: [],
      public_key: 'a'.repeat(64),
      signature: 'b'.repeat(128),
    }));
  }
  return dir;
}

describe('dispatch — help', () => {
  it('prints usage on no subcommand', async () => {
    const r = await dispatch('help', []);
    expect(r.code).toBe(0);
    expect(r.lines.join('\n')).toMatch(/Usage: harness/);
  });

  it('returns code 2 on unknown subcommand', async () => {
    const r = await dispatch('what', []);
    expect(r.code).toBe(2);
    expect(r.lines.join('\n')).toMatch(/Unknown subcommand/);
  });
});

describe('dispatch — verify', () => {
  it('returns 1 + no-witness message on bare dir', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cah-verify-bare-'));
    const r = await dispatch('verify', [dir]);
    expect(r.code).toBe(1);
    expect(r.lines.join('\n')).toMatch(/No witness\.json/);
  });

  it('returns 0 when witness shape passes (degraded kernel mode)', async () => {
    const dir = await makeHarness({ withWitness: true });
    const r = await dispatch('verify', [dir]);
    expect(r.code).toBe(0);
    expect(r.lines.join('\n')).toMatch(/VALID/);
  });
});

describe('dispatch — doctor', () => {
  it('passes a well-formed harness', async () => {
    const dir = await makeHarness({ withHash: true });
    const r = await dispatch('doctor', [dir]);
    expect(r.code).toBe(0);
    expect(r.lines.join('\n')).toMatch(/HEALTHY/);
  });

  it('flags a missing host artifact', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cah-doctor-bad-'));
    await mkdir(join(dir, '.harness'), { recursive: true });
    await writeFile(join(dir, '.harness', 'manifest.json'), '{"files": {}}');
    await writeFile(join(dir, '.harness', 'manifest.sha256'), 'noop');
    await writeFile(join(dir, 'package.json'), '{}');
    const r = await dispatch('doctor', [dir]);
    expect(r.code).toBe(1);
    expect(r.lines.join('\n')).toMatch(/FAIL/);
  });

  // ADR-286 — doctor's host-artifact sweep must cover EVERY host the CLI can
  // scaffold. Before this, it accepted only .claude/, .codex/, AGENTS.md and
  // cli-config.yaml, so a correctly scaffolded openclaw / copilot / opencode /
  // github-actions / prime-agent / rvm harness failed doctor with "no host
  // artifact present" — a false FAIL on 6 of 10 hosts.
  it('recognises the artifact of every host the CLI can scaffold (ADR-286)', async () => {
    const { HOSTS } = await import('../src/index.js');
    const { HOST_ARTIFACTS } = await import('../src/host-config.js');

    // The table and the host roster cannot drift apart.
    expect(Object.keys(HOST_ARTIFACTS).sort()).toEqual([...HOSTS].sort());

    for (const host of HOSTS) {
      const dir = await mkdtemp(join(tmpdir(), `cah-doctor-${host}-`));
      await mkdir(join(dir, '.harness'), { recursive: true });
      // A host artifact alone is not enough for a HEALTHY verdict — doctor
      // legitimately FAILs on the unrelated structural checks above (no real
      // package.json, no readable manifest). What must hold is that the
      // host-artifact check itself PASSes and the detected host is named.
      // doctor detects by existsSync, which is path-kind agnostic, so a
      // directory at the artifact path is a valid stand-in (and avoids
      // fabricating schema-valid config for nine hosts).
      for (const p of HOST_ARTIFACTS[host]) {
        await mkdir(join(dir, p), { recursive: true });
      }
      const r = await dispatch('doctor', [dir]);
      const out = r.lines.join('\n');
      expect(out, `host=${host} not recognised by doctor`).toMatch(
        new RegExp(`PASS host artifact present \\(detected: [^)]*\\b${host}\\b`),
      );
      expect(out, `host=${host} reported a missing host artifact`).not.toMatch(
        /FAIL at least one host artifact present/,
      );
    }
  }, 30_000);

  it('flags a hash mismatch', async () => {
    const dir = await makeHarness({ withHash: false });
    // Write a wrong hash.
    await writeFile(join(dir, '.harness', 'manifest.sha256'), 'wrongwrongwrong');
    const r = await dispatch('doctor', [dir]);
    expect(r.lines.join('\n')).toMatch(/hash matches/);
  });
});

describe('dispatch — sign', () => {
  it('refuses without WITNESS_SIGNING_KEY', async () => {
    const dir = await makeHarness();
    const orig = process.env.WITNESS_SIGNING_KEY;
    delete process.env.WITNESS_SIGNING_KEY;
    try {
      const r = await dispatch('sign', [dir]);
      expect(r.code).toBe(1);
      expect(r.lines.join('\n')).toMatch(/WITNESS_SIGNING_KEY/);
    } finally {
      if (orig !== undefined) process.env.WITNESS_SIGNING_KEY = orig;
    }
  });

  it('refuses a malformed key', async () => {
    const dir = await makeHarness();
    const orig = process.env.WITNESS_SIGNING_KEY;
    process.env.WITNESS_SIGNING_KEY = 'not-hex';
    try {
      const r = await dispatch('sign', [dir]);
      expect(r.code).toBe(1);
      expect(r.lines.join('\n')).toMatch(/64-char hex/);
    } finally {
      if (orig === undefined) delete process.env.WITNESS_SIGNING_KEY;
      else process.env.WITNESS_SIGNING_KEY = orig;
    }
  });

  it('accepts a valid-shaped key and writes witness.json', async () => {
    const dir = await makeHarness();
    const orig = process.env.WITNESS_SIGNING_KEY;
    process.env.WITNESS_SIGNING_KEY = 'a'.repeat(64);
    try {
      const r = await dispatch('sign', [dir]);
      expect(r.code).toBe(0);
      expect(r.lines.join('\n')).toMatch(/Wrote witness manifest/);
    } finally {
      if (orig === undefined) delete process.env.WITNESS_SIGNING_KEY;
      else process.env.WITNESS_SIGNING_KEY = orig;
    }
  });
});
