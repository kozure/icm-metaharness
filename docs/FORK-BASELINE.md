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

`ci.yml` was dispatched on `fork/main` (run `34714363286`). The job matrix is
the upstream one — Rust ×3-OS, WASM ×3-OS, Node 20/22 across OSes, plus the
native Meta-Proxy lifecycle jobs — and all jobs execute on the fork. Results are
recorded in the Phase 5 note
(`docs/specs/01-spec-icm-generator-emission/01-repin-and-halt-note.md`).

One non-blocking CI annotation: GitHub warns that `actions/checkout` and
`actions/setup-node` target Node 20 and are being forced onto Node 24. This is
an upstream-wide deprecation notice, not a fork defect, and is **recorded, not
fixed**.
