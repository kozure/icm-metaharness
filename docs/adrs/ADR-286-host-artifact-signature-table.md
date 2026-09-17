# ADR-286: One host-artifact signature table — `harness doctor` stops hardcoding four hosts

- **Status**: Accepted — implemented; `HOST_ARTIFACTS` at `src/host-config.ts:36`, doctor sweeps it at `src/subcommands.ts:153`, doctor now 10/10 where it was 4/10 (verified by mutation: reverting the sweep restores 6 false FAILs).
- **Date**: 2026-09-17
- **Deciders**: Chris (kozure) — fork owner; defect surfaced from the option-C follow-up audit of spec 02.
- **Tags**: doctor, host-artifacts, false-fail, drift, single-source-of-truth, scaffold
- **Related**: ADR-045 (per-host scaffold config emission — this table is that emitter's roster), ADR-046 (real-runtime host verification), ADR-247 (prime-agent's `install-prime-agent.md`), ADR-284 (UI removal — retired the parity surface that held a second copy), ADR-285 (spec 02, which prompted the audit that found this), `scripts/verify-all-hosts.mjs` (the CI sweep that already held the correct roster)
- **Prompted by**: `harness doctor` failed on six correctly scaffolded harnesses because its host-artifact check listed only the four hosts that existed when it was written.

---

## Context

`harness doctor` ends with a check that asks whether a harness has at least one host artifact. It was written when four hosts were reachable from the scaffold path, and hardcoded exactly those four:

```ts
const hasClaudeCode = existsSync(join(dir, '.claude', 'settings.json'));
const hasCodex      = existsSync(join(dir, '.codex', 'config.toml'));
const hasPi         = existsSync(join(dir, 'AGENTS.md'));
const hasHermes     = existsSync(join(dir, 'cli-config.yaml'));
check(hasClaudeCode || hasCodex || hasPi || hasHermes,
  'at least one host artifact present (.claude/, .codex/, AGENTS.md, or cli-config.yaml)');
```

The host roster grew to ten (ADR-045 / ADR-046): `copilot`, `opencode`, `github-actions`, `prime-agent`, `openclaw` and `rvm` were added, and the emitter in `host-config.ts` learned to emit each one's native config. The doctor check was not revisited.

The result is a **false FAIL on 6 of 10 hosts**. A user who scaffolds a correct openclaw harness — `.openclaw/openclaw.json` present and valid — runs `harness doctor` and is told, in the `FAIL` voice, that no host artifact is present, followed by the iter-93 support-bundle suggestion inviting them to file a bug about a harness that is in fact fine.

The knowledge of "which artifact identifies which host" existed in four places, with three different answers:

| Where | Roster | Correct? |
|---|---|---|
| `src/subcommands.ts` doctor | claude-code, codex, pi-dev, hermes | ✗ false-FAILs 6 hosts |
| `scripts/verify-all-hosts.mjs` | all 10, with per-host validators | ✓ |
| `examples/quickstart/quickstart.mjs` `VALID_HOSTS` | 6 | ✗ rejects 4 hosts |
| `HOSTS` in `src/index.ts` | all 10 | ✓ (the roster itself) |

So the same repo both knew the right answer (in its CI script) and gave the wrong one (in its user-facing diagnostic). This is the drift failure mode ADR-284 removed a parity surface to avoid — except here the copies are internal, so nothing caught it.

## Decision

**`HOST_ARTIFACTS` in `host-config.ts` is the single source of truth for per-host scaffold-time artifacts, and `doctor` sweeps it rather than listing hosts.**

```ts
export const HOST_ARTIFACTS: Record<Host, string[]> = {
  'claude-code':    ['.claude/settings.json'],
  codex:            ['.codex/config.toml'],
  'pi-dev':         ['AGENTS.md'],
  hermes:           ['cli-config.yaml'],
  openclaw:         ['.openclaw/openclaw.json'],
  rvm:              ['rvm.manifest.toml'],
  copilot:          ['.vscode/mcp.json'],
  opencode:         ['.opencode/opencode.json'],
  'github-actions': ['.github/workflows'],
  'prime-agent':    ['install-prime-agent.md'],
};
```

Doctor passes if **any** listed path is present, and names what it detected:

```
PASS host artifact present (detected: codex, pi-dev)
```

Four properties make this the right home and the right shape:

1. **It lives in the emitter.** `host-config.ts` is already the sole scaffold-time emitter for the nine non-claude hosts (ADR-284 retired the browser-generator parity surface), so its roster is the roster that actually lands on disk. The artifact a host is known by belongs next to the code that writes it.
2. **It is typed `Record<Host, string[]>`.** `Host` is the union derived from `HOSTS`, so adding a host to the roster without adding its artifact is a **compile error** — the drift cannot recur silently.
3. **`string[]`, not `string`.** `claude-code` emits `.claude/settings.json` *and* `.claude-plugin/plugin.json`; the latter is a plugin-scope proof with its own iter-134 WARN, so it is deliberately not listed, but the array shape means a host with genuinely multiple signatures needs no schema change. `github-actions`' workflow basename embeds the harness slug (`bot-<name>.yml`), so the containing directory `.github/workflows` is its stable signature.
4. **Detection is presence-only.** Doctor must not depend on `host-config.ts`'s emission code (content builders, YAML escaping) — only on its roster constant. The sweep is `existsSync`, path-kind agnostic, unchanged in semantics from the four `existsSync` calls it replaces.

The message keeps the iter-93 contract: on FAIL it still prints the support-bundle suggestion, and the failure branch still lists the full artifact set so the user knows what doctor looked for.

`examples/quickstart/quickstart.mjs` is fixed in the same pass: its `VALID_HOSTS` literal (6 hosts, rejecting copilot/opencode/github-actions/prime-agent as "invalid") becomes `HOSTS` imported from the built module. It was a fourth copy of the roster and the only one a user could hit before scaffolding.

## Consequences

- `harness doctor` now reports PASS for all ten hosts: measured 10/10 on freshly scaffolded harnesses, against 4/10 before (mutation-verified by stashing the change, rebuilding, and re-running the sweep — exactly the six predicted hosts flip).
- The compile-time coupling is the real guarantee. The regression test added in `__tests__/subcommands.test.ts` asserts `Object.keys(HOST_ARTIFACTS)` equals `HOSTS` and that each host's artifact is recognised; it would have failed before this change on six of the ten iterations. `__tests__/examples-quickstart.test.ts` stops asserting a hardcoded host list and iterates `HOSTS` instead, so the example can no longer pass its own test while rejecting advertised hosts.
- `scripts/verify-all-hosts.mjs` keeps its own per-host *verifiers*, which is correct and out of scope here: those check schema validity of an emitted config, a strictly stronger claim than doctor's presence check. Its roster is now consistent with the table; if a shared roster is ever wanted, `HOSTS` is the join point, not a new copy.
- `doctor`'s output now names the detected hosts, which is a small behaviour change for anyone matching the old string. The old string survives verbatim in the failure branch, and the only tests asserting on doctor's host line are the ones updated here.
- No scaffold output changes. The fix is diagnostic-only; no file any user receives is different.
