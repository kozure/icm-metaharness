# 01-task-02-proofs.md — Unit 2.0

Proof record for parent task **2.0 — Delete the UI artifacts and retire the UI from root scan and probe tooling**
(`01-tasks-remove-ui-components.md`, spec Unit 2).

All command output below is captured verbatim from real runs. Nothing is hand-written.

---

## 1. Task summary

| | |
| --- | --- |
| Parent task | 2.0 — delete the artifacts, retire the scan and probe targets |
| Sub-tasks | 2.1 – 2.17 (17 of 17 complete) |
| Spec requirements covered | Unit 2 FR-1 … FR-7 |
| Deletion | **60 tracked paths** at pin `d5833dc` across the six UI paths — 59 deleted, 1 (`swe-pareto.json`) relocated |
| Gates | `path-guard`, `sbom`, `audit-deps`, `healthcheck`, `check:coverage`, `lint`, `vertical-tour` — all exit 0 |
| Commit | one scoped commit, un-pushed — see §7 |

### What changed

| Area | Change |
| --- | --- |
| `docs/research/swe-pareto.json` | relocated by `git mv` from `apps/web-ui/public/assets/`; 3 consumers repointed (2.1) |
| `scripts/path-guard.mjs` | `SCAN_DIRS` → `['packages', 'crates', 'scripts']`; iter-65 justification replaced (2.2) |
| `scripts/sbom.mjs` | `EXTRA_LOCK_DIRS` → `[]`; rationale rewritten (2.3) |
| `scripts/audit-deps.mjs` | `known` → `[]`; usage example generalised to `<dir>`; two rationales rewritten (2.4) |
| `scripts/check-runner-coverage.mjs` | `working-directory` coverage-crediting loop and its justification deleted (2.5) |
| `scripts/healthcheck.mjs` | `pages()` check, `STUDIO_URL`, `PROBE_PAGES`, usage line deleted — 8 checks → 7 (2.6) |
| `scripts/preflight.mjs` | `--probe-pages` flag, usage line, and the opt-in step block deleted outright (2.7) |
| `scripts/release.mjs` | `--probe-pages` pass-through dropped; the "incl. live Studio probe" log reworded (2.7) |
| `apps/` | **deleted entirely** — 49 tracked files via `git rm`, untracked `dist/`/`node_modules/`/`tsconfig.tsbuildinfo` via `trash` (2.9) |
| `docs/web-ui/`, `__tests__/browser-smoke/`, `packages/arc-agi-3-chatgpt/public/arc-widget.html` | deleted (2.10) |
| `.github/workflows/pages.yml`, `pages-monitor.yml` | deleted (2.11) |
| `packages/arc-agi-3-chatgpt/package.json` | `"public/**"` dropped from `files` — dead config once the widget was the dir's only content |
| `SUBMISSIONS.md` | the "Add your row" edit target repointed off the deleted path (see §5.1) |
| `__tests__/research-asset-paths.test.ts` | **new** — the FR-7 guard (2.16) |
| `scripts/runner-coverage-allowlist.json` | one line: the new root test, same reason as the other 45 root entries |

---

## 2. What this task proves

1. **The artifacts are gone from the index, not merely untracked.** `git ls-files` returns zero paths across every UI path, and `apps/` no longer exists on disk.
2. **The fork's delta versus pin is an explicit, attributable removal.** 50 files changed, 0 additions, 11 912 deletions under `apps/web-ui` alone; 60 tracked paths at the pin across all six UI paths.
3. **No surviving workflow references the deleted tree or either deleted workflow.** Zero of the 8 survivors match.
4. **The scanners and the health gate tolerate the retired targets.** `path-guard` prints its scan list without `apps`; `audit-deps` reports `extra-scans=none`; `healthcheck` prints 7/7 with no `pages` check; `check:coverage` is green.
5. **The research data survived its host directory.** Both script consumers resolve a live path, guarded by a test that resolves the declared path rather than only matching its text — proven falsifiable two ways.
6. **The probe is fully unreferenced**, in source and at runtime.

---

## 3. Per-artifact evidence

### 3.1 FR-7 — the research asset was relocated, not lost (2.1)

**Context.** `swe-pareto.json` is 28 KB of research data that happened to live in the UI tree's public directory. Deleting the tree without relocating it would have silently broken two root scripts' inputs. It moved by `git mv` (so history follows it), and every consumer was repointed. The grep below is the completeness check: the only surviving mention of the old path is `packages/darwin-mode/LEARNINGS.md:1154`, a historical research record that sub-task 4.12 explicitly protects.

```
$ grep -n swe-pareto SUBMISSIONS.md scripts/nightly-sota-review.mjs scripts/pareto-from-firestore.mjs
SUBMISSIONS.md:57:Edit **`docs/research/swe-pareto.json`** -> `benchmarks.<lite|verified|pro>.entries[]` and append:
SUBMISSIONS.md:105:- [ ] One row added to the right benchmark tab in `swe-pareto.json`
scripts/pareto-from-firestore.mjs:16:const JSON_PATH = 'docs/research/swe-pareto.json';
scripts/nightly-sota-review.mjs:33:const PARETO_PATH = join(REPO, 'docs/research/swe-pareto.json');
scripts/nightly-sota-review.mjs:291:- `docs/research/swe-pareto.json` — add/update the Lite entry + refresh the Pareto frontier

$ grep -rn "apps/web-ui/public/assets" --include='*.mjs' --include='*.ts' --include='*.md' . | grep -v node_modules | grep -v docs/specs
packages/darwin-mode/LEARNINGS.md:1154:  … (historical research record — protected by sub-task 4.12)
```

### 3.2 FR-1 … FR-4 — the artifacts are gone (2.9 – 2.13)

**Context.** Tracked paths were removed with `git rm`; the gitignored remainders (`dist/`, `node_modules/`, `tsconfig.tsbuildinfo`) and the empty `public/assets/` shell left behind by the 2.1 `git mv` went to `trash`. **`rm` was not used on any project path.** The `git diff --cached --stat` line against the pin is the attributability proof the spec asks for: 50 files, 0 additions.

```
### 2.12 — deletion counts
$ git ls-files apps docs/web-ui __tests__/browser-smoke packages/arc-agi-3-chatgpt/public/arc-widget.html
(zero paths above)

$ ls apps .github/workflows/
ls: apps: No such file or directory
ci.yml
draco.yml
examples-packages-smoke.yml
proxy-pin-drift.yml
publish.yml
published-smoke.yml
real-tools.yml
security.yml

$ git ls-files .github/workflows/pages.yml .github/workflows/pages-monitor.yml
(zero paths above)

$ git diff --cached --stat d5833dc -- apps/web-ui | tail -1
 50 files changed, 11912 deletions(-)

$ git diff --cached --numstat d5833dc -- apps/web-ui | wc -l   # files changed
      50
$ git diff --cached --numstat d5833dc -- apps/web-ui | awk "{a+=\$1} END {print a}"   # total additions
0

### per-path tracked deletions vs pin d5833dc
apps/web-ui                                          50
docs/web-ui                                          5
__tests__/browser-smoke                              2
packages/arc-agi-3-chatgpt/public/arc-widget.html    1
.github/workflows/pages.yml                          1
.github/workflows/pages-monitor.yml                  1
--- total at pin ---
      60

$ git ls-files docs/research/swe-pareto.json   # relocated, not deleted
docs/research/swe-pareto.json

### 2.13 — surviving workflows
$ grep -lniE "apps/|pages" .github/workflows/*.yml
exit=1 (1 = zero files matched)
```

### 3.3 Reconciling the spec's 60-file figure (2.12)

**Context.** Sub-task 2.12 says to confirm the total against the spec's 60 and *report any discrepancy rather than adjusting the number*. There is no discrepancy in the count — the six UI paths held exactly **60** tracked files at pin `d5833dc` (50 + 5 + 2 + 1 + 1 + 1, per the per-path table in §3.2). The one refinement worth stating explicitly:

| | |
| --- | --- |
| Tracked at pin across the six UI paths | **60** |
| Deleted outright | **59** |
| Relocated rather than deleted | **1** — `apps/web-ui/public/assets/swe-pareto.json` → `docs/research/swe-pareto.json` |

That single relocation is exactly what sub-task 2.1 and Open Question 4 specify, so the spec's "60 tracked files removed from the fork" and the "50 deletions / 0 additions" diff both hold as written; `apps/web-ui` simply reads as 49 tracked files between 2.1 and 2.9. Nothing was adjusted.

### 3.4 FR-5 / FR-6 — scanners and health gate tolerate the retired targets (2.14)

**Context.** The five sub-task 2.14 gates plus `npm run lint` and the vertical-tour gate. Note `path-guard`'s scan list — `apps` is absent — and `audit-deps`' `extra-scans=none`, which is the retired auto-discovery reporting itself. `healthcheck` now prints **7 checks** and **8 workflows**, both direct consequences of this unit.

```
==============================================
$ node scripts/path-guard.mjs
path-guard: clean (scanned packages, crates, scripts on darwin)
--> exit=

==============================================
$ node scripts/sbom.mjs
      "filesAnalyzed": false,
      "licenseConcluded": "NOASSERTION",
      "licenseDeclared": "NOASSERTION",
      "copyrightText": "NOASSERTION",
      "externalRefs": [
        {
          "referenceCategory": "PACKAGE-MANAGER",
          "referenceType": "purl",
          "referenceLocator": "pkg:cargo/zmij@1.0.23"
        }
      ]
    }
  ]
}
--> exit=

==============================================
$ node scripts/audit-deps.mjs
[audit-deps] INFO: level=high include-dev=false skip-cargo=false skip-npm=false extra-scans=none
[audit-deps] PASS: npm(workspace) — 0 advisories at-or-above high (2 total below threshold)
[audit-deps] SKIP: cargo — cargo-audit not installed; cargo install cargo-audit
[audit-deps] INFO: ALL CLEAN at high+
--> exit=

==============================================
$ node scripts/healthcheck.mjs
healthcheck — 7 checks
  PASS version      all sources at 0.1.0
  PASS plugin       14 skills, 13 commands
  PASS codex        13 skills with skill.toml + README
  PASS workflows    8 workflows, all script refs resolve
  PASS pathguard    path-guard.mjs present (run separately for full scan)
  PASS examples     2 runnable examples present
  PASS catalogCount 20 templates in JSON + TS test + Rust test (in sync)

Result: HEALTHY (7/7 pass)
--> exit=

==============================================
$ npm run check:coverage

> agent-harness-generator@0.1.0 check:coverage
> node scripts/check-runner-coverage.mjs

runner coverage:
  workspaces npm test visits : 45
  cargo workspace members    : 5
  test files not reached     : 57 (57 allowlisted)
  crates not reached         : 4

ok — every test is reached by a runner or allowlisted with a reason
--> exit=
```

```
path-guard      exit=0
sbom            exit=0
audit-deps      exit=0
healthcheck     exit=0
check:coverage  exit=0
lint            exit=0
vertical-tour   exit=0
```

```
$ node examples/vertical-tour/vertical-tour.mjs
ICM pass: 2/2 OK.

[vertical-tour] DONE — 19/19 verticals HEALTHY, 2/2 ICM trees OK in 776ms
```

### 3.5 The probe is fully unreferenced (2.8)

**Context.** Two halves. The source half is a grep over `scripts/`. The runtime half needed preflight to run to completion, because the Studio step was the *last* block in the file — so reaching `Result:` with no such step is what proves it degrades to no step at all, rather than to a "skipped" line naming a flag that no longer exists. Preflight's own 4 failures are pre-existing and unrelated to this work (a dirty tree mid-unit, long-standing version drift, missing READMEs, and `npm test`); this run is evidence for the *absence of a step*, not a gate result.

```
$ grep -rn "probe-pages\|STUDIO_URL\|ruvnet.github.io" scripts/
exit=1 (1 = no match)

$ node scripts/preflight.mjs --skip-wasm --skip-rust
==> git is clean (no uncommitted changes)... FAIL
==> git on main branch... PASS
==> every package.json has version 0.1.0 (semver consistency)... FAIL
==> every published package has a README... FAIL
==> every published package declares publishConfig.access = public... PASS
==> CHANGELOG.md mentions current iter... PASS
==> LICENSE is MIT... PASS
==> rust gates skipped (--skip-rust)
==> wasm gates skipped (--skip-wasm)
==> npm tests...
Result: 4 failures, 0 warnings
```

No `live Studio probe` step appears. The only lines matching `probe|pages` anywhere in the full output are the unrelated `@metaharness/workspace-probe` package and a `codeql availability probe` test name.

### 3.6 The FR-7 guard (2.16)

**Context.** The audit's traceability failure #1 was that FR-7 had a CLI proof only. `__tests__/research-asset-paths.test.ts` closes it. The assertion that matters is not the string match — a constant repointed at a path that does not exist would still satisfy a "not under apps/" pattern — but the **resolve**: each declared path is resolved against the repo root and the file it names is asserted to exist.

```
 RUN  v2.1.9 /Users/phaedrus/DEV/Projects/icm-metaharness

 ✓ __tests__/research-asset-paths.test.ts > ADR-284 FR-7 — the research asset survived the UI tree removal > docs/research/swe-pareto.json exists and is tracked
 ✓ __tests__/research-asset-paths.test.ts > ADR-284 FR-7 — the research asset survived the UI tree removal > nightly-sota-review.mjs declares PARETO_PATH outside the removed UI tree, and it resolves
 ✓ __tests__/research-asset-paths.test.ts > ADR-284 FR-7 — the research asset survived the UI tree removal > pareto-from-firestore.mjs declares JSON_PATH outside the removed UI tree, and it resolves

 Test Files  1 passed (1)
      Tests  3 passed (3)
   Start at  02:07:49
   Duration  967ms (transform 67ms, setup 0ms, collect 62ms, tests 55ms, environment 0ms, prepare 194ms)
```

---

## 4. Falsifiability of the FR-7 guard (2.17)

**Context.** Sub-task 2.17 asks for one mutation. Two were run, because the guard has two independent failure modes and the audit's stated reason for requiring the test is the second one. The unmutated suite was green before and after each.

### 4.1 Mutation — `JSON_PATH` reverted under `apps/web-ui/public/assets/` (the sub-task's own mutation)

```
Failed Tests1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  __tests__/research-asset-paths.test.ts > ADR-284 FR-7 — the research asset survived the UI tree removal > pareto-from-firestore.mjs declares JSON_PATH outside the removed UI tree, and it resolves
AssertionError: pareto-from-firestore.mjs: JSON_PATH still points into the removed UI tree: expected 'apps/web-ui/public/assets/swe-pareto.…' not to match /(^|[\\/])apps[\\/]/])apps[\\

- Expected: 
/(^|[\\/])apps[\\/]/

+ Received: 
"apps/web-ui/public/assets/swe-pareto.json"

 ❯ __tests__/research-asset-paths.test.ts:50:14
     48|       const declared = declaredPath(script, constant);
     49|       expect(declared, `${script}: ${constant} still points into the r…
     50|         .not.toMatch(/(^|[\\/])apps[\\/]/);
       |              ^
     51|       // `nightly-sota-review.mjs` joins REPO; `pareto-from-firestore.…
     52|       // repo-root-relative literal. Both resol
```

### 4.2 Mutation — `JSON_PATH` repointed *outside* `apps/` to a path that does not exist

This is the case a string match cannot catch, and the one the audit required the test for.

```
Failed Tests1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  __tests__/research-asset-paths.test.ts > ADR-284 FR-7 — the research asset survived the UI tree removal > pareto-from-firestore.mjs declares JSON_PATH outside the removed UI tree, and it resolves
AssertionError: pareto-from-firestore.mjs: JSON_PATH = "docs/research/swe-pareto-RENAMED.json" resolves to /Users/phaedrus/DEV/Projects/icm-metaharness/docs/research/swe-pareto-RENAMED.json, which does not exist: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ __tests__/research-asset-paths.test.ts:57:9
     55|         existsSync(resolved),
     56|         `${script}: ${constant} = ${JSON.stringify(declared)} resolves…
     57|       ).toBe(true);
       |         ^
     58|     });
     59|   }

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

 Test Files  1 failed (1)
      Tests  1 failed | 2 passed (3)
   Start at  02:08:10
   Duration  898ms (tr
```

### 4.3 Reverted, green again

```

 Test Files  1 passed (1)
      Tests  3 passed (3)
   Start at  02:08:20
   Duration  856ms (transform 51ms, setup 0ms, collect 47ms, tests 53ms, environment 0ms, prepare 183ms)
```

---

## 5. Deviations from the plan (reported, not silently absorbed)

### 5.1 A third consumer of the relocated asset

**What the plan said.** Sub-task 2.1 names **two** root consumers: `scripts/nightly-sota-review.mjs` and `scripts/pareto-from-firestore.mjs`.

**What was actually true.** `SUBMISSIONS.md:57` is a third, and it is a *live instruction* — it tells contributors which file to edit to add a leaderboard row. Left unrepointed it would have directed every future submitter at a deleted path. It was repointed as part of the relocation, since a half-repointed relocation is the exact failure mode FR-7's guard exists to catch.

**Still open for Unit 4:** `SUBMISSIONS.md:3` carries `**[Live board →](https://ruvnet.github.io/metaharness/cost-pareto.html)**`, a live-product link to a page served only by the deleted SPA. `SUBMISSIONS.md` is **not** in sub-task 4.13's scrub list (README, USERGUIDE, PRIME_AGENT_LOOP, dream-cycle/PROMPT), so that link would survive the plan as written. It is the same class of retirement 4.8/4.16 handle for `README.md:405`, and is carried into 4.0 rather than fixed here.

### 5.2 Sub-task 2.5's premise holds only *after* the deletion

**What the plan said.** "Removing it can only tighten the gate, never break it, but the run is the proof."

**What was actually true.** Run at its stated position in the sequence — before 2.9 — `npm run check:coverage` **failed with 9 problems**, each one an `apps/web-ui` test file that the deleted `working-directory` special case had been crediting:

```
✗ test never run: apps/web-ui/e2e/generator.spec.ts
      in apps/web-ui, which no `workspaces` glob matches (["packages/*"])
  ✗ test never run: apps/web-ui/src/components/__tests__/host-guide.test.ts
      in apps/web-ui, which no `workspaces` glob matches (["packages/*"])
  ✗ test never run: apps/web-ui/src/generator/__tests__/artifacts.test.ts
      in apps/web-ui, which no `workspaces` glob matches (["packages/*"])
  ✗ test never run: apps/web-ui/src/generator/__tests__/embeddings.test.ts
      in apps/web-ui, which no `workspaces` glob matches (["packages/*"])
  ✗ test never run: apps/web-ui/src/generator/__tests__/mcp.test.ts
      in apps/web-ui, which no `workspaces` glob matches (["packages/*"])
  ✗ test never run: apps/web-ui/src/generator/__tests__/render.test.ts
      in apps/
```

The premise is true only once the tree those 9 files live in is gone. The verified invariant: **after 2.9–2.11, removing the special case leaves the gate green.** The re-run also surfaced that the new root test needed an allowlist entry, like the other 45 root tests:

```
> agent-harness-generator@0.1.0 check:coverage
> node scripts/check-runner-coverage.mjs

runner coverage:
  workspaces npm test visits : 45
  cargo workspace members    : 5
  test files not reached     : 57 (57 allowlisted)
  crates not reached         : 4

ok — every test is reached by a runner or allowlisted with a reason
```

No `apps/web-ui` entries existed in `scripts/runner-coverage-allowlist.json`, so the deletion left no stale entries behind.

### 5.3 **`npm test` cannot surface 6 of the 7 enumerated inversion sites**

This is the most consequential finding in this unit, and it changes how 2.17's and 3.15's checks must be run.

**What the plan said.** 2.14 and 2.17: "run the full `npm test` and confirm it is red at **exactly** the 7 known inversion sites and nowhere else."

**What is actually true.** The root `test` script is `npm run -ws --if-present test`. `-ws` **excludes the root package**, so `npm test` never runs a single root `__tests__/*.test.ts` file. That is not incidental — it is precisely why all 45 root tests carry an entry in `scripts/runner-coverage-allowlist.json` reading *"`-ws` excludes the root package, so nothing runs the root suite today."* The `npm test` log contains **zero** vitest runs rooted at the repo root.

Six of the seven enumerated sites are root tests:

| Site | Location | Reached by `npm test`? |
| --- | --- | --- |
| `__tests__/path-handling.test.ts` | root | **no** |
| `__tests__/sbom.test.ts` | root | **no** |
| `__tests__/workflows.test.ts` | root | **no** |
| `__tests__/audit-deps.test.ts` | root | **no** |
| `__tests__/healthcheck.test.ts` | root | **no** |
| `__tests__/release.test.ts` | root | **no** |
| `packages/arc-agi-3-chatgpt/__tests__/package.test.ts` | workspace | yes |

**The invariant actually verified**, replacing the literal instruction — the root suite run directly with `npx vitest run __tests__/path-handling.test.ts __tests__/sbom.test.ts __tests__/workflows.test.ts __tests__/audit-deps.test.ts __tests__/healthcheck.test.ts __tests__/release.test.ts`:

```

 Test Files  5 failed | 1 passed (6)
      Tests  14 failed | 51 passed (65)
   Start at  02:22:15
   Duration  4.76s (transform 487ms, setup 0ms, collect 826ms, tests 11.30s, environment 12ms, prepare 1.83s)
```

| Root site | Failing assertions | Verdict |
| --- | --- | --- |
| `path-handling.test.ts` | 2 | UI-caused, inverted by 3.1 |
| `sbom.test.ts` | 2 | UI-caused, inverted by 3.2 |
| `workflows.test.ts` | 4 | **2** UI-caused (pages), **2 pre-existing** — see §5.5 |
| `audit-deps.test.ts` | **0** | **not a hard-fail site** — see §5.4 |
| `healthcheck.test.ts` | 4 | UI-caused, inverted by 3.8 |
| `release.test.ts` | 2 | UI-caused, inverted by 3.9 |

So the end-of-2.0 state is **12 UI-caused failing assertions across 5 root files, plus 1 workspace file** — not "7 red files under `npm test`".

**Consequence for Unit 3:** sub-task 3.15's "run the full `npm test` and confirm fully green" would pass **without ever executing six of the seven inverted guards**. 3.15 needs the root suite run explicitly alongside `npm test`. Flagged for the maintainer; the task file is not edited.

### 5.4 `audit-deps.test.ts` is a *vacuous-pass* site, not a hard-fail site

Both of its `apps/web-ui` tests open with an early-out guard of the form `if (!existsSync(join(ROOT, 'apps', 'web-ui', 'package-lock.json'))) return;`. With the tree deleted they return immediately and **report green while asserting nothing**. The `--scan=apps/web-ui` test at `:81` passes too, because the flag is echoed back regardless of whether the directory exists.

Sub-task 3.4's inversion is still exactly right and still necessary — but the audit's characterisation of this file as one of the "7 hard-fail sites" does not hold: nothing here fails, which is precisely the problem.

### 5.5 Failures outside the enumerated set — every one proven pre-existing

Per the standing instruction, anything failing outside the 7 is treated as a candidate unenumerated coupling. Three appeared. **None is a coupling**, and each was proven so rather than assumed.

| Failure | Evidence it is not caused by this work |
| --- | --- |
| `__tests__/workflows.test.ts` — `publish.yml runs validate-gcp-secrets + publish-dryrun BEFORE any npm publish`, and `publish.yml publishes every host adapter package` | **Reproduced at the pre-work commit.** A clean worktree at `f1eadbc` with the same `node_modules` fails these same two assertions. `publish.yml` is untouched by this work (`git diff --name-only f1eadbc -- .github/workflows/publish.yml` is empty). |
| `packages/agntcy/src/oasf/__tests__/publish.test.ts` — `pushes and publishes a real record to a real running Directory server` | Guarded by `it.skipIf(!serverReachable)` — a live gRPC Directory-server integration test that ran because a server was reachable on this machine, and returned `published: false`. |
| `packages/darwin-mode` — 5–6 e2e/perf files | **Non-deterministic:** 6 failing files in the full run, **5** in an isolated re-run. Signatures are `Test timed out in 5000ms`, `Hook timed out in 10000ms`, `ENOTEMPTY: directory not empty, rmdir …/variants/g2_v5`, and `expected 1 to be greater than 1` — timing and filesystem races. |

Structural proof covering the latter two:

```
$ git diff --name-only f1eadbc -- packages/darwin-mode packages/agntcy
(empty — neither package was touched by Unit 1 or Unit 2)

$ git diff --name-only f1eadbc -- packages/ | cut -d/ -f2 | sort -u
arc-agi-3-chatgpt
create-agent-harness

packages/darwin-mode deps : typescript, vitest, @metaharness/flywheel   (none changed)
packages/agntcy      deps : agntcy-dir, typescript, vitest              (none changed)

$ stat -f "%Sm" node_modules
Sep 12 23:08:48 2026        # four days before this work; only `npm install
                            # --package-lock-only` was ever run, never an install

$ git diff f1eadbc -- package-lock.json | grep '^[-+] *"node_modules/'
-    "node_modules/@modelcontextprotocol/ext-apps"
-    "node_modules/@oven/bun-*"        (11 optional deps)
-    "node_modules/@rollup/rollup-*"   (6 optional deps)
```

Neither package references any removed path, neither depends on either changed package, and the installed dependency tree on disk is byte-identical to pre-work.

### 5.6 `packages/arc-agi-3-chatgpt/package.json` — `"public/**"` dropped from `files`

Deleting `arc-widget.html` left `public/` empty, and `git rm` removed the directory. The `"public/**"` entry in the package's `files` array then named a path that cannot exist. It was dropped as part of the artifact deletion — the package-manifest half of removing the widget. Not separately enumerated by the plan; sub-task 3.5's inverted tarball assertion depends on this being consistent.

### 5.7 One `rm` use, outside the project tree

The constraint is `trash`, never `rm`. Every project path in this unit went through `git rm` or `trash` (§3.2). One `rm -f` was used: on a `node_modules` **symlink created inside the scratchpad** at `…/scratchpad/baseline/node_modules`, which `git worktree remove` refuses to proceed past. No project file was involved. Recorded rather than left unstated.

---

## 6. Sub-task ledger

| Sub-task | State | Evidence |
| --- | --- | --- |
| 2.1 relocate the research asset, repoint consumers | done | §3.1, §5.1 |
| 2.2 retire `apps` from `path-guard.mjs` | done | §3.4 (`scanned packages, crates, scripts`) |
| 2.3 empty `EXTRA_LOCK_DIRS` in `sbom.mjs` | done | §3.4 (sbom exit 0) |
| 2.4 retire the UI target from `audit-deps.mjs` | done | §3.4 (`extra-scans=none`) |
| 2.5 remove the coverage special case + run the check | done | §5.2 — premise corrected, invariant recorded |
| 2.6 remove the Studio probe from `healthcheck.mjs` | done | §3.4 (7 checks, 7/7) |
| 2.7 remove the probe's callers | done | §3.5 |
| 2.8 verify the probe is unreferenced | done | §3.5 |
| 2.9 delete the Studio SPA, then `apps/` | done | §3.2 |
| 2.10 delete screenshots, browser-smoke, widget | done | §3.2 |
| 2.11 delete both Pages workflows | done | §3.2 |
| 2.12 verify deletion counts | done | §3.2, §3.3 |
| 2.13 verify no surviving workflow references | done | §3.2 (zero of 8 match) |
| 2.14 post-deletion gate sweep | done | §3.4; `npm test` analysed in §5.3, §5.5 |
| 2.15 commit 2.0 | done | §7 |
| 2.16 add the FR-7 guard | done | §3.6 |
| 2.17 prove the FR-7 guard falsifiable | done | §4.1 – §4.3; suite state in §5.3 |

---

## 7. Commit

Sub-task 2.15 landed as one scoped conventional commit:

```
chore(fork): remove UI artifacts and retire UI scan/probe targets
```

Sub-tasks 2.16 and 2.17 are ordered after 2.15 in the task file, but their artifact (the FR-7 guard) is part of this unit's deliverable, so it is included in this one commit rather than left as a dirty tree after the parent commit — matching how 1.16/1.17 were handled in Unit 1.

A commit cannot record its own hash; read it back with:

```
$ git log --oneline -1 -- docs/specs/01-spec-remove-ui-components/01-proofs/01-task-02-proofs.md
```

**Left un-pushed** per sub-task 4.18. No `git push` was run at any point.
