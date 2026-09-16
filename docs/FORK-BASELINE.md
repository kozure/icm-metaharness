# Fork baseline — inherited gates, before any fork code lands

Recorded: 2026-09-12 (task 1.9)
Pin: `d5833dc6512ac1adeeef91a331c29055cd8a4dbb` (npm `metaharness` `0.4.16`)
Commit at time of recording: `bdd536b` (fork bootstrap only — **no fork feature code**)

This is the **pre-existing** baseline. Per task 1.9, a pre-existing failure is
**recorded here, not fixed**, so that later failures stay attributable to fork
changes rather than to a moving floor.

## Environment

| tool | version |
|---|---|
| node | v26.7.0 |
| npm | 11.19.0 |
| cargo | 1.88.0 (873a06493 2025-05-10) |
| rustc | 1.88.0 (aarch64-apple-darwin) |
| wasm-pack | **not installed locally** |

`package.json` `engines.node` is `>=20.0.0`; the local run used Node 26, which
satisfies it. Note that CI runs Node 20 and 22 specifically, so the CI matrix is
the authoritative Node result, not the local run.

## Results

| gate | result |
|---|---|
| `npm install` | **PASS** (4 packages have uncovered install scripts — warnings only, not failures) |
| `npm run build` | **PASS** — `[build-ordered] DONE in 18813ms`, all 4 phases, exit 0 |
| `npm test` | **1 FAILED / 2690 passed, 127 skipped** (263 files passed, 1 file failed) |
| `npm run lint` | **PASS** — exit 0 |
| Rust path (`npm run test:rust`) | **NOT RUN** — recorded as skipped (see below) |
| WASM path (`npm run build:wasm`) | **NOT RUN** — `wasm-pack` not installed locally |

### The single pre-existing test failure

`packages/oasf/src/oasf/__tests__/publish.test.ts` →
*"publishToDirectory — live server integration > pushes and publishes a real
record to a real running Directory server, then it is lookup-able"*
(`src/oasf/__tests__/publish.test.ts:195`)

```
AssertionError: expected false to be true // Object.is equality
  expect(result.published).toBe(true);   →  received false
```

**Assessment: environmental, pre-existing, not a baseline defect introduced
here.** The test's own name states it requires *"a real running Directory
server"*; none is running locally, so `publishToDirectory` returns
`published: false`. It is an integration test against external infrastructure,
and the fork bootstrap at this commit changed **no source file** — the only
commits are `.fork-pin`, workflow disposition headers, `FORK-RESYNC.md`, and
ADR-279. It is recorded as the baseline, not fixed (task 1.9).

### Rust and WASM paths skipped locally

`wasm-pack` is not installed in this environment, so `build:wasm` (and the WASM
path in `test:rust`) could not run locally. This is a **toolchain gap, not a
code result** — it must not be read as a pass. Both paths *are* exercised in CI
(`ci.yml` WASM ×3-OS and Rust ×3-OS jobs), which is where they are actually
verified.

## CI baseline (task 1.6)

`ci.yml` was first dispatched manually on the fork branch (run `34714363286`). The
job matrix is the upstream one — Rust ×3-OS, WASM ×3-OS, Node 20/22 across OSes,
plus the native Meta-Proxy lifecycle jobs — and all jobs execute on the fork.
Results are recorded in the Phase 5 note
(`docs/specs/01-spec-icm-generator-emission/01-repin-and-halt-note.md`).

**Superseded by ADR-280:** CI is no longer dispatch-only. The inherited triggers
matched `branches: [main]`, which no fork branch satisfies, so nothing ran on a
push. The triggers were widened to include `fork/main`, and CI now runs
**automatically on every push** — verified by push `9981fbe` (run `34748194333`,
17/17 green) and by push `f9b6b29` firing four workflows with no manual
dispatch. See `docs/adrs/ADR-280-fork-ci-triggers-on-fork-main.md`, which also
records the Windows-only test defect and the inherited `audit-deps` failure that
the newly-live gate surfaced immediately.

**Superseded by ADR-283:** the fork's branch was **renamed `fork/main` → `main`**,
so it is now the repository's true `main` and its default branch. The ADR-280
widening above is retired — every trigger list matches upstream's `[main]`
exactly again, removing the re-sync conflict hazard ADR-280 had to accept.
See `docs/adrs/ADR-283-fork-branch-renamed-to-main.md`.

One non-blocking CI annotation: GitHub warns that `actions/checkout` and
`actions/setup-node` target Node 20 and are being forced onto Node 24. This is
an upstream-wide deprecation notice, not a fork defect, and is **recorded, not
fixed**.

---

## Baseline change: ADR-284 removes the UI (2026-09-16)

**This is the first change to the fork's baseline delta that *deletes*
upstream-owned files.** Verified before it landed: across all prior fork history
**0 upstream paths had been removed** — every divergence until now was an
addition or an in-place edit. A deletion of this size changes what "the fork
versus the pin" means, so it is recorded here rather than left to the diff.

### What the delta is now

`ADR-284` removes the browser UI entirely. Against pin
`d5833dc`, the six UI paths held **60 tracked files**:

| path | tracked at pin | disposition |
|---|---:|---|
| `apps/web-ui/` | 50 | deleted (49) + 1 relocated |
| `docs/web-ui/` | 5 | deleted |
| `__tests__/browser-smoke/` | 2 | deleted |
| `packages/arc-agi-3-chatgpt/public/arc-widget.html` | 1 | deleted |
| `.github/workflows/pages.yml` | 1 | deleted |
| `.github/workflows/pages-monitor.yml` | 1 | deleted |
| **total** | **60** | **59 deleted, 1 relocated** |

The one relocation is `apps/web-ui/public/assets/swe-pareto.json` → `docs/research/swe-pareto.json`.
It is research data with two script consumers and an ADR-179 lineage, not UI
code, so it was moved by `git mv` rather than dropped.

```
$ git diff --stat d5833dc..HEAD -- apps/web-ui | tail -1
 50 files changed, 11912 deletions(-)
```

50 files, **0 additions** — the delta versus the pin is an explicit, attributable
removal, which is the property ADR-279's pin discipline exists to preserve.

### Why this does not move the failure floor

Task 1.9's rule is that a pre-existing failure is *recorded, not fixed*, so that
later failures stay attributable. That rule was applied to this work in the
opposite direction: before claiming the removal introduced nothing, a worktree
was created at the pre-removal commit `f1eadbc`, given the same `node_modules`,
**fully built**, and the whole root suite run there for comparison. Every failing
file at HEAD fails identically at that baseline. The removal moved the floor by
zero.

### A correction to the "1 pre-existing test failure" figure above

The `npm test` row in §Results records **1 failed** file. That figure is
accurate for `npm test`, but `npm test` is `npm run -ws --if-present test`, and
`-ws` **excludes the root package** — so it has never run the 47 root
`__tests__/` files. Measured with root `npx vitest run`, which does reach them,
the suite collects **322 files / 3,203 tests** and the real pre-existing failure
set is far larger than one file. This is upstream gap **#194** (the root suite
has no CI runner), not a fork regression, and it is recorded here rather than
fixed. The original row is left as written — it was a true statement about the
command it names.

**Consequence for future baselining:** measure with root `npx vitest run`, not
`npm test`, or the figure will describe only the workspace half of the suite.
