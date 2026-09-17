# Task 6.0 proofs — CI tour, supersession record, and release

Parent 6.0, spec `02-spec-icm-default-on` (ADR-285, superseding ADR-279 §2).
Files: `docs/adrs/ADR-285-icm-default-on-capability-derived-emission.md` (new),
`docs/adrs/INDEX.md`, `CHANGELOG.md`, `README.md`, `docs/USERGUIDE.md`,
`docs/ARCHITECTURE.md`, `examples/README.md`,
`examples/icm-onboarding/answers.example.json`,
`examples/vertical-tour/vertical-tour.mjs`,
`packages/create-agent-harness/package.json`, `package-lock.json`.

---

## What This Task Proves

- **The default is now covered in CI, where before it was covered nowhere.**
  Every pre-existing ICM assertion in this repository drives the explicit
  `icm: true` override. So before task 6.2, the *default* — the entire point of
  spec 02 — was exercised by no CI check at all. That is the single most
  important finding of this unit.
- **The new check is falsifiable, and the mutation that kills it is the exact
  failure it exists to prevent.** Dropping the `generate !== false` conjunct
  makes `minimal` emit an ICM tree flagless, and the pass reports it. This is
  F1, asserted rather than assumed.
- **The oracle is independent of the thing it guards.** The first draft computed
  the expected value by calling `resolveIcmDefault` — the function the scaffold
  itself calls. That would have moved both sides together and passed vacuously
  under exactly the mutation above. The expected value now comes from the
  **catalog fields**.
- **Supersession is by follow-on, per `INDEX.md`.** ADR-279's and ADR-282's
  bodies are byte-untouched (`git diff --stat` empty); the correction lives in
  ADR-285 and the INDEX annotation.
- **The release is honest about what it abandons.** "byte-equality retired,
  capability-preservation substituted" appears in the ADR, the changelog, and
  the spec §1.1 — not discovered later.

## 6.1 — the tour's ICM pass still green (F1's acceptance test)

`node examples/vertical-tour/vertical-tour.mjs`:

```
ICM pass: 2/2 OK.
```

`minimal` still emits its tree **under the explicit override**. That is F1's
whole point: the override keeps a reachable path to `minimal`'s overlay even
though the default now (correctly) suppresses it.

## 6.2 — the default-coverage hole, closed

Added `icmDefaultCheck` + a flagless pass over **all 20** catalog templates:

```
| Template | default | ICM tree |
|-----------------------------------|---------|--------------|
| `minimal`                         | off     | none (correct) |
| `vertical:coding`                 | on      | emitted        |
| … (18 non-capable)                | off     | none (correct) |

ICM default pass: 20/20 OK.
```

Measured delta, flagless vs. `icm: false` on `vertical:coding`: **21 → 31 files
on disk, a delta of exactly the 10 overlay paths** (`CONTEXT.md`,
`references/CONTEXT.md`, `stages/{01-plan,02-implement,03-test,04-review}/CONTEXT.md`,
`output/.gitkeep` per stage).

**Discrepancy recorded, not smoothed.** The spec's §4.1 and the 5.0 fixture cite
"20 → 30 files". Today's measurement is 21 → 31. The gap is fully explained: the
fixture's manifest records 19 files for `vertical:coding`'s pre-flip state and
**excludes `.harness/manifest.json` and `.harness/manifest.sha256`**, which the
on-disk count includes (19 + 2 = 21). The stable quantity is the **delta of 10**,
and that is what the tour asserts and what ADR-285 records.

**Mutation kill** (the falsification):

```
--- mutation: icm.enabled && generate !== false  →  icm.enabled ---
  - minimal: default false but an ICM tree was emitted
FAIL: 1 of 20 ICM defaults drifted
EXIT=1
```

One template reports, and it is the right one. Restored from backup;
`git diff --stat src/index.ts` empty (byte-identical); tour back to `EXIT=0`.

## 6.3 — the tour's rationale rewritten

Four sites updated (`:81-87`, `:85`, `:192`, `:229`). The separate pass is
**kept** — it prevents ambiguous file counts in the table — but its justification
"the flagless path is the byte-equality guarantee" has retired with byte-equality
itself. The replacement states the real division of labour: the override-driven
pass proves **per-template emission**, the default pass proves **the default**,
and neither subsumes the other. Two of the four sites were not merely stale but
mentioned the `--icm` flag, which no longer exists.

## 6.4/6.5 — ADR-285 and supersession by follow-on

`docs/adrs/ADR-285-icm-default-on-capability-derived-emission.md` (13125 bytes)
carries the header the task specifies:

> **Supersedes**: ADR-279 §2 … **amends** ADR-279 §3 rationale … **Extends**:
> ADR-279 §1 and §4 (both stand)

It records the two-conjunct predicate and why both are load-bearing; F1
explicitly; the override's survival and why (`walkTemplate` has two callers
asking different questions — `scaffold()` reads the catalog, `upgrade-cmd.ts`
reads the manifest); and the honest phrase in a blockquote.

**Bodies untouched** (required by `INDEX.md:359`):

```
$ git diff --stat docs/adrs/ADR-279-*.md docs/adrs/ADR-282-*.md
(empty)
```

**Two factual corrections made during verification, rather than shipped:**

1. The ADR first cited `src/index.ts:753` for `useIcm`. Live check:
   `useIcm` is at **`:768`**, `resolveIcmDefault` at **`:183`**. Both corrected.
2. The ADR first said ADR-282's false sentences are at `§"What does not
   change"` / `§"Byte-equality without the flag is untouched."` Rewritten to name
   them as **paragraphs** under those headings, since neither is a `§`-numbered
   section.

`INDEX.md` gets the Status-column annotation on the ADR-279 row (following the
`:339` precedent) plus the ADR-285 row in the same table block.

`__tests__/adr-index.test.ts` reports one failure — **`ADR-253`**, which at HEAD
has `0` `## Consequences` headings. Pre-existing, not mine. ADR-285 satisfies all
three checks: `**Status**` 1, `## Context` 1, `## Decision` 1, `## Consequences` 1.

## 6.6 — version and changelog

`0.4.16` → **`0.5.0`** (`minor`), in `packages/create-agent-harness/package.json`
and the matching `package-lock.json` entry. Rationale in the changelog: on a
pre-1.0 CLI, `0.x` minors conventionally carry breaking changes, so the break is
signalled through the number **and** stated in words.

`node scripts/healthcheck.mjs --check=version` → **PASS**. The published CLI is
excluded from the lockstep check (it legitimately moves independently); the
bump does not perturb it.

`CHANGELOG.md` leads the Unreleased section with the breaking change, names the
two affected templates, states the `minimal` boundary, names the escape hatch
(`icm: false` at the library level), and spells out the abandoned guarantee.

## 6.7 — prose surfaces

| Surface | Change |
|---|---|
| `README.md` | new "ICM follows the template — there is no flag" subsection under Verticals |
| `docs/USERGUIDE.md` | ICM paragraph where templates are chosen; `--answers` vs. interactive |
| `docs/ARCHITECTURE.md` | "ICM emission is a catalog decision, not a flag" under Validation surface, incl. the two-caller rationale |
| `examples/README.md` | flag dropped from the table row; ICM paragraph rewritten |
| `examples/icm-onboarding/answers.example.json` | `--icm` dropped from the header comment |

Verified no live surface still instructs a user to pass the flag:

```
$ grep -rn -- "--icm\|--no-icm" README.md docs/USERGUIDE.md docs/ARCHITECTURE.md \
    examples/ CHANGELOG.md docs/adrs/ADR-285*.md | grep -v "removed|deleted|no longer|…"
  (none — every remaining hit is a past-tense reference to its removal)
$ node packages/create-agent-harness/dist/index.js --help | grep -i icm
  (no icm in --help — flag surface gone)
```

**Consequential side-finding, NOT fixed here:** `docs/USERGUIDE.md` is broadly
stale from ADR-284 — it still describes UI tabs and a downloaded `.zip`. That is
a UI-removal documentation debt, out of scope for this spec, and is flagged
rather than silently patched (see 6.9).

## 6.8 — the full local gate

In the documented order:

| Gate | Result |
|---|---|
| `npm run build` | ✅ `[build-ordered] DONE in 19039ms` |
| `npm --prefix packages/create-agent-harness test` | ✅ **674 passed**, 2 skipped, **0 failed** |
| `node scripts/healthcheck.mjs` | ✅ PASS incl. `catalogCount` cross-language sync |
| `node scripts/path-guard.mjs` | ✅ pass |
| `node scripts/check-runner-coverage.mjs` | ✅ `ok — every test is reached by a runner or allowlisted with a reason` |
| `node examples/vertical-tour/vertical-tour.mjs` | ✅ `19/19` verticals, `2/2` ICM, **`20/20` ICM defaults**, `EXIT=0` |
| `node scripts/preflight.mjs` | ⚠️ **6 failures — all pre-existing/environmental; none from this change** |

### Preflight classification (task 1.0 recorded 3; this run shows 6 — all explained)

| # | Failure | Cause | Mine? |
|---|---|---|---|
| 1 | `git is clean` | Working tree holds this unit's own uncommitted work — the check is *designed* to fail until commit | Transient, self-inflicted by pre-commit verification; resolves at commit |
| 2 | `every package.json has version 0.1.0` | **Pre-existing**: 41 independently-versioned packages. Verified against HEAD: `metaharness=0.4.16` there, also `≠ 0.1.0`, so this failed before my bump too | No |
| 3 | `every published package has a README` | `@metaharness/evals-extract` missing `README.md` — named in task 1.0's record | No |
| 4 | `wasm-pack build` | `wasm-pack: command not found` — not installed on this host; `.github/workflows/ci.yml:95-106` installs it in CI | No (environmental) |
| 5 | `wasm size budget` | Consequence of #4: `crates/kernel-wasm/pkg` never built (`ENOENT`) | No (cascade) |
| 6 | `npm tests` → `packages/agntcy/src/oasf/__tests__/publish.test.ts` | Live-server integration test against `localhost:8888` (`describe.runIf(serverReachable \|\| CI !== 'true')`, `:186`); no Directory server running. `packages/agntcy` is **untouched** by this diff (`git status` 0 hits) and depends only on `agntcy-dir` | No (environmental) |

`cargo test` did **not** fail: it logged the >60s warnings on
`darwin::dynamic_can_match_or_beat_best_static_on_leduc` and
`holdem_cfr_converges_within_the_abstraction` (as task 1.0 recorded) but finished
`36 passed; 0 failed` in 191s. Preflight's overall exit is non-zero solely
because of the six above.

Task 1.0 explicitly instructed: *"Task 6.8 must address these three explicitly —
do not re-run preflight and report red as expected."* Done: all six are
individually attributed, with #2 verified against HEAD and #6 traced to an
untouched package. **None is a regression from spec 02.**

## 6.9 — residual prose surfaces, recorded not "fixed"

| Surface | Status | Why |
|---|---|---|
| `docs/specs/01-*/01-spec-*.md` | Left alone | Historical record of work performed; describes `--icm` as it existed |
| ADR-279, ADR-282 bodies | Left alone | `INDEX.md:359` — superseded/amended by follow-on, never edited in place |
| Other historical ADR bodies | Left alone | Same rule; a grep finding them is looking at history, not drift |
| `docs/USERGUIDE.md` UI tabs / `.zip` | **Flagged** | Stale from ADR-284 (separate concern) — recorded here so it is not misread as a spec-02 miss |

A later `grep -r -- '--icm'` is expected to hit `docs/specs/01-*`, the historical
ADR bodies, and past-tense references in v0.5.0's own changelog/ADR-285. Those
are **records**, not misses.

---

## Outstanding before this unit closes

- 6.0's proof artifact list requires `node scripts/preflight.mjs` → PASS. It is
  **not** PASS, for the six pre-existing/environmental reasons above. Task 1.0
  predicted this and required attribution instead of a green re-run. **Needs
  Chris's call**: accept the attributed-red state as this unit's recorded
  outcome, or fix the three repo-side causes (#2 version drift across 41
  packages, #3 `evals-extract` README, and installing `wasm-pack` locally) —
  each of which is a separate concern from spec 02.
