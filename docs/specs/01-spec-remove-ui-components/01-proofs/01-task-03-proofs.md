# 01-task-03-proofs.md — Unit 3.0

Proof record for parent task **3.0 — Invert the test contract so UI reappearance fails CI**
(`01-tasks-remove-ui-components.md`, spec Unit 3, as corrected by audit revisions R8–R12 in `7121ad5`).

All command output below is captured verbatim from real runs. Nothing is hand-written.

---

## 1. Task summary

| | |
| --- | --- |
| Parent task | 3.0 — invert UI-presence assertions into absence guards |
| Sub-tasks | 3.1 – 3.17 (17 of 17 complete) |
| Spec requirements covered | Unit 3 FR-1 … FR-7 |
| Guards | 7 inverted files + 1 new invariant guard; **10 guard files green** except 2 pre-existing `publish.yml` assertions |
| Mutations | **6** run individually — the plan's five, plus one proving 3.4's inversion is active rather than inert |
| New failures introduced | **zero** — proven by a built baseline run at `f1eadbc` |
| Commit | one scoped commit, un-pushed — see §8 |

### What changed

| File | Change |
| --- | --- |
| `__tests__/path-handling.test.ts` | `SCAN_DIRS` includes-`'apps'` → **excludes**; describe block rewritten to explain the inversion (3.1) |
| `__tests__/sbom.test.ts` | `jszip` / `react` presence → **absence**, each naming the deleted tree as the reason (3.2) |
| `__tests__/workflows.test.ts` | 4 assertions reading `pages.yml` / `pages-monitor.yml` → both files asserted **not to exist** (3.3) |
| `__tests__/audit-deps.test.ts` | 2 inert `existsSync`-guarded tests → **active** `extra-scans=none` assertions with no guard; `--scan=` fixture moved to a surviving dir (3.4) |
| `packages/arc-agi-3-chatgpt/__tests__/package.test.ts` | widget removed from `arrayContaining`; tarball asserted to carry **no** `public/` tree; `.harness/` policy files still asserted present (3.5) |
| `__tests__/no-ui-artifacts.test.ts` | **new** — the central invariant, derived from `git ls-files` (3.6) |
| `__tests__/healthcheck.test.ts` | 8 checks → **7**; `--check=pages` now asserted to take the unknown-check error path; a new assertion that `--probe-pages` is inert (3.8) |
| `__tests__/release.test.ts` | `--probe-pages` wiring assertions inverted at both ends — caller (`release.mjs`) and callee (`preflight.mjs`) (3.9) |
| `scripts/runner-coverage-allowlist.json` | one line for the new guard, same reason as the other root entries (3.16) |

**Not changed, deliberately:** `.github/workflows/publish.yml` and its two stale assertions — see §6.1.

---

## 2. What this task proves

1. **The removal is an enforced property, not a one-time edit.** Every UI-presence assertion now asserts absence, so a re-sync that restores the UI goes red instead of sliding in.
2. **No test file was deleted to reach green.** The only test files gone are the nine that lived inside the removed UI tree itself.
3. **Every guard actually fires.** Six mutations, each run individually with the unmutated guard green before and after.
4. **The one guard that could have been inert is not.** 3.4's inversion was mutated specifically to prove it goes red when a UI tree reappears — the failure mode the audit caught in its original form.
5. **This work introduced zero new failures.** A full root suite run at the pre-work commit, freshly built, produces an identical failing set.
6. **The suite's real state is now visible.** Running the root suite — which `npm test` never reaches — surfaced 16 pre-existing failing files that no runner has ever executed (#194).

---

## 3. The seven inverted guards

### 3.1 `path-handling.test.ts` — `SCAN_DIRS` excludes `'apps'` (3.1)

**Context.** iter 65 added `'apps'` to `SCAN_DIRS` so path-guard would cover the Studio; ADR-284 deleted that tree, making the entry dead configuration that implies coverage which no longer exists. Both tests in the block were kept: one asserts the entry stays out of the source, the other asserts the guard still runs green on the shrunken directory set and that its printed scan list no longer names `apps`.

```
 Test Files  1 passed (1)
      Tests  10 passed (10)
   Start at  02:37:37
   Duration  379ms (transform 19ms, setup 0ms, collect 16ms, tests 158ms, environment 0ms, prepare 51ms)
```

### 3.2 `sbom.test.ts` — UI-only packages are absent (3.2)

**Context.** `jszip` and `react` reached the SBOM only through `apps/web-ui`'s lockfile. With `EXTRA_LOCK_DIRS` emptied and the tree deleted, no surviving lockfile can supply them — so their reappearance means the SBOM is walking a restored UI lockfile again. The `dedupes packages` test was left untouched as instructed.

```
 Test Files  1 passed (1)
      Tests  14 passed (14)
   Start at  02:37:56
   Duration  541ms (transform 35ms, setup 0ms, collect 37ms, tests 255ms, environment 0ms, prepare 61ms)
```

### 3.3 `workflows.test.ts` — both Pages workflows are absent (3.3)

**Context.** The four assertions that *read* `pages.yml` and `pages-monitor.yml` became two existence assertions, each carrying a message that a restored workflow is a policy violation per ADR-284 and pointing at `FORK-RESYNC.md`. The adjacent `ci.yml` vertical-tour test was left untouched.

All four pages assertions pass. The file still reports 2 failures — both pre-existing `publish.yml` assertions, unrelated to this work and deliberately not touched (§6.1):

```
 ❯ __tests__/workflows.test.ts (10 tests | 2 failed) 14ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  __tests__/workflows.test.ts > .github/workflows/*.yml > publish.yml runs validate-gcp-secrets + publish-dryrun BEFORE any npm publish
 ❯ __tests__/workflows.test.ts:75:74
 FAIL  __tests__/workflows.test.ts > .github/workflows/*.yml > publish.yml publishes every host adapter package
 ❯ __tests__/workflows.test.ts:91:50
 Test Files  1 failed (1)
      Tests  2 failed | 8 passed (10)
```

### 3.4 `audit-deps.test.ts` — extra-scan discovery finds nothing (3.4)

**Context, and the point of this one.** The original pair of tests opened with `if (!existsSync(join(ROOT, 'apps', 'web-ui', 'package-lock.json'))) return;`. Once the tree was deleted they returned immediately and **reported green while asserting nothing** — the vacuous-pass finding from Unit 2.

The inversion therefore carries **no existence guard at all**. It asserts positively that a default run reports `extra-scans=none` and that no `apps/web-ui` string appears in the output. An inert guard is worse than no guard, so this file's falsifiability is demonstrated separately in §5.6 rather than assumed.

```
 ✓ __tests__/audit-deps.test.ts > scripts/audit-deps.mjs > the script exists
 ✓ __tests__/audit-deps.test.ts > scripts/audit-deps.mjs > exits 2 (tooling) on unknown --level
 ✓ __tests__/audit-deps.test.ts > scripts/audit-deps.mjs > honors --skip-npm + --skip-cargo (returns 0 with both skipped)
 ✓ __tests__/audit-deps.test.ts > scripts/audit-deps.mjs > echoes the configured level
 ✓ __tests__/audit-deps.test.ts > scripts/audit-deps.mjs > default level is `high`
 ✓ __tests__/audit-deps.test.ts > scripts/audit-deps.mjs > runs real npm audit against the workspace and reports 0 advisories at high+ 882ms
 ✓ __tests__/audit-deps.test.ts > scripts/audit-deps.mjs > auto-discovers NO extra scan target — the UI tree is gone (ADR-284)
 ✓ __tests__/audit-deps.test.ts > scripts/audit-deps.mjs > --skip-extra disables auto-discovery
 ✓ __tests__/audit-deps.test.ts > scripts/audit-deps.mjs > --scan=<dir> is recognized + reported in INFO
 ✓ __tests__/audit-deps.test.ts > scripts/audit-deps.mjs > unknown --scan=<dir> produces a SKIP, not a crash
 ✓ __tests__/audit-deps.test.ts > scripts/audit-deps.mjs > a real npm audit yields no apps/web-ui scan (ADR-284) 690ms
 ✓ __tests__/audit-deps.test.ts > scripts/audit-deps.mjs > --strict-tooling fails when cargo-audit not installed (we don't test installed because environment varies)
 Test Files  1 passed (1)
      Tests  12 passed (12)
```

### 3.5 `package.test.ts` — the packaged artifact carries no rendered surface (3.5)

**Context.** `public/arc-widget.html` was removed from the `arrayContaining` list and replaced with two absence assertions: the widget path specifically, and — since `"public/**"` left the package's `files` in Unit 2 — that the tarball ships no `public/` tree at all. The two `.harness/` policy files remain asserted present: the removal narrows what ships, it does not drop the declarations describing what the server may do.

```
 Test Files  1 passed (1)
      Tests  4 passed (4)
   Start at  02:40:05
   Duration  538ms (transform 22ms, setup 0ms, collect 17ms, tests 301ms, environment 0ms, prepare 55ms)
```

### 3.6 `no-ui-artifacts.test.ts` — the central invariant (3.6)

**Context.** Every other guard pins one *consequence* of the removal. This one pins the removal itself: no tracked path may match a UI artifact pattern, derived from `git ls-files` so it sees what the repository actually carries rather than what any script happens to look at.

Two design choices worth noting for a reviewer:

- Each pattern is paired with a plain-language description, and the failure message **names the offending paths**, so a re-sync reads the violation directly instead of going hunting.
- The first test asserts `git ls-files` returned more than 100 paths. Without it, a `git ls-files` that failed or returned nothing would make every other assertion pass vacuously — which is exactly the failure mode the audit caught in `audit-deps.test.ts`. The guard checks that it is actually looking before it checks what it sees.

```
 ✓ __tests__/no-ui-artifacts.test.ts > ADR-284 — no UI artifact is tracked in this repository > git ls-files returns a non-empty list (the guard is actually looking)
 ✓ __tests__/no-ui-artifacts.test.ts > ADR-284 — no UI artifact is tracked in this repository > tracks no path matching /^apps\/web-ui\// (the Agent Harness Studio SPA)
 ✓ __tests__/no-ui-artifacts.test.ts > ADR-284 — no UI artifact is tracked in this repository > tracks no path matching /^docs\/web-ui\// (the Studio's screenshot record)
 ✓ __tests__/no-ui-artifacts.test.ts > ADR-284 — no UI artifact is tracked in this repository > tracks no path matching /^__tests__\/browser-smoke\// (the manual browser-smoke fixture)
 ✓ __tests__/no-ui-artifacts.test.ts > ADR-284 — no UI artifact is tracked in this repository > tracks no path matching /arc-widget\.html$/ (the ARC MCP Apps widget)
 ✓ __tests__/no-ui-artifacts.test.ts > ADR-284 — no UI artifact is tracked in this repository > tracks no path matching /^\.github\/workflows\/pages.*\.yml$/ (a GitHub Pages workflow)
 ✓ __tests__/no-ui-artifacts.test.ts > ADR-284 — no UI artifact is tracked in this repository > tracks none of them, taken together (the whole-removal assertion)
 Test Files  1 passed (1)
      Tests  7 passed (7)
```

### 3.7 The five files together (3.7)

```
 ✓ __tests__/no-ui-artifacts.test.ts (7 tests) 26ms
 ❯ __tests__/workflows.test.ts (10 tests | 2 failed) 32ms
 ✓ __tests__/path-handling.test.ts (10 tests) 211ms
 ✓ __tests__/sbom.test.ts (14 tests) 228ms
 ✓ __tests__/audit-deps.test.ts (12 tests) 1447ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  __tests__/workflows.test.ts > .github/workflows/*.yml > publish.yml runs validate-gcp-secrets + publish-dryrun BEFORE any npm publish
 ❯ __tests__/workflows.test.ts:75:74
 FAIL  __tests__/workflows.test.ts > .github/workflows/*.yml > publish.yml publishes every host adapter package
 ❯ __tests__/workflows.test.ts:91:50
 Test Files  1 failed | 4 passed (5)
      Tests  2 failed | 51 passed (53)
```

Four green; `workflows.test.ts` red only at the two pre-existing `publish.yml` assertions.

### 3.8 `healthcheck.test.ts` — 7 checks, no `pages` (3.8)

**Context.** Four edits, matching the sub-task: the `pages` name dropped from the expected list, the banner pattern and `toHaveLength` moved 8 → 7 (verified against `Object.keys(CHECKS)`, which now yields exactly `version, plugin, codex, workflows, pathguard, examples, catalogCount`), and the two `--check=pages` tests rewritten rather than deleted — they now assert that `--check=pages` takes the **unknown-check error path**, which keeps the flag's error handling covered while making the check's absence mechanical. A further assertion pins that `--probe-pages` is now inert. The "all checks pass" assertions were not weakened.

```
 Test Files  1 passed (1)
      Tests  11 passed (11)
   Start at  02:41:09
   Duration  708ms (transform 19ms, setup 0ms, collect 16ms, tests 447ms, environment 0ms, prepare 58ms)
```

### 3.9 `release.test.ts` — the probe wiring is gone at both ends (3.9)

**Context.** Inverted at caller and callee: `release.mjs` must still invoke preflight but must not mention `--probe-pages`, and `preflight.mjs` must contain neither the flag read nor the `healthcheck.mjs --probe-pages` delegation. The surrounding preflight-wiring assertions unrelated to the probe were kept.

```
 Test Files  1 passed (1)
      Tests  8 passed (8)
   Start at  02:41:33
   Duration  1.37s (transform 33ms, setup 0ms, collect 29ms, tests 1.05s, environment 0ms, prepare 89ms)
```

---

## 4. 3.16 — the new guard is a recorded decision, not silent rot

**Context.** `check-runner-coverage.mjs` fails CI on any test file no runner reaches unless it carries an allowlist entry *with a reason*. The new root guard needs one, exactly as `research-asset-paths.test.ts` did in 2.16. The check asked for: the count must move by exactly the number of new guards, and no pre-existing entry may be dropped.

```
$ python3 -c "… len(allowlist['tests']) …"
entries before: 57
entries after:  58
delta: 1 (must be exactly 1 — one new guard)

$ git diff --numstat scripts/runner-coverage-allowlist.json
1	0	scripts/runner-coverage-allowlist.json
$ git diff scripts/runner-coverage-allowlist.json | grep "^-" | grep -v "^---"
ZERO removed lines

root __tests__ entries: 47   (46 before this unit; 45 original + research-asset-paths from 2.16)
total entries: 58
all have non-empty reasons: True
new entry present: True
```

**+1 insertion, 0 deletions** — the count moved by exactly one, and no pre-existing entry was touched.

```
runner coverage:
  workspaces npm test visits : 45
  cargo workspace members    : 5
  test files not reached     : 58 (58 allowlisted)
  crates not reached         : 4

ok — every test is reached by a runner or allowlisted with a reason
```

---

## 5. Mutation evidence — six, each run individually

Each mutation was applied alone, the guard re-run, the failure recorded, then reverted and the guard re-run green. The mutations are proof, not commits: the tree was returned to its unmutated state and verified (§7).

### 5.1 Mutation (a) — re-create `apps/web-ui/package.json` (3.10)

Two assertions fire — the per-pattern one and the whole-removal one — and both name the offending path, which is the behaviour 3.6 was written for.

```
Failed Tests2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  __tests__/no-ui-artifacts.test.ts > ADR-284 — no UI artifact is tracked in this repository > tracks no path matching /^apps\/web-ui\// (the Agent Harness Studio SPA)
AssertionError: ADR-284 violation — 1 tracked path(s) match /^apps\/web-ui\// (the Agent Harness Studio SPA):
  apps/web-ui/package.json

This fork is CLI-only. The UI was permanently removed and must not be reinstated by an upstream re-sync. If a re-sync brought these back, delete them again per FORK-RESYNC.md rather than adjusting this test.: expected [ 'apps/web-ui/package.json' ] to deeply equal []

- Expected
+ Received

- Array []
+ Array [
+   "apps/web-ui/package.json",
+ ]

 ❯ __tests__/no-ui-artifacts.test.ts:63:9
     61|         + 'reinstated by an upstream re-sync. If a re-sync brought the…
     62|         + 'them again per FORK-RESYNC.md rather than adjusting this te…
     63|       ).toEqual([]);
       |         ^
     64|     });
     65|   }

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  __tests__/no-ui-artifacts.test.ts > ADR-284 — no UI artifact is tracked in this repository > tracks none of them, taken together (the whole-removal assertion)
AssertionError: ADR-284 violation — 1 UI artif
```

**Reverted:**

```
      Tests  7 passed (7)
   Start at  02:41:55
   Duration  233ms (transform 17ms, setup 0ms, collect 14ms, tests 12ms, environment 0ms, prepare 54ms)
```

### 5.2 Mutation (b) — restore `.github/workflows/pages.yml` from the pin (3.11)

Restored verbatim from `git show d5833dc:.github/workflows/pages.yml` (102 lines). The inverted `workflows.test.ts` assertion fires. Note the two `publish.yml` failures alongside it are the pre-existing pair, and their messages state the case for §6.1 precisely — `expected -1 to be greater than 0` means the searched string is simply not in the file.

```
 FAIL  __tests__/workflows.test.ts > .github/workflows/*.yml > publish.yml runs validate-gcp-secrets + publish-dryrun BEFORE any npm publish
AssertionError: `npm publish --provenance` not in publish.yml: expected -1 to be greater than 0
 FAIL  __tests__/workflows.test.ts > .github/workflows/*.yml > publish.yml publishes every host adapter package
AssertionError: publish.yml missing host-claude-code: expected '# --- kozure/icm-metaharness fork ---…' to match /host-claude-code/
 FAIL  __tests__/workflows.test.ts > .github/workflows/*.yml > pages.yml does not exist — the Pages deploy is retired (ADR-284)
AssertionError: .github/workflows/pages.yml is back. ADR-284 permanently removed the Studio SPA and both Pages workflows; restoring either is a policy violation. If an upstream re-sync reintroduced it, delete it again per FORK-RESYNC.md rather than re-enabling the deploy.: expected true to be false // Object.is equality
```

**It also trips the central invariant** once the restored workflow is tracked — two independent guards catch the same re-sync:

```
     → ADR-284 violation — 1 tracked path(s) match /^\.github\/workflows\/pages.*\.yml$/ (a GitHub Pages workflow):
     → ADR-284 violation — 1 UI artifact path(s) are tracked:
 FAIL  __tests__/no-ui-artifacts.test.ts > ADR-284 — no UI artifact is tracked in this repository > tracks no path matching /^\.github\/workflows\/pages.*\.yml$/ (a GitHub Pages workflow)
AssertionError: ADR-284 violation — 1 tracked path(s) match /^\.github\/workflows\/pages.*\.yml$/ (a GitHub Pages workflow):
 FAIL  __tests__/no-ui-artifacts.test.ts > ADR-284 — no UI artifact is tracked in this repository > tracks none of them, taken together (the whole-removal assertion)
AssertionError: ADR-284 violation — 1 UI artifact path(s) are tracked:
     72|       `ADR-284 violation — ${offenders.length} UI artifact path
```

**Reverted** (the residual 2 are the pre-existing `publish.yml` pair):

```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  __tests__/workflows.test.ts > .github/workflows/*.yml > publish.yml runs validate-gcp-secrets + publish-dryrun BEFORE any npm publish
 FAIL  __tests__/workflows.test.ts > .github/workflows/*.yml > publish.yml publishes every host adapter package
 Test Files  1 failed | 1 passed (2)
      Tests  2 failed | 15 passed (17)
```

### 5.3 Mutation (c) — re-add `'apps'` to `SCAN_DIRS` (3.12)

Both tests in the block fire: the source assertion, and the live-run assertion that path-guard's printed scan list no longer names `apps`.

```
 FAIL  __tests__/path-handling.test.ts > scripts/path-guard.mjs no longer scans apps (ADR-284) > SCAN_DIRS does NOT include apps — the UI tree is gone (ADR-284)
AssertionError: scripts/path-guard.mjs re-added 'apps' to SCAN_DIRS. ADR-284 removed apps/web-ui and the fork is CLI-only, so a restored entry means either the UI tree came back in an upstream re-sync or the retirement was reverted.: expected '#!/usr/bin/env node\n// SPDX-License-…' not to match /SCAN_DIRS\s*=\s*\[[^\]]*'apps'/
 FAIL  __tests__/path-handling.test.ts > scripts/path-guard.mjs no longer scans apps (ADR-284) > runs green on the live repo with apps retired
AssertionError: path-guard still reports apps in its scanned dir list: expected 'path-guard: clean (scanned packages, …' not to match /scanned[^)]*\bapps\b/
```

**Reverted:**

```
      Tests  10 passed (10)
   Start at  02:42:25
   Duration  444ms (transform 22ms, setup 0ms, collect 17ms, tests 224ms, environment 0ms, prepare 55ms)
```

### 5.4 Mutation (d) — re-add the `pages` check to `CHECKS` (3.13)

All four inverted assertions fire: the banner count, the JSON `results` length, the unknown-check path, and the `--probe-pages` inertness assertion.

```
 FAIL  __tests__/healthcheck.test.ts > scripts/healthcheck.mjs > runs all 7 checks by default (ADR-284 retired the pages probe)
AssertionError: expected 'healthcheck — 8 checks\n  PASS versio…' to match /healthcheck — 7 checks/
 FAIL  __tests__/healthcheck.test.ts > scripts/healthcheck.mjs > --json emits parseable JSON with results array + ok boolean
AssertionError: expected [ { name: 'version', …(2) }, …(7) ] to have a length of 7 but got 8
 FAIL  __tests__/healthcheck.test.ts > scripts/healthcheck.mjs > --check=pages is now an UNKNOWN check, not a SKIP (ADR-284)
AssertionError: healthcheck still knows a `pages` check. ADR-284 removed it along with STUDIO_URL and --probe-pages; if it resolves, the dead Studio probe is back.: expected +0 to be 1 // Object.is equality
 FAIL  __tests__/healthcheck.test.ts > scripts/healthcheck.mjs > healthcheck no longer accepts --probe-pages (ADR-284)
AssertionError: expected 'healthcheck — 8 checks\n  PASS versio…' to match /healthcheck — 7 checks/
```

**Reverted:**

```
      Tests  11 passed (11)
   Start at  02:42:39
   Duration  664ms (transform 20ms, setup 0ms, collect 15ms, tests 431ms, environment 0ms, prepare 39ms)
```

### 5.5 Mutation (e) — restore the `--probe-pages` wiring in `preflight.mjs` (3.14)

```
 FAIL  __tests__/release.test.ts > scripts/release.mjs > preflight.mjs no longer honors --probe-pages (ADR-284)
AssertionError: preflight.mjs reads the --probe-pages flag again (ADR-284 removed it).: expected '#!/usr/bin/env node\n// SPDX-License-…' not to match /probePages\s*=\s*args\.has\('--probe-…/
```

**Reverted:**

```
      Tests  8 passed (8)
   Start at  02:42:47
   Duration  835ms (transform 18ms, setup 0ms, collect 16ms, tests 600ms, environment 0ms, prepare 36ms)
```

### 5.6 Extra mutation — proving 3.4's inversion is ACTIVE, not inert

**Why this one exists.** The audit's finding was that `audit-deps.test.ts` reported green while asserting nothing. An inversion that stayed guarded by `existsSync` would inherit exactly that defect and pass this unit while guarding nothing. So the inverted form was mutated the same way a real regression would arrive: **re-create `apps/web-ui/package-lock.json` and restore `'apps/web-ui'` to `discoverExtraScans()`'s `known` list.**

Both inverted assertions go red:

```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  __tests__/audit-deps.test.ts > scripts/audit-deps.mjs > auto-discovers NO extra scan target — the UI tree is gone (ADR-284)
AssertionError: audit-deps auto-discovered an extra scan target. ADR-284 emptied the `known` list in discoverExtraScans() because apps/web-ui was its only entry; a discovered target means a non-workspace lockfile tree is back.: expected '[audit-deps] INFO: level=high include…' to match /extra-scans=none/
 FAIL  __tests__/audit-deps.test.ts > scripts/audit-deps.mjs > a real npm audit yields no apps/web-ui scan (ADR-284)
AssertionError: audit-deps produced an apps/web-ui scan line. The tree ADR-284 deleted is being audited again, which means it is back on disk.: expected '[audit-deps] INFO: level=high include…' not to match /apps\/web-ui/web-ui
 Test Files  1 failed (1)
      Tests  2 failed | 10 passed (12)
```

**Reverted:**

```
      Tests  12 passed (12)
   Start at  02:39:48
   Duration  1.75s (transform 23ms, setup 0ms, collect 20ms, tests 1.49s, environment 0ms, prepare 52ms)
```

This is the evidence that 3.4 counts.

---

## 6. Discoveries and deviations

### 6.1 The two `publish.yml` assertions — characterized, deliberately NOT fixed

These were flagged in Unit 2 as pre-existing. Here is the exact characterization requested, with `publish.yml` left untouched.

**What the test asserts vs what the file contains:**

```
$ for t in …; do printf "%-28s %s\n" "$t" "$(grep -c -- "$t" .github/workflows/publish.yml)"; done
validate-gcp-secrets.mjs     3
publish-dryrun.mjs           1
npm publish --provenance     0      <-- asserted to exist
marketplace-entry.mjs        1
host-claude-code             0      <-- asserted to exist
host-codex                   0      <-- asserted to exist
host-pi-dev                  0      <-- asserted to exist
host-hermes                  0      <-- asserted to exist
host-openclaw                0      <-- asserted to exist
host-rvm                     0      <-- asserted to exist
```

**Which is wrong — the assertion or the workflow?** **The assertion.** Commit `87b6c51` (`fix(ci): make publish.yml idempotent — skip already-published versions (#153)`) replaced five sequential `npm publish --provenance` steps and the per-host-package publish steps with a single call:

```
      - name: Publish workspace packages (idempotent — skips already-published versions)
        # One script instead of five sequential `npm publish` steps. The old
        # sequence had no skip-if-published logic, so a tag re-run 403'd on
        # the first package whose version was already live …
        run: node scripts/publish-workspace.mjs
```

The six host adapters did not stop being published — they moved into `scripts/publish-workspace.mjs`, which lists all six plus `host-prime-agent`:

```
$ grep -n "host-" scripts/publish-workspace.mjs
35:  'host-claude-code',
36:  'host-codex',
37:  'host-pi-dev',
38:  'host-hermes',
39:  'host-openclaw',
40:  'host-rvm',
41:  'host-prime-agent',
```

So the workflow is correct — arguably better than what the test pins — and the test's *textual probe* is stale by one refactor. Both gates it genuinely cares about (`validate-gcp-secrets.mjs`, `publish-dryrun.mjs`) are present and do run before the publish step.

**Why nobody has seen it:** `publish.yml` is a root-suite test, and the root suite has no CI runner (#194). It has been latent since `87b6c51`.

**Disposition:** `publish.yml` untouched, both assertions untouched, surfaced as a discovery. Fixing them is a separate decision — it is not UI work, and folding it into this unit to reach a green summary is precisely what was ruled out. The fix, when someone takes it, is to repoint the assertions at `scripts/publish-workspace.mjs`'s `RELEASE_ORDER` (note `__tests__/publish-workspace.test.ts` already fails for a related reason — its own stale expectation about "the package set publish.yml shipped as individual steps").

### 6.2 3.15 — both commands, and what each reaches

Per R8–R12, 3.15 runs the root invocation, with `npm test` recorded alongside for contrast.

**(a) Root `npx vitest run`** — reaches all seven guards:

```
⎯⎯⎯⎯⎯⎯ Failed Tests 33 ⎯⎯⎯⎯⎯⎯⎯
 Test Files  16 failed | 301 passed | 5 skipped (322)
      Tests  33 failed | 3109 passed | 61 skipped (3203)
```

**(b) `npm test`** — the workspace fan-out. It reaches exactly one of the seven, and that one is green:

```
$ npm test
@metaharness/arc-agi-3-chatgpt@0.1.0 :: Test Files  7 passed (7)
```

Its two failing workspaces (`agntcy` 1, `darwin-mode` 5) are the pre-existing ones enumerated in Unit 2 §5.5 and re-confirmed in §6.3 below.

### 6.3 Zero new failures — proven against a built baseline

**Why this was necessary.** The root run surfaces 16 failing files, most in areas this work never touched. Unit 2's structural argument (untouched packages, untouched `node_modules`) covered `darwin-mode` and `agntcy`, but the root suite includes files that exercise the **built CLI** — and Unit 1 narrowed `manifest.surface`, which `harness diag` reads. That deserved a real baseline, not an inference.

A worktree was created at the pre-work commit `f1eadbc`, given the same `node_modules`, and **fully built** (a first, unbuilt attempt was discarded — it skipped 38 tests for lack of `dist/`, which would have been a misleading baseline). The full root suite was then run there and compared file by file:

```
BASELINE f1eadbc (built):  Test Files  17 failed | 297 passed | 5 skipped (319)
                                Tests  34 failed | 3092 passed | 61 skipped (3187)
HEAD:                      Test Files  16 failed | 301 passed | 5 skipped (322)
                                Tests  33 failed | 3109 passed | 61 skipped (3203)
```

```
file                                                            BASE  HEAD  verdict
--------------------------------------------------------------------------------------------
__tests__/adr-index.test.ts                                        1     1  pre-existing (identical)
__tests__/claude-marketplace-plugin.test.ts                        2     2  pre-existing (identical)
__tests__/e2e-lifecycle.test.ts                                    1     1  pre-existing (identical)
__tests__/e2e-scaffold-validate.test.ts                            1     1  pre-existing (identical)
__tests__/examples-quickstart.test.ts                              1     1  pre-existing (identical)
__tests__/harness-diag.test.ts                                     7     7  pre-existing (identical)
__tests__/harness-score.test.ts                                    2     2  pre-existing (identical)
__tests__/metaharness-subcommands.test.ts                          1     1  pre-existing (identical)
__tests__/publish-workspace.test.ts                                1     1  pre-existing (identical)
__tests__/upgrade-cmd.test.ts                                      1     1  pre-existing (identical)
__tests__/workflows.test.ts                                        2     2  pre-existing (identical)
packages/arc-agi-3-bench/__tests__/runner.test.ts                  1     1  pre-existing (identical)
packages/darwin-mode/__tests__/e2e/evolve-bench.e2e.test.ts        1     1  pre-existing (identical)
packages/darwin-mode/__tests__/e2e/evolve.e2e.test.ts              7     7  pre-existing (identical)
packages/darwin-mode/__tests__/e2e/reproducibility.e2e.test.ts     1     0  flake — passed at HEAD
packages/darwin-mode/__tests__/e2e/safety-invariant.e2e.test.ts    4     4  pre-existing (identical)
__tests__/agent-harness-generator-lib.test.ts                 (0 test) (0 test)  empty file, both
```

**Every failing file at HEAD fails identically at the pre-work baseline.** The single difference is `reproducibility.e2e.test.ts`, a timing flake that happened to pass at HEAD — not a fix.

The three files that most needed checking, because they exercise the built CLI that Unit 1 touched, were run separately at the built baseline and reproduce exactly:

```
PRE-WORK baseline (built), the three CLI-exercising files:
 ❯ __tests__/metaharness-subcommands.test.ts (7 tests | 1 failed)
 ❯ __tests__/harness-score.test.ts           (8 tests | 2 failed)
 ❯ __tests__/harness-diag.test.ts            (23 tests | 7 failed)

signatures, identical to HEAD:
  TypeError: Cannot read properties of undefined (reading 'native')
  AssertionError: expected '0.1.3' to be '0.1.0'
  AssertionError: expected [ 'mcpRisk', …(5) ] to deeply equal [ 'mcpRisk', …(4) ]   (a `schema` badge the test predates)
  AssertionError: expected +0 to be 2
```

None mentions `surface`, `web-ui`, `apps`, or `pages`. **The `manifest.surface` narrowing broke nothing.**

### 6.4 The real finding behind 3.15: #194 is larger than a note

The corrected 3.15 says the root suite has no CI runner and calls it a pre-existing upstream gap. Running it reveals the size of that gap: **16 failing files and 33 failing assertions that no runner has ever executed**, including a CI-workflow contract test that has been wrong since `87b6c51`. This work did not cause any of it and does not fix it, but it is now measured rather than assumed. The eight ADR-284 guards this unit adds are in the same unreached suite — which is exactly why 3.16's allowlist entry matters: it is the only thing recording that the guards are unreached *by decision* rather than by rot.

### 6.5 No test file was deleted to reach green

```
$ git diff --diff-filter=D --name-only f1eadbc -- '*.test.ts' '*.spec.ts'
apps/web-ui/e2e/generator.spec.ts
apps/web-ui/src/components/__tests__/host-guide.test.ts
apps/web-ui/src/generator/__tests__/artifacts.test.ts
apps/web-ui/src/generator/__tests__/embeddings.test.ts
apps/web-ui/src/generator/__tests__/mcp.test.ts
apps/web-ui/src/generator/__tests__/render.test.ts
apps/web-ui/src/generator/__tests__/repo.test.ts
apps/web-ui/src/generator/__tests__/scaffold.test.ts
apps/web-ui/src/generator/__tests__/verify.test.ts

$ … | grep -v "^apps/web-ui/"
ZERO test files deleted outside the removed UI tree
```

Every deleted test file lived **inside** the removed UI tree and tested the UI itself. Every inverted site kept its file; each either changed an assertion or replaced a now-meaningless one.

---

## 7. Final state — all guards, one run

```
 ❯ __tests__/workflows.test.ts (10 tests | 2 failed) 46ms
 ✓ __tests__/path-handling.test.ts (10 tests) 249ms
 ✓ __tests__/sbom.test.ts (14 tests) 368ms
 ✓ __tests__/no-ui-artifacts.test.ts (7 tests) 41ms
 ✓ __tests__/research-asset-paths.test.ts (3 tests) 23ms
 ✓ packages/arc-agi-3-chatgpt/__tests__/package.test.ts (4 tests) 806ms
 ✓ packages/arc-agi-3-chatgpt/__tests__/no-ui-surface.test.ts (4 tests) 227ms
 ✓ __tests__/release.test.ts (8 tests) 1294ms
 ✓ __tests__/healthcheck.test.ts (11 tests) 977ms
 ✓ __tests__/audit-deps.test.ts (12 tests) 2163ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  __tests__/workflows.test.ts > .github/workflows/*.yml > publish.yml runs validate-gcp-secrets + publish-dryrun BEFORE any npm publish
 ❯ __tests__/workflows.test.ts:75:74
 FAIL  __tests__/workflows.test.ts > .github/workflows/*.yml > publish.yml publishes every host adapter package
 ❯ __tests__/workflows.test.ts:91:50
 Test Files  1 failed | 9 passed (10)
      Tests  2 failed | 81 passed (83)
```

Ten guard files: nine fully green, `workflows.test.ts` red only at the two pre-existing `publish.yml` assertions of §6.1. `git status` is clean of mutation residue.

---

## 8. Sub-task ledger

| Sub-task | State | Evidence |
| --- | --- | --- |
| 3.1 invert `path-handling.test.ts` | done | §3.1; mutation §5.3 |
| 3.2 invert `sbom.test.ts` | done | §3.2 |
| 3.3 invert `workflows.test.ts` | done | §3.3; mutation §5.2 |
| 3.4 invert `audit-deps.test.ts` | done | §3.4; **activeness proven** §5.6 |
| 3.5 invert `package.test.ts` | done | §3.5 |
| 3.6 add `no-ui-artifacts.test.ts` | done | §3.6; mutation §5.1 |
| 3.7 run the five files | done | §3.7 |
| 3.8 invert `healthcheck.test.ts` | done | §3.8; mutation §5.4 |
| 3.9 invert `release.test.ts` | done | §3.9; mutation §5.5 |
| 3.10 mutation (a) | done | §5.1 |
| 3.11 mutation (b) | done | §5.2 |
| 3.12 mutation (c) | done | §5.3 |
| 3.13 mutation (d) | done | §5.4 |
| 3.14 mutation (e) | done | §5.5 |
| 3.15 root run + `npm test`, no file deleted | done | §6.2, §6.3, §6.5 |
| 3.16 allowlist entry + coverage gate | done | §4 |
| 3.17 commit 3.0 | done | §9 |

---

## 9. Commit

Sub-task 3.17 landed as one scoped conventional commit:

```
test(ui): invert UI-presence assertions to absence guards
```

The six mutation runs are proof, not commits — the tree was left clean.

A commit cannot record its own hash; read it back with:

```
$ git log --oneline -1 -- docs/specs/01-spec-remove-ui-components/01-proofs/01-task-03-proofs.md
```

**Left un-pushed** per sub-task 4.18. No `git push` was run at any point.
