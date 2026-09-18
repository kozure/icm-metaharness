# Spec 03 — Upgrade Fidelity: `harness upgrade` must reproduce what `scaffold` emitted

**Status:** DRAFT (Phase 1 — round 1 pending)
**Feature:** `create-agent-harness` CLI, `harness upgrade` subcommand
**Supersedes:** nothing. **Amends:** ADR-012 ("upgrade via `drift apply-template`") — its flow is preserved, its *input* is corrected
**Depends on:** Spec 01 (remove-ui-components) — COMPLETE; Spec 02 (icm-default-on) — COMPLETE
**Author:** alfred
**Date:** 2026-09-18

> **Provenance.** This spec exists because of a red test. `__tests__/upgrade-cmd.test.ts:44`
> asserts `upgrade` reports `No drift` on a *freshly scaffolded* harness and it fails — on
> a harness nothing has touched. The comment at `upgrade-cmd.ts:40-51` shows ICM-overlay
> drift was already found and fixed the same way; this is a *different* instance of the
> same class of defect, and the failure is the third symptom of one root cause.

---

## 1. Problem Statement

`scaffold()` and `upgrade` disagree about what a harness *is*.

`scaffold()` renders the template and then applies **six** post-render passes that
mutate the emitted file set — multi-host configs, the MIT license, Darwin Mode,
optional sessions, opt-in field memory, and headless answer substitution. Each is
recorded in an ADR or a GH issue, each is deliberate, and each exists *outside*
`templates/`.

`upgrade` re-renders the template and re-applies **one** of those six passes
(`field_memory`, `upgrade-cmd.ts:108-119`). It never applies the other five — and it
cannot apply the sixth even in principle, because the data that pass consumes is not
recorded anywhere (§3.6).

So `upgrade` computes its "expected" file map from a render that is *legitimately
different* from what `scaffold()` wrote, and reports that difference as drift. The
consequence is not cosmetic:

**`harness upgrade` reports drift on every harness it has ever created — including a
byte-for-byte untouched one — and `--apply` then damages it.**

Measured on a fresh, unmodified `vertical:coding` scaffold (2 hosts, `--sessions`),
`upgrade` (dry-run) reports `0 added / 5 removed / 2 clean-overwrite`, and `--apply`
takes the harness from:

```
BEFORE  license=MIT    darwin=yes   evolve=yes   hostdeps=host-claude-code+host-codex
AFTER   license=undefined  darwin=DROPPED  evolve=DROPPED  hostdeps=host-claude-code
```

That is silent, unrecoverable-in-place loss of the license field, the entire Darwin
Mode integration, and every secondary host dependency — with exit code **0** and the
line `Clean apply — no conflicts.` The five files reported as "removed" (`LICENSE`,
`.claude/skills/evolve/SKILL.md`, `src/sessions/log.ts`, `.codex/config.toml`,
`AGENTS.md`) are in fact **not** deleted — `applyPlan` (`upgrade.ts:127-159`) loops
over `plan.added` and `plan.changed` and never touches `plan.removed`. They are
**orphaned**: still on disk, dropped from the recomputed set. So the report is wrong
in both directions — it claims removals it does not perform, on files that were never
supposed to be removed.

### 1.1 The failure is not one bug — it is three, sharing a cause

| # | Symptom | Evidence |
|---|---|---|
| 1 | **Divergence** — `upgrade`'s expected set ≠ `scaffold`'s emitted set | 5 paths / 2 changed files on a clean multi-host harness (§3.1) |
| 2 | **Destruction** — `--apply` overwrites `package.json` with the un-injected render | `license`/`darwin`/`evolve`/host deps dropped (§3.2) |
| 3 | **Non-convergence** — the manifest is never rewritten, so drift is permanent and worsens | run 1 `0 conflict` → run 2 `2 conflict` → run 3 markers accumulate 1→2→… and `package.json` stops parsing as JSON (§3.3) |
| 4 | **Regression of the user's own answers** — `--apply` reverts resolved ICM content back to `{{PLACEHOLDERS}}` | `grep 'ship the thing'` 1 → **0** files; `grep '{{PROJECT_GOAL}}'` 0 → **1** file, at exit 0 (§3.6) |

Symptom 3 is what turns a bad report into a broken repository, and it follows directly
from symptom 1: because apply never updates `.harness/manifest.json`, every run re-diffs
against a set that can never match, so a *clean* apply makes the *next* run see the
newly-written file as locally diverged and start writing Git conflict markers into it.

Symptom 4 is the worst of the four and is **architecturally different in kind** — see
§3.6. It is not a missing pass; it is a missing *record*.

## 2. Goal

**`upgrade` on an untouched harness is a byte-exact no-op, and `--apply` converges.**

Concretely:

- Re-rendering a harness reproduces the set `scaffold()` would emit *today*, including
  every post-render pass — so an unmodified harness yields `No drift`.
- `--apply` writes only files that genuinely differ, and updates the manifest to the
  state it just wrote — so applying twice is identical to applying once.
- The "removed" concept is either made honest (named, and never silently destructive)
  or dropped. It must stop being a silent third thing.

**Non-goals:**

- Changing any template's content, or any post-render pass's behaviour.
- Changing the *scaffold* path's output (§3.4 — deliberate: the passes stay).
- Retro-fitting ICM or capability semantics (spec 02's territory).
- Giving the root test suite a runner (#194 — §5, tracked separately, though this spec
  is unusable without it).

## 3. Verified Current Behaviour

Measured against source at `9d69e37`, using the source-level API (`scaffold`,
`planUpgrade`, `upgradeCmd`) in a temp dir, not the docs.

### 3.1 The exact divergence — two configurations

| Case | manifest | bare re-render | `removed` | `changed` |
|---|---|---|---|---|
| `minimal`, 1 host | 12 | 10 | **2** — `.claude/skills/evolve/SKILL.md`, `LICENSE` | **1** — `package.json` |
| `vertical:coding`, 2 hosts, `--sessions` | 32 | 27 | **5** — `.claude/skills/evolve/SKILL.md`, `.codex/config.toml`, `AGENTS.md`, `LICENSE`, `src/sessions/log.ts` | **2** — `README.md`, `package.json` |

`added` is empty in both — the drift is entirely **scaffold-only content**, which is
the signature of the root cause. Every removed path maps to exactly one pass:

| Path | Pass that emits it | Recorded in | Condition |
|---|---|---|---|
| `LICENSE` (+ `package.json.license`) | license pass — `index.ts:844-867`; fn `mitLicense()` at `index.ts:737` | **GH #23** | always |
| `.claude/skills/evolve/SKILL.md` (+ darwin devDep/scripts) | darwin pass — `index.ts:871-895`; fn `darwinEvolveSkill()` at `index.ts:418` | **ADR-147** | `opts.darwin !== false` — **default ON** |
| `src/sessions/log.ts` (+ README note) | sessions pass — `index.ts:896-925`; fn `sessionsLogTemplate()` at `index.ts:482` | **ADR-246 §2.3** | `opts.sessions === true` — default OFF |
| `.codex/config.toml`, `AGENTS.md` (+ host deps) | host pass — `index.ts:803-842`; fn `hostConfigFiles()` at `host-config.ts:143` | **GH #10**, ADR-045 | each requested host |
| `src/field-memory.ts` (+ dep/bootstrap) | `integrateFieldMemory()` — `index.ts:941`; fn at `field-memory-scaffold.ts:70` | ADR-0xx field memory | `opts.fieldMemory === true` — default OFF |
| *(content, not files)* — resolved `{{ANSWERS}}` | onboarding pass — `index.ts:959-990` | **ADR-281** | `useIcm && opts.answers` — see §3.6 |

The last row is the odd one out: it does not add a path, it **rewrites the bytes of
existing ones**, and unlike every other pass its input is not derivable from the file
map. It is the reason §6.1 is necessary but not sufficient.

`upgradeCmd()` re-applies only `integrateFieldMemory()` (`upgrade-cmd.ts:117-119`) —
which is why `field_memory` harnesses do *not* show this drift but every other harness
does. That is also the proof that the fix is known: the pattern was found once, patched
for one pass, and not generalised.

### 3.2 The destruction — `--apply` on that same harness

`planUpgrade` classifies `package.json` as `kind: 'clean'` (the local file matches the
manifest hash — nothing has touched it), so `applyPlan` takes the `clean` branch and
**overwrites it with `newContents[path]`** (`upgrade.ts:143-145`). That content is the
bare re-render, which has had none of the four passes applied.

| Field | Before | After | Origin of injection |
|---|---|---|---|
| `license` | `MIT` | `undefined` | GH #23, `index.ts:854-861` |
| `devDependencies['@metaharness/darwin']` | present | **dropped** | ADR-147, `index.ts:882` |
| `scripts.evolve` / `evolve:dry` | present | **dropped** | ADR-147, `index.ts:884-885` |
| `dependencies['@metaharness/host-codex']` | present | **dropped** | GH #10, `index.ts:836` |

Exit code is **0**, and the summary line is `Clean apply — no conflicts.` The `clean`
classification is *correct about the local file* and *wrong about the upstream file* —
the two were never comparable, because one came from `scaffold()` and the other from a
partial re-render.

The four files reported as removed are **not** deleted (verified on disk post-apply:
`LICENSE=true`, evolve skill `true`, sessions log `true`, `.codex/config.toml=true`,
`AGENTS.md=true`). `applyPlan` has no `plan.removed` loop at all. So the report promises
a deletion it does not perform, for files that should never have been deleted, and the
real damage happens in the file it described as safe.

### 3.3 The non-convergence — this is what makes it a repository-corrupting bug

The manifest is **never rewritten by `apply`**. Verified: after a successful
`--apply`, `.harness/manifest.json` still lists 32 files and still contains `LICENSE`,
the evolve skill, the sessions log, and `.codex/config.toml` — i.e. it still describes
the *pre-upgrade* state.

Three consecutive `--apply` runs on one untouched harness:

| Run | Plan | Exit | `<<<<<<< current` markers in `package.json` |
|---|---|---|---|
| 1 | `0 added / 5 removed / 2 clean-overwrite / 0 conflict` | **0** | 0 |
| 2 | `0 added / 5 removed / 0 clean-overwrite / **2 conflict**` | **1** | **1** |
| 3 | `0 added / 5 removed / 0 clean-overwrite / **2 conflict**` | **1** | **2** |

The mechanism: run 1 writes the bare render over `package.json`, so the on-disk file no
longer matches the manifest's `oldHash`. `planUpgrade` (`upgrade.ts:71-76`) therefore
classifies it `conflict`, and `inlineConflictMarkers` (`upgrade.ts:109-122`) writes
markers **into the file, in place**. Once `package.json` carries markers it is no longer
valid JSON — so the harness's own manifest-bearing package can no longer be parsed by
npm, by the tooling, or by the next upgrade run, which then nests a further pair of
markers inside the previous pair.

**The `No drift` branch (`upgrade-cmd.ts:136-139`) is unreachable for every harness
`scaffold()` can produce** — because every one of them carries at least `LICENSE` and
the darwin skill by default. The test at `__tests__/upgrade-cmd.test.ts:44` encodes the
correct intent and can never pass.

### 3.6 The missing record — `answers` is not in the manifest (the fourth symptom)

This one is different from §3.1–§3.3 and is the reason §6.1 alone does not close this
spec.

`scaffold()`'s sixth pass (`index.ts:959-990`) resolves the ICM onboarding answers —
`{{PROJECT_GOAL}}`, `{{BUILD_COMMAND}}`, and friends — into file content. That is the
user's own input, and it is the *only* pass whose input is not recoverable from the
rendered output.

`.harness/manifest.json` does **not** record those answers. Verified: for a headless ICM
scaffold, `manifest.vars` is exactly `["name", "description", "host"]` — no `answers`
key. `upgrade-cmd.ts` has no `--answers` flag and no `answers` reference at all.

Consequence, measured on a headless `vertical:coding` scaffold given six answers:

| | files containing `ship the thing` (an answer) | files containing `{{PROJECT_GOAL}}` (a placeholder) |
|---|---|---|
| before `--apply` | 1 | 0 |
| after `--apply` | **0** | **1** |

So `harness upgrade --apply` **reverts the user's answers**: content they supplied at
generation time is overwritten with the raw placeholder, at exit code **0**, with a
`Clean apply` message. The re-render used for comparison cannot produce the substituted
bytes (it has no answers to substitute), so every answered file looks locally modified
and gets clobbered with the unresolved version.

This directly contradicts the manifest's own stated purpose. `manifest.ts:3-6`:

> *"Mirrors copier's `.copier-answers.yml` model: a single source of truth for what the
> user chose at generation time, used to re-apply template updates on `harness upgrade`."*

Copier's model is precisely that `_copier_answers` *"includes all data needed to smooth
future updates"*, and copier's docs are emphatic that the answers file is what makes
updates reproducible (*"Never update `.copier-answers.yml` manually … This will trick
Copier, making it believe that those modified answers produced the current subproject"*).
`harness` adopted the model, named it in a comment, and did not record the data — so
the very failure copier's design exists to prevent is the failure happening here.

And ADR-281 §3 assumed the opposite of what is true:

> *"The pass runs on `rendered` **before** `fingerprintFiles()`, so `.harness/manifest.json`
> records the bytes that actually land on disk, and the manifest and the output cannot
> disagree about what the answers resolved."*

The manifest does record the *bytes* — it hashes the substituted file. What it does not
record is *the answers that produced them*, so nothing can **reproduce** those bytes on
a later run. Recording the hash of an output you cannot regenerate is exactly the
condition this spec exists to fix; ADR-281 closed the first half of that sentence and
the second half is this spec's SC13.

**This is why the fix is not "add five calls to `renderHarness`".** Even a perfect shared
pipeline needs the answers as an *input* to be faithful, so §6.1 must be paired with
§6.5 (record the answers) — otherwise upgrade becomes structurally correct and still
silently erases the user's answers.

### 3.4 What deliberately does **not** change
- The four passes stay, unchanged, on the scaffold path. They are ADR-backed behaviour.
- `planUpgrade`'s three-way classification logic (`clean` / `conflict`) is sound *given
  comparable inputs* and is preserved. The defect is the input, not the algorithm.
- `upgrade-cmd.ts:64-67`'s `icmEnabled(manifest)` — spec 02 §3.5/§6.2 makes it
  load-bearing and it must keep reading the **manifest**, never the catalog. This spec
  does not touch it, and any shared-pipeline refactor must keep the two resolvers
  separate.

### 3.5 The standard this repo already claims to follow

`upgrade.ts:1-19` cites "per ADR-008 + copier docs" and reproduces copier's algorithm.
Copier's actual contract for this case is explicit, and this implementation violates it:

> **Handling of deleted paths** — *"Template-based files/directories that were deleted
> in the generated project are automatically excluded from updates. If you want to
> recover such a file later on, you can run `copier recopy` and recommit it to your
> repository. Subsequent updates for the path will then be respected again."*

Three consequences, one of which contradicts this implementation twice:

1. Copier reads a deleted path as a **user action** and excludes it from the update —
   `harness upgrade` never deletes, so it should never *claim* to, and the paths it lists
   are not user-deleted at all.
2. Copier offers an explicit recovery verb (`recopy`). `harness upgrade` has no such
   path, which is why SC7's "detect and document" (§8 Q6) needs a documented recipe
   rather than a re-run of the tool.
3. Copier's contract has an explicit carve-out — paths matched by `skip_if_exists` *"are
   always ensured, even during an `update`"*. That is the concept `harness` is missing:
   some paths are **always-ensured** outputs of post-render passes (the license, the
   evolve skill), not template-managed files that can drift or be deleted. Under §6.1
   they become part of the shared pipeline's output, which is the same guarantee by a
   different route.

Copier's conflict contract also assumes the *user* diverged — the whole `--conflict
inline` mechanism is scoped to "when it's impossible for Copier to know what to do with
a diff code hunk". Here the "conflict" is manufactured entirely by the tool's own
previous run, which is a different category of failure and should not be routed into a
user-resolution flow at all.

`ADR-008` (`docs/adrs/ADR-008-drift-detection.md`) is the governing ADR and lists the
drift questions as *"which files came from which source, whether the source has
updated, whether the local edits conflict with upstream changes"* — all three of which
presuppose a correct source-side baseline. None of them is being answered today.

## 4. Success Criteria

| # | Criterion | Verification |
|---|---|---|
| SC1 | `scaffold` and `upgrade` derive their expected file set from **one** shared function; no post-render pass can be applied by one and not the other | code-shape test: adding a pass to the shared function changes both paths; a `scaffold`→`upgrade` round-trip on N configurations |
| SC2 | **`upgrade` on an untouched harness reports `No drift`** — for `minimal`, `vertical:coding`, single-host, multi-host, `--sessions`, `--no-darwin`, and an ICM-capable template | parameterised round-trip test; the existing `__tests__/upgrade-cmd.test.ts:44` case becomes the simple arm of it |
| SC3 | **`--apply` on an untouched harness modifies 0 files** — enforced by comparing a full recursive file-hash snapshot before/after, not by trusting the plan's counts | snapshot-diff test across the SC2 matrix |
| SC4 | `license`, all four `@metaharness/host-*` deps, the darwin devDep/scripts, and the evolve skill **survive** an `--apply` on a clean harness | explicit field assertions on `package.json` + `existsSync` on the emitted paths |
| SC5 | `--apply` is **idempotent and converging**: run 2 produces an empty plan and exit 0, and `.harness/manifest.json` is rewritten to the state actually written | three-run test asserting plan-2 = 0 and manifest equality after run 1 vs run 2 |
| SC6 | **No conflict markers are ever written into a file the tool itself just wrote.** A self-inflicted "conflict" is not a user-resolvable conflict | the SC5 three-run test asserts zero `<<<<<<< current` across all runs |
| SC7 | A harness already damaged by the current bug is **detectable**, and the recovery path is documented (repair-by-re-scaffold vs repair-in-place — see Q6) | fixture: a scaffold `--apply`-ed by the buggy code; assert the documented outcome |
| SC8 | `removed` is either **named in the report and never deleted** (copier's "excluded from updates" reading), or removed as a user-facing concept — decided by Q2, not left implicit | plan-report test asserting the chosen contract, including that it does not claim a deletion it will not perform |
| SC9 | **ADR-287** written, recording the defect, the shared-pipeline decision, and the copier parity in §3.5; `INDEX.md` gains its row; ADR-008 and ADR-012 bodies amended by cross-reference only | ADR diff + `INDEX.md` row; `__tests__/adr-index.test.ts` passes — it enforces `**Status**` + `## Context` + `## Decision` + `## Consequences`, and an `[ADR-287](./ADR-287-….md)` link form |
| SC10 | The four post-render passes are each covered by a round-trip assertion, so a fifth pass added later cannot silently re-open this class of bug | one assertion per pass, in the shared-function test |
| SC11 | Changelog entry leads with the user-facing defect (silent data loss on `--apply`); version `patch` (it is a defect fix, not a behaviour change) | changelog diff |
| SC12 | **The root suite has a runner**, so this class of regression is visible in CI rather than discovered by hand (#194) | CI step added; `scripts/runner-coverage-allowlist.json` shrinks |

> **On SC12.** It is listed here because this spec was found by hand and would otherwise
> rot again exactly as the other 16 root failures have. It is deliberately *last*: SC1–SC11
> are independently verifiable without it, and if Chris scopes it out (§8 Q7) the spec
> still stands. See §5.

## 5. The Sharp Edge — why this needed a spec, not a patch

Three things make the obvious patch wrong.

**1. "Re-apply the two missing passes" is the wrong shape, and is already known to be.**
The comment at `upgrade-cmd.ts:116-118` records that `integrateFieldMemory` was added
*precisely* because upgrade "would treat the runtime dependency and bootstrap as drift".
That fix was correct and local — and it did not generalise, which is why four passes
still drift. Adding four more calls in `upgradeCmd` produces the same defect again the
next time someone adds a pass. The pass list must live in **one** place both callers
use, or this bug is a recurring maintenance tax (SC1, SC10).

**2. The tests that would have caught it cannot run.** All 9 root test files are entries
in `scripts/runner-coverage-allowlist.json` — *"nothing runs the root suite today.
Tracked in #194."* `npm test` is `npm run -ws --if-present test`, and `-ws` excludes the
root package. So `__tests__/upgrade-cmd.test.ts` — which encodes the correct contract and
*is failing* — is invisible in CI. Any fix shipped without SC12 is a fix that nothing
guards. The `workflows.test.ts` comment predicted exactly this outcome: *"When #194 gives
the root suite a runner, these two turn from invisible to RED. That is the intended
alarm."* The alarm has, in effect, fired — this failure is one of the 17.

**3. The three-way merge is being asked a question it cannot answer.** `planUpgrade`
compares *on-disk* against *manifest* against *upstream-render*, and labels a mismatch
`conflict` — implying the user edited something. But when upstream-render is itself wrong,
every file the tool writes becomes a "conflict" on the next run (§3.3). The classification
is not wrong; it is being fed a baseline that does not describe reality. Fixing the
baseline (§6) makes the existing algorithm correct without editing it — and keeps the
user-resolvable-conflict path meaningful for the case it was designed for: a genuine
local edit.

## 6. Proposed Design

The shape is: **one render+post-process function, two callers, and a manifest that is
written by the same function that writes the files.**

### 6.1 One pipeline (`renderHarness`) — the core decision

Extract the whole post-render pipeline from `scaffold()` into a single function that
takes the same inputs and returns the same `{ files, manifest }` pair, applying **all**
post-render passes in the same order:

```
renderHarness(templateId, vars, opts) →
  1. walkTemplate(...)                        // incl. the icm overlay decision
  2. hostConfigFiles(...)   per host          // GH #10 / ADR-045   — index.ts:803-842
  3. mitLicense() + pkg.license               // GH #23             — index.ts:844-867
  4. darwinEvolveSkill() + darwin devDep/scripts  // ADR-147       — index.ts:871-895
  5. sessionsLogTemplate() + README note      // ADR-246 §2.3      — index.ts:896-925
  6. integrateFieldMemory()                   // already shared     — field-memory-scaffold.ts
  → { fileMap, manifest }
```

`scaffold()` writes the files and the manifest. `upgradeCmd()` uses the same `fileMap`
for its fingerprints **and the same `manifest` for its post-apply rewrite**. The
ordering matters and must be preserved exactly, because passes 3–5 mutate
`package.json` and `README.md` incrementally — a different order produces different bytes
and would re-open the drift.

This is the option my earlier probe recommended, and §3.1 is the measurement that argues
for it: `field_memory` does not drift *only* because its pass was re-applied in the
upgrade path; make that structural instead of remembered.

### 6.2 `removed` — the honest reading (pending Q2)

Copier's rule (§3.5) is that a path the template does not currently emit is **excluded
from the update**, not deleted. That reading makes `removed` informational, which is
what `applyPlan` already does behaviourally — the bug is that `formatPlan` *reports* it
as an action (`5 removed`) while performing nothing. Two candidate contracts:

- **(A) Name it, never act on it.** `removed` is printed with the paths listed, retitled
  to state plainly that these files are no longer emitted by the template and are left in
  place. Matches copier; zero destruction risk; keeps the signal (a genuinely-retired
  template file is worth knowing about).
- **(B) Drop it from the user-facing report entirely.** Only `added`/`changed` are
  reported; `removed` stays internal. Smallest surface, but loses the "this file is no
  longer managed" signal that is genuinely useful.

Under either, `applyPlan` must not gain a delete loop without explicit intent — and if
it ever does, it must move files aside rather than unlink them (house rule: `trash` >
`rm`, and `upgrade` runs in the user's repo, not mine).

### 6.3 Converge by rewriting the manifest (fixes §3.3)

After a successful apply, write `.harness/manifest.json` from the **same** pipeline
result — including the self-hash (`index.ts:1008-1011`). This is what makes run 2 empty.
Without it, SC5/SC6 are unreachable no matter how good the render is.

This also settles a second-order question the current code leaves open: `template_version`
is hardcoded `'0.0.0'` (`manifest.ts:78`) and `generator_version` is declared in
`upgrade-cmd.ts:33` but **never read**. So a template change is indistinguishable from
corruption — it surfaces as anonymous drift. Whether this spec fixes that is Q7.

### 6.4 Alternatives considered

| Option | Why not (by default) |
|---|---|
| Re-apply the four passes inside `upgradeCmd` | The known-failed shape (§5.1). Works today, rots on the next pass. |
| Have `upgrade` shell out to `scaffold()` into a temp dir and diff | Correct by construction, and genuinely tempting — but it re-runs onboarding/answers handling and writes a throwaway tree per invocation. Worth considering if `renderHarness` extraction proves messy (Q1). |
| Record the pass switches in the manifest and replay them | `hosts` and `field_memory` **are** already recorded (`index.ts:1003-1005`), so this is half-built — but `darwin` and `sessions` are not, and the file map itself is sufficient evidence (which is exactly how `icmEnabled` works, `upgrade-cmd.ts:64-67`). A new schema field is probably unnecessary (Q1). |
| Make `removed` real — actually delete | Directly contradicts copier, and would delete files that are legitimately managed. Rejected unless Q2 says otherwise. |

## 7. Impact Surface

| File | Change |
|---|---|
| `src/index.ts:763-1034` | extract the post-render pipeline into `renderHarness`; `scaffold()` becomes a caller. Pass order preserved exactly |
| `src/index.ts:994-1034` | manifest construction moves into / is returned by the shared function |
| `src/upgrade-cmd.ts:108-119` | call `renderHarness` instead of `walkTemplate` + ad-hoc `integrateFieldMemory`; keep `icmEnabled(manifest)` **as-is** (§3.4) |
| `src/upgrade-cmd.ts:64-67` | comment only — must not be "simplified" into the catalog resolver (spec 02 §6.2) |
| `src/upgrade-cmd.ts` (post-apply) | **new** — rewrite `.harness/manifest.json` from the shared result (§6.3) |
| `src/upgrade.ts:87-99` | `formatPlan` — `removed` reported per §6.2 (Q2); no count without paths |
| `src/upgrade.ts:127-159` | `applyPlan` — no delete loop unless Q2 overrides; if added, `trash`-style move-aside, never unlink |
| `src/manifest.ts:78` | `template_version: '0.0.0'` hardcode — in scope only if Q7 says so |
| `__tests__/upgrade-cmd.test.ts` | `:43` becomes the simple arm of the SC2 matrix; add the SC3 snapshot, SC4 field, SC5 three-run, SC6 marker assertions |
| `__tests__/fixtures/upgrade-damaged/` | **new** — a buggy-`--apply`-ed harness, the SC7 fixture |
| `docs/adrs/ADR-287-*.md` | new — defect, shared-pipeline decision, copier parity |
| `docs/adrs/ADR-008-drift-detection.md` | body intact; cross-reference from ADR-287 (its three drift questions were being answered against a bad baseline) |
| `docs/adrs/ADR-012-eject-upgrade-strategy.md` | body intact; cross-reference from ADR-287 (its upgrade flow stands; its input is corrected) |
| `docs/adrs/INDEX.md` | add the ADR-287 row |
| `.github/workflows/ci.yml` + `scripts/runner-coverage-allowlist.json` | SC12 — root-suite runner (#194) |
| `CHANGELOG.md` | `patch`; lead with the silent-data-loss fix |
| `docs/USERGUIDE.md` / `README.md` | describe the no-op-on-clean, converging contract; the recovery path for already-damaged harnesses (SC7) |

## 8. Round 1 Decisions (pending)

Asked in `03-questions-1-upgrade-fidelity.md`. Q1 and Q2 move everything after them.

| Q | Question | Recommended |
|---|---|---|
| 1 | Fix shape — shared `renderHarness`, temp-scaffold-and-diff, or manifest-recorded switches? | (A) shared pipeline |
| 2 | `removed` semantics — name it and never act, or drop from the report? | (A) name it, never act |
| 3 | Converge by rewriting the manifest on apply? | (A) yes, same pipeline result |
| 4 | Report detail — must the plan name affected files, not just counts? | (A) yes |
| 5 | Is "`--apply` on an untouched harness is a byte-exact no-op" a **hard invariant** (SC3), or best-effort? | (A) hard invariant, snapshot-tested |
| 6 | Already-damaged harnesses — detect + repair in place, or detect + document re-scaffold? | (A) detect + document; repair is a separate spec |
| 7 | Scope — does `generator_version`/`template_version` drift belong in this spec, and does the root-suite runner (#194, SC12)? | (A) version drift **yes**; (B) runner **separate** |

## 9. Not In Scope

- The four post-render passes' *content* or *conditions* — they are correct (§3.4).
- The `icmEnabled` / `resolveIcmDefault` split (spec 02 §6.2) — preserved, not revisited.
- The other 15 root-suite failures triaged alongside this one (2 deliberate, 10 stale, 2
  content gaps, 1 collection error) — tracked separately.
- Making the root suite *green*; this spec only needs it *runnable* (SC12).
- Any change to template content, catalog data, or the ICM overlay.

---

## Appendix — the reproduction

Source-level, no CLI dispatch involved:

```ts
const dir = await mkdtemp(...);
await scaffold({ name:'c', template:'vertical:coding', host:'claude-code',
                 hosts:['claude-code','codex'], targetDir:dir, force:true,
                 generatorVersion:'0.1.0', sessions:true });
await upgradeCmd([dir]);            // 0 added / 5 removed / 2 clean-overwrite
await upgradeCmd([dir, '--apply']); // exit 0, "Clean apply" — and license/darwin/evolve gone
await upgradeCmd([dir, '--apply']); // exit 1, conflict markers appear in package.json
await upgradeCmd([dir, '--apply']); // markers accumulate — package.json no longer parses
```
