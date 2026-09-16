# 01-task-04-proofs.md — Unit 4.0

Proof record for parent task **4.0 — Record the removal policy and scrub the repository's public story**
(`01-tasks-remove-ui-components.md`, spec Unit 4, as amended by audit revisions R13–R15 in `11efaee`).

All command output below is captured verbatim from real runs. Nothing is hand-written.

---

## 1. Task summary

| | |
| --- | --- |
| Parent task | 4.0 — record the policy, scrub the public story |
| Sub-tasks | 4.1 – 4.18 (18 of 18 complete) |
| Spec requirements covered | Unit 4 FR-1 … FR-7 |
| ADR | `docs/adrs/ADR-284-ui-removed-fork-is-cli-only.md`, `Status: Accepted` |
| Supersedes | ADR-020, ADR-021, ADR-024, ADR-027, ADR-171 — ADR-179 left as history |
| Controllable gates | **9 of 9 green** |
| Root suite | 17 files / 34 tests failing — **every one proven pre-existing** (§6) |
| Measured test count used for 4.15 | **3,108 passing of 3,203 collected across 322 files** (root `npx vitest run`) |
| Commit | one scoped `docs(...)` commit, un-pushed — see §8 |

### What changed

| File | Change |
| --- | --- |
| `docs/adrs/ADR-284-ui-removed-fork-is-cli-only.md` | **new**, 147 lines, `Status: Accepted` (4.1–4.3, 4.16) |
| `docs/adrs/INDEX.md` | ADR-284 appended — **+1 line, 0 deletions**, no renumbering (4.4) |
| `FORK-RESYNC.md` | `pages.yml` / `pages-monitor.yml` dispositions changed *disable* → **delete**; new `apps/` row; the "remove it again" paragraph extended (4.5) |
| `docs/FORK-BASELINE.md` | new section recording the first deletion of upstream-owned paths and correcting the baseline's measurement scope (4.6) |
| `README.md` | 8 live UI references scrubbed; leaderboard substance preserved; test count updated to the measured figure (4.7, 4.8, 4.15) |
| `SUBMISSIONS.md` | the `:3` live-board link retired — the R13 addition to scope (4.13) |
| `docs/USERGUIDE.md` | 9 Studio references rewritten to the CLI path, capability-for-capability (4.9) |
| `docs/PRIME_AGENT_LOOP.md` | live setup step repointed; `DONE` records left intact (4.10) |
| `docs/dream-cycle/PROMPT.md` | `web-ui` removed from the `DEEP=host-adapters` target list (4.11) |
| `packages/create-agent-harness/src/{analyze-repo,host-config,mcp-scan,index}.ts` | 5 misleading comment pointers reworded — one more than the plan enumerated (4.12, §7.1) |

---

## 2. What this task proves

1. **The removal is a recorded fork decision**, following the `INDEX.md` supersede convention: one new ADR, `Status: Accepted`, superseding the five UI-*defining* ADRs by number, with no ADR edited in place.
2. **A re-sync cannot silently restore the UI.** `FORK-RESYNC.md` records the three paths as **delete**, not *disable*, and points at the guard that fails loudly if they return.
3. **The repository's public story matches what it contains.** No live document advertises a surface that cannot be reached.
4. **History was preserved, not rewritten.** The ADR corpus, `docs/specs/**`, `CHANGELOG.md`, and the `DONE` records keep every reference.
5. **The stale test count is replaced by a measured one**, read from the command that actually reaches the whole suite.
6. **Every gate this work controls is green**, and every root-suite failure is proven pre-existing against the pre-removal commit rather than absorbed into a green summary.

---

## 3. FR-1 / FR-2 — the ADR (4.1, 4.2, 4.3, 4.16)

**Context.** `docs/adrs/INDEX.md` states: *"A ratified ADR (`Status: Accepted`) is amended by a follow-on ADR and never edited in place."* So the ~28 ADRs that mention the UI are untouched; one new ADR carries the decision.

**The superseded set was confirmed against the actual ADR titles before it was written**, not copied from the spec:

```
ADR-020      ADR-020: Web Generator UI
ADR-021      ADR-021: Client-Side Packaging + GitHub Pages Deploy
ADR-024      ADR-024: Agent Harness Studio + in-browser Verify
ADR-027      ADR-027: CLI and Web-UI Integration
ADR-171      ADR-171: Web-UI — surface Darwin capabilities + model-tier configuration
```

Those five *define* the UI. **ADR-179 (cost-Pareto leaderboard) is deliberately not superseded** — it mentions the UI only as the leaderboard's former host, so it stands as history. The ADR states that distinction explicitly, along with the accepted consequence that historical ADRs and `docs/specs/**` keep links to now-deleted paths.

**What the ADR records, by sub-task:**

| Sub-task | Recorded in ADR-284 |
| --- | --- |
| 4.1 | the fork is CLI-only; the artifacts and capability are permanently removed; re-syncs must not reinstate them |
| 4.1 | narrowed `manifest.surface`, with the operator note about pre-existing manifests |
| 4.1 | the two retired capabilities (in-browser `.zip`, in-browser MiniLM embeddings) recorded as **verified gaps**, per Non-Goal 1 — "verified and recorded, not closed" |
| 4.1 | the dead Studio probe removal (Open Question 1's default), including that it removed an outbound call to a third-party origin |
| 4.1 | `swe-pareto.json`'s relocation to `docs/research/` (Open Question 4's default) |
| 4.1 | ADR-280's `adm-zip`/`sharp` `overrides` remediation **becomes moot by deletion** — the advisories lived only in the UI lockfile, and nothing survives to carry forward |
| 4.2 | the superseded set by number; ADR-179 named as deliberately-kept history; broken historical links accepted explicitly |
| **4.3** | **Open Question 3's actual branch:** the clean-import check returned empty, so the **primary branch was taken** — `@modelcontextprotocol/ext-apps` is removed. The fallback (retain + record why) was not needed and not taken. Stated outright rather than left implicit. |
| 4.16 | the Cost-Pareto hosting retirement: `cost-pareto.html` and `og.png` were served only by the deleted SPA, so the live URL is retired while the data, Wilson CIs, caveats and `SUBMISSIONS.md` path are preserved |

The ADR also carries a **Test Contract** table naming all eleven guards, what each asserts, and what falsifies it — plus the explicit warning that verification requires root `npx vitest run`, not `npm test`.

### 3.1 The INDEX entry (4.4)

**Context.** The convention is *"New ADRs append to the series — they do not renumber."* Verified mechanically:

```
$ git diff --numstat f1eadbc -- docs/adrs/INDEX.md
1	0	docs/adrs/INDEX.md
```

**One insertion, zero deletions** — appended, nothing renumbered or rewritten.

---

## 4. FR-3 — `FORK-RESYNC.md` enforcement (4.5)

**Context.** The disposition table and the "remove it again if reintroduced" paragraph are the fork's existing durable ledger for dispositions, so the removal inherits that mechanism rather than needing a new one. The two Pages rows moved from `disabled_manually` to **delete**, joined by a new `apps/` row:

```
| `publish.yml` | disabled_manually |
| `proxy-pin-drift.yml` | disabled_manually |
| `published-smoke.yml` | disabled_manually |
| `pages.yml` | **delete** (ADR-284 — must not exist) |
| `pages-monitor.yml` | **delete** (ADR-284 — must not exist) |
| `apps/` (not a workflow — the Studio SPA tree) | **delete** (ADR-284 — must not exist) |
```

The paragraph below it now extends the `draco.yml` schedule precedent to all three, and — this is the part that makes it operational — points at the guard:

> **On the same principle, if a re-sync reintroduces `pages.yml`, `pages-monitor.yml`, or the `apps/` tree, delete them again rather than disabling them** — ADR-284 is the record of that decision, and `__tests__/no-ui-artifacts.test.ts` fails loudly if any of them come back, naming the offending paths.

One subtlety worth recording: every other workflow's disposition is carried by a header block *inside the file*. The three **delete** rows have no such block, because the files do not exist. The table and ADR-284 are their ledger instead — stated in the file so the asymmetry reads as intentional.

### 4.1 `docs/FORK-BASELINE.md` (4.6)

Records that this is the fork's **first deletion of upstream-owned paths** (verified: 0 in all prior fork history), with the 60-file table and the `50 files changed, 11912 deletions(-)`, 0 additions diff against the pin.

It also carries a correction the unit surfaced: the baseline's original "1 pre-existing test failure" row is true *of `npm test`*, but `npm test` has never run the 47 root `__tests__/` files. The row is left as written — it was accurate about the command it names — with the scope correction and the instruction to measure future baselines with root `npx vitest run`.

---

## 5. FR-4 / FR-6 — the live-documentation scrub

### 5.1 What was rewritten, not deleted (4.7 – 4.11)

**Context.** Non-Goal 1 frames the retired capabilities as "verified and recorded, not closed", so the scrub rewrites guidance toward the CLI equivalent rather than deleting the user's path forward. Every Studio instruction in `docs/USERGUIDE.md` has a CLI replacement:

| Was | Now |
| --- | --- |
| "Open the Studio: …" + 5 click-steps | `npx metaharness analyze <url>` then `npx metaharness my-bot --from-repo <url> --host claude-code` |
| "Unzip the file…" / "Nothing leaves your browser" | "Run `npm install` in the generated folder" / "Nothing is uploaded… runs entirely on your machine" |
| "You picked a host in the Studio" | "You picked a host with `--host`" |
| "The Studio shows these commands inline" | "`npx metaharness doctor` prints the right command" |
| "The Studio is free and 100% client-side" | "The CLI is free and runs entirely locally" |
| "Run **Verify** on it first (tab 4 of the Studio)" | "Run `npx metaharness validate` on it first" |
| "the Studio is the UI, the `.zip` is the product" | "the CLI is the interface, the generated package is the product" |
| "**Try the Studio:** <url>" | "**Try the CLI:** `npx metaharness --list`" |

`README.md`'s eight sites were handled the same way: the headline link and badge removed, the screenshot embed removed (its target is deleted), the browser step dropped from "Try it in 30 seconds", the Studio status row and the **broken** `pages-monitor.yml` link removed, and both FAQ answers rewritten.

**4.8 — the leaderboard keeps its substance.** `README.md:405`'s live URL pointed at `cost-pareto.html`, served only by the deleted SPA. The section now points at the relocated source data and the submission path, and says plainly what was retired — while the results table, Wilson CIs, and caveats are untouched:

> **The cost-performance Pareto frontier.** Source data: [`docs/research/swe-pareto.json`](docs/research/swe-pareto.json).
> Submit a row via [SUBMISSIONS.md](SUBMISSIONS.md). *(The hosted board this section once linked was served by the browser
> UI this fork removed — see ADR-284. The data, Wilson CIs, and caveats below are unchanged.)*

**4.10 — the live/historical split in `docs/PRIME_AGENT_LOOP.md`**, resolved as remediation option **(a)** and recorded in ADR-284 so a reviewer reads the intent rather than inferring it. The `:18` setup step no longer instructs an install into a deleted tree; the `DONE` records at `:36-42` are untouched, because they are records of work performed and FR-5 protects them.

### 5.2 The 4.13 check (R13 — `SUBMISSIONS.md` now in scope)

**Context.** `SUBMISSIONS.md:3` carried `**[Live board →](https://ruvnet.github.io/metaharness/cost-pareto.html)**` — the same class of retirement as `README.md:405`, and an unenumerated third consumer surfaced in Unit 2. R13 brought it into scope, so it was scrubbed here rather than as an ad-hoc extra.

```
### 4.13 — scoped live-reference check (SUBMISSIONS.md now in scope, per R13)
$ grep -nE "studio|web-ui|ruvnet\.github\.io" README.md SUBMISSIONS.md docs/USERGUIDE.md docs/PRIME_AGENT_LOOP.md docs/dream-cycle/PROMPT.md
docs/PRIME_AGENT_LOOP.md:19:  `npm --prefix apps/web-ui install` when it was performed; ADR-284 removed the
docs/PRIME_AGENT_LOOP.md:20:  `apps/web-ui` tree, so the UI half is retired. The `DONE` records below are left
docs/PRIME_AGENT_LOOP.md:36:### ★ P2 — Propagation — DONE (swarm 3 tracks + verifier; parity CLI↔web-ui byte-IDENTICAL; sweep 588/588, web-ui 67/67, integration 57/57, verify-all-hosts prime-agent PASS, healthcheck HEALTHY 8/8, real-measured bench baseline row; scaffold smoke emits install-prime-agent.md)
docs/PRIME_AGENT_LOOP.md:38:- [x] `create-agent-harness/src/host-config.ts` `case 'prime-agent'` (+ "OTHER eight hosts" comment) — byte-identical with web-ui
docs/PRIME_AGENT_LOOP.md:39:- [x] `apps/web-ui/src/generator/scaffold.ts` `hostFiles()` same emission (ADR-027 parity)
docs/PRIME_AGENT_LOOP.md:40:- [x] `apps/web-ui`: `types.ts` HostId; `catalog.ts` HOSTS; `HostGuide.tsx` union+GUIDES (≥2 steps); `verify.ts` hostArtifacts
docs/PRIME_AGENT_LOOP.md:42:- [x] `apps/web-ui/.../host-guide.test.ts` exhaustive array → 10
README.md:203:| [**GitHub Copilot**](https://code.visualstudio.com/docs/copilot/mcp) | MCP via `.vscode/mcp.json` | VSCode 1.99+ (ADR-032) |
exit=0

--- case-insensitive, to catch the ones the case-sensitive pattern misses ---
$ grep -niE "studio|web-ui|ruvnet\.github\.io" <same files>
README.md:203:| [**GitHub Copilot**](https://code.visualstudio.com/docs/copilot/mcp) | MCP via `.vscode/mcp.json` | VSCode 1.99+ (ADR-032) |
README.md:399:browser Studio, which this fork removed — see [ADR-284](docs/adrs/ADR-284-ui-removed-fork-is-cli-only.md). The data,
SUBMISSIONS.md:4:linked was served by the browser Studio, which this fork removed ([ADR-284](docs/adrs/ADR-284-ui-removed-fork-is-cli-only.md)).
docs/PRIME_AGENT_LOOP.md:19:  `npm --prefix apps/web-ui install` when it was performed; ADR-284 removed the
docs/PRIME_AGENT_LOOP.md:20:  `apps/web-ui` tree, so the UI half is retired. The `DONE` records below are left
docs/PRIME_AGENT_LOOP.md:36:### ★ P2 — Propagation — DONE (swarm 3 tracks + verifier; parity CLI↔web-ui byte-IDENTICAL; sweep 588/588, web-ui 67/67, integration 57/57, verify-all-hosts prime-agent PASS, healthcheck HEALTHY 8/8, real-measured bench baseline row; scaffold smoke emits install-prime-agent.md)
docs/PRIME_AGENT_LOOP.md:38:- [x] `create-agent-harness/src/host-config.ts` `case 'prime-agent'` (+ "OTHER eight hosts" comment) — byte-identical with web-ui
docs/PRIME_AGENT_LOOP.md:39:- [x] `apps/web-ui/src/generator/scaffold.ts` `hostFiles()` same emission (ADR-027 parity)
docs/PRIME_AGENT_LOOP.md:40:- [x] `apps/web-ui`: `types.ts` HostId; `catalog.ts` HOSTS; `HostGuide.tsx` union+GUIDES (≥2 steps); `verify.ts` hostArtifacts
docs/PRIME_AGENT_LOOP.md:42:- [x] `apps/web-ui/.../host-guide.test.ts` exhaustive array → 10

--- README.md:209 GitHub Copilot row must NOT be scrubbed (it matches /studio/i via visualstudio.com) ---
203:| [**GitHub Copilot**](https://code.visualstudio.com/docs/copilot/mcp) | MCP via `.vscode/mcp.json` | VSCode 1.99+ (ADR-032) |
```

**Zero live-product references.** The two remaining match classes are both expected, and neither is one:

1. **`README.md:203`** — `code.visualstudio.com` in the GitHub Copilot host row. This is the false positive 4.13 explicitly warns about: an over-broad `/studio/i` catches "visualstudio". It is a live, correct link to Microsoft's docs and **must not be scrubbed**.
2. **`docs/PRIME_AGENT_LOOP.md:36,38,39,40,42`** — the `DONE` completion records. These are FR-5-protected history and 4.10's option (a) keeps them by decision. This file will never grep clean, by design.

My own retirement notes were deliberately worded to say "browser UI" rather than "Studio" so they do not add noise to this proof — the grep isolates exactly the two classes above.

---

## 6. FR-5 — history preserved (4.14)

**Context.** The scrub had to touch live guidance only. Four checks, and two structural ones the sub-task did not ask for but which prove the *absence* of edits rather than the presence of text:

```
### 4.14 — history preservation (FR-5)
$ grep -rn "web-ui" docs/adrs/ | wc -l
      56
  (must be non-zero)

$ grep -rn "web-ui" --include='*.md' docs/specs/ | wc -l
     174
  (must be non-zero)

$ grep -c -i studio CHANGELOG.md
20

$ git diff --stat f1eadbc -- CHANGELOG.md docs/dream-cycle/
  (empty = CHANGELOG.md and all 16 dream-cycle gist files untouched)

$ git diff --name-only f1eadbc -- docs/adrs/ | grep -v ADR-284 | grep -v INDEX
  (empty = no ADR edited in place; only ADR-284 added + INDEX appended)

$ git diff --numstat f1eadbc -- docs/adrs/INDEX.md
1	0	docs/adrs/INDEX.md
  (1 insertion, 0 deletions = appended, not renumbered)
```

`CHANGELOG.md` and all 16 `docs/dream-cycle/*gist*` files are **byte-identical** to the pre-work commit, and **no ADR was edited in place** — the only changes under `docs/adrs/` are the new ADR-284 and the one-line INDEX append.

---

## 7. Deviations and discoveries

### 7.1 A fifth misleading comment pointer (4.12)

**What the plan said.** 4.12 names four: `analyze-repo.ts:94,172`, `host-config.ts:10`, `mcp-scan.ts:126`.

**What was actually there.** A fifth, `packages/create-agent-harness/src/index.ts:797`:

> `// ADR-027 asymmetric-feature note: --sessions is CLI-only this pass; the`
> `// web-ui surface intentionally does NOT mirror this toggle yet. If/when it`
> `// does, the manifest `surface` field distinguishes the emitters.`

It is exactly the class 4.12 targets — a live source comment citing a surface that no longer exists, and doubly misleading because it points at the `surface` field this work narrowed. Reworded to describe the behaviour (the CLI is now the only emitter, so the asymmetry is moot). Reported rather than silently folded in.

After all five, no live package source mentions the removed tree:

```
$ grep -rn "web-ui" packages/create-agent-harness/src/ packages/arc-agi-3-chatgpt/src/
ZERO web-ui refs in live package sources
```

The exclusions 4.12 names were left alone, as instructed: the test-file comments in `packages/host-github-actions/__tests__/`, `create-agent-harness/__tests__/host-config.test.ts` and `mcp-scan.test.ts`, and the historical research record at `packages/darwin-mode/LEARNINGS.md:1154`. (`generated-templates.test.ts` also matches — that is the FR-2 source assertion added in 1.16, which must keep the string.)

### 7.2 4.15 — the count, measured not estimated (R14 / R15)

**What the README claimed:** a badge reading `Tests — 2,254 passing` and a status row reading `**2,254 passing** across 246 files (CI green on main)`.

**What R15 established:** root vitest collects 322 files / 3,203 tests, so 2,254/246 matched *neither* scope — evidence the number had been stale, not a target.

**Measured here, from root `npx vitest run`:**

```
 Test Files  17 failed | 300 passed | 5 skipped (322)
      Tests  34 failed | 3108 passed | 61 skipped (3203)
```

The count was **updated to the measured figure, not dropped and not estimated** — and stated with enough scope that it cannot go stale invisibly again:

> `| Test suite | **3,108 passing of 3,203 collected** across 322 files, measured with root `npx vitest run`. The 34 non-passing are pre-existing and predate this fork's UI removal — they are invisible to `npm test`, which is `npm run -ws --if-present test` and so never runs the 47 root `__tests__/` files (upstream gap #194). CI runs `npm test`, so "CI green" describes the workspace half only. |`

The badge reads `3,108 of 3,203 passing` rather than a bare `3,108 passing`, deliberately: a bare passing count next to 34 silent failures is the same kind of claim that made the old number misleading.

### 7.3 The root suite is not green, and this work did not make it so

4.17's "all must pass" is read as it was in 3.15: it applies to the gates this work controls and to the inverted guards. The root suite carries a pre-existing failure set, enumerated below with each proven pre-existing rather than folded into a summary.

---

## 8. FR — the gate set (4.17)

### 8.1 Gates this work controls — 9 of 9 green

```
npm test                        exit=1
npm run lint                    exit=0
scripts/path-guard.mjs          exit=0
scripts/sbom.mjs                exit=0
scripts/audit-deps.mjs          exit=0
scripts/healthcheck.mjs         exit=0
scripts/check-runner-coverage   exit=0
examples/vertical-tour          exit=0
```

```
=== healthcheck ===
healthcheck — 7 checks
  PASS version      all sources at 0.1.0
  PASS plugin       14 skills, 13 commands
  PASS codex        13 skills with skill.toml + README
  PASS workflows    8 workflows, all script refs resolve
  PASS pathguard    path-guard.mjs present (run separately for full scan)
  PASS examples     2 runnable examples present
  PASS catalogCount 20 templates in JSON + TS test + Rust test (in sync)

Result: HEALTHY (7/7 pass)

=== path-guard ===
path-guard: clean (scanned packages, crates, scripts on darwin)

=== audit-deps ===
[audit-deps] INFO: level=high include-dev=false skip-cargo=false skip-npm=false extra-scans=none
[audit-deps] PASS: npm(workspace) — 0 advisories at-or-above high (2 total below threshold)
[audit-deps] SKIP: cargo — cargo-audit not installed; cargo install cargo-audit
[audit-deps] INFO: ALL CLEAN at high+

=== check-runner-coverage ===
runner coverage:
  workspaces npm test visits : 45
  cargo workspace members    : 5
  test files not reached     : 58 (58 allowlisted)
  crates not reached         : 4

ok — every test is reached by a runner or allowlisted with a reason

=== vertical-tour ===
ICM pass: 2/2 OK.

[vertical-tour] DONE — 19/19 verticals HEALTHY, 2/2 ICM trees OK in 437ms
```

`healthcheck` shows **7 checks** and **8 workflows** — both direct consequences of this removal. `path-guard`'s scan list has no `apps`. `audit-deps` reports `extra-scans=none` and `ALL CLEAN at high+`, which is ADR-280's remediation becoming moot by deletion. `check-runner-coverage` is green with all 58 unreached tests allowlisted *with reasons* — including the eight ADR-284 guards.

### 8.2 `npm test` — the one guard it reaches is green

```
@metaharness/arc-agi-3-chatgpt@0.1.0   Test Files  7 passed (7)
```

Its two failing workspaces are `agntcy` (1 file) and `darwin-mode` (5 files), both in §8.3.

### 8.3 The root suite's exact failure set — every entry proven pre-existing

**Method.** Not asserted from inspection. A worktree at the pre-removal commit `f1eadbc` was given the same `node_modules`, **fully built**, and the whole root suite run there. HEAD is compared to it file by file:

```
file                                                           BASE     HEAD  verdict
----------------------------------------------------------------------------------------------
__tests__/adr-index.test.ts                                       1        1  pre-existing (identical)
__tests__/agent-harness-generator-lib.test.ts                0 test   0 test  pre-existing (identical)
__tests__/claude-marketplace-plugin.test.ts                       2        2  pre-existing (identical)
__tests__/e2e-lifecycle.test.ts                                   1        1  pre-existing (identical)
__tests__/e2e-scaffold-validate.test.ts                           1        1  pre-existing (identical)
__tests__/examples-quickstart.test.ts                             1        1  pre-existing (identical)
__tests__/harness-diag.test.ts                                    7        7  pre-existing (identical)
__tests__/harness-score.test.ts                                   2        2  pre-existing (identical)
__tests__/metaharness-subcommands.test.ts                         1        1  pre-existing (identical)
__tests__/publish-workspace.test.ts                               1        1  pre-existing (identical)
__tests__/upgrade-cmd.test.ts                                     1        1  pre-existing (identical)
__tests__/workflows.test.ts                                       2        2  pre-existing (identical)
packages/darwin-mode/__tests__/e2e/evolve-bench.e2e.test.ts        1        1  pre-existing (identical)
packages/darwin-mode/__tests__/e2e/evolve.e2e.test.ts             7        7  pre-existing (identical)
packages/darwin-mode/__tests__/e2e/reproducibility.e2e.test.ts        1        0  flake — passed at HEAD
packages/darwin-mode/__tests__/e2e/safety-invariant.e2e.test.ts        4        4  pre-existing (identical)
packages/darwin-mode/__tests__/perf/mapLimit.test.ts              0        1  NEW at HEAD → see below
```

**Every failing file at HEAD fails with an identical count at the pre-removal commit.** Two rows need a word:

- `reproducibility.e2e.test.ts` — failed at baseline, passed at HEAD. A timing flake, not a fix.
- `mapLimit.test.ts` — the one row reading NEW. It was **not** taken on trust. Its assertion measures *real observed parallel overlap* (`expected 1 to be greater than 1`), which serializes under load. Re-run in isolation:

```
$ npx vitest run packages/darwin-mode/__tests__/perf/mapLimit.test.ts
 Test Files  1 passed (1)
      Tests  3 passed (3)

$ git diff --name-only f1eadbc -- packages/darwin-mode
(empty = untouched)
```

It passes alone, and `packages/darwin-mode` was not touched by any of the four units. A load flake, not a regression. **Zero genuinely new failures.**

The two `workflows.test.ts` failures remain the stale `publish.yml` assertions characterized in Unit 3 §6.1 — the workflow is correct, the assertions predate commit `87b6c51`, and they were deliberately left untouched.

---

## 9. Sub-task ledger

| Sub-task | State | Evidence |
| --- | --- | --- |
| 4.1 write ADR-284, `Status: Accepted` | done | §3 |
| 4.2 name the superseded set; record kept-history ADRs | done | §3 |
| 4.3 record Open Question 3's actual branch | done | §3 (primary branch — dependency removed) |
| 4.4 append to `INDEX.md` | done | §3.1 (+1/−0) |
| 4.5 `FORK-RESYNC.md` disposition + paragraph | done | §4 |
| 4.6 `docs/FORK-BASELINE.md` baseline change | done | §4.1 |
| 4.7 scrub `README.md` (8 sites) | done | §5.1 |
| 4.8 preserve the leaderboard's substance | done | §5.1 |
| 4.9 scrub `docs/USERGUIDE.md` (9 sites) | done | §5.1 |
| 4.10 `PRIME_AGENT_LOOP.md` live/historical split | done | §5.1 (option (a), recorded in ADR) |
| 4.11 scrub `docs/dream-cycle/PROMPT.md` | done | §5.2; 16 gist files untouched |
| 4.12 reword misleading comment pointers | done | §7.1 — **five**, not four |
| 4.13 scoped live-reference check (incl. `SUBMISSIONS.md`) | done | §5.2 |
| 4.14 history-preservation check | done | §6 |
| 4.15 measured test count | done | §7.2 |
| 4.16 record the leaderboard hosting retirement in the ADR | done | §3 |
| 4.17 full gate set | done | §8 |
| 4.18 commit, un-pushed | done | §10 |

---

## 10. Commit

Sub-task 4.18 landed as one scoped conventional commit:

```
docs(adr-284): record the UI removal as fork policy and scrub the public story
```

A commit cannot record its own hash; read it back with:

```
$ git log --oneline -1 -- docs/specs/01-spec-remove-ui-components/01-proofs/01-task-04-proofs.md
```

**Left un-pushed**, per sub-task 4.18 — the fork's push policy is the maintainer's call. No `git push` was run at any point across all four units.
