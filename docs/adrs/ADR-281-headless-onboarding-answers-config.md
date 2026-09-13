# ADR-281: Headless onboarding — answers config, strict substitution, and the no-silent-gap rule

- **Status**: Accepted — implemented by `src/onboarding.ts` + the `scaffold()` wiring; `__tests__/onboarding.test.ts` is the committed form (16 tests, mutations falsified before commit).
- **Date**: 2026-09-13
- **Deciders**: Chris (kozure) — fork owner.
- **Tags**: fork, icm, onboarding, answers-config, placeholders, determinism, harness-generator
- **Extends**: ADR-279 (fork design — pin policy, `--icm` opt-in emission, `CLAUDE.md` ownership)
- **Related**: `docs/specs/01-spec-icm-generator-emission/01-tasks-icm-generator-emission.md` Unit 4 (4.1–4.10); upstream `_core/placeholder-syntax.md`; upstream `ruvnet/metaharness` @ `d5833dc`
- **Prompted by**: ADR-279 left the ICM tree emitted with `{{SCREAMING_SNAKE_CASE}}` placeholders intact for a *human or agent* to fill in. Nothing in the generator could fill them, so the flag alone could not produce a usable harness without a conversation — the gap Unit 4 closes.

---

## Context

Under `--icm` the generator emits a five-layer ICM harness whose Layer 1/2 contracts carry `{{SCREAMING_SNAKE_CASE}}` placeholders and `{{?NAME}}…{{/NAME}}` conditional sections. Upstream's `_core/placeholder-syntax.md` is explicit that in the interactive workflow an **agent asks the questions** and edits the files — the questionnaire *is* the source, and the placeholders are its targets. That model has no headless path: `harness scaffold <name> --icm` in CI, or from another program, had no way to answer anything, and the run's success looked identical whether zero or all of the questions were answered.

Three properties had to be decided, and each is a fork-level constraint rather than a local implementation detail:

1. **What the answers config is keyed by.** The spec requires the config be keyed by **question id** with the placeholder set *derived from the same catalog data* — "not a second hand-maintained list". A second list drifts the moment someone edits a stage contract, and the drift is invisible: the generator would keep emitting a placeholder nobody can answer, or advertise a question nothing consumes.
2. **What happens when a required answer is missing.** This is the whole point of the feature. A generator that silently substitutes a plausible default (`npm test`, "your project goal") produces a harness that *looks* complete and is wrong in a way only a human reading the contracts would catch. The spec names this the **no-silent-gap** behaviour: report the unresolved placeholders by name, with file and line, and exit non-zero.
3. **Which pass resolves what.** `renderer.ts` already handles `{{name}}` Mustache vars, and it is **deliberately non-strict** — an unknown var is left in place so partial renders stay detectable downstream (ADR-279's Test Contract records this as "the mechanism, not a bug"). Leaving ICM placeholders in place is exactly the failure this feature must prevent, so the ICM half cannot ride that renderer, and must not fight it either.

## Decision

### 1. The config is keyed by the placeholder/conditional **name**, and the required set is *derived by scanning content*

The answers config is one JSON object keyed by ICM question id, where the id **is** the placeholder or conditional name in `{{SCREAMING_SNAKE_CASE}}` form:

```json
{ "PROJECT_GOAL": "…", "BUILD_COMMAND": "npm run build", "SUBAGENT_HANDOFF": true }
```

Per `_core/placeholder-syntax.md` one question maps one-to-many onto placeholders, so a config keyed by name is the stable identifier derivable from content. `catalog.def.mjs` carries only the human-facing *metadata* (`label`, `kind`, `hint`) for those names; `icmQuestionsFor(t)` derives the ordered question list by scanning the template's own ICM content for tokens and **throws** if a derived name has no metadata entry. `catalog.json` publishes the result as `icm.questions`, and a test asserts that advertised list equals the set the emitted tree actually needs.

A `hint` is deliberately **not** a default. A default is an implicit answer, which is the silent gap in a friendlier costume.

### 2. Headless mode is strict; interactive mode still reports

`--answers <path>` implies `--icm` (there is nothing to answer without the tree) and makes the run **strict**: every derived question must be answered, and any residue is a failure (`main()` returns non-zero after printing the named report to stderr).

`--icm` *without* a config is the **interactive** path and remains successful — the tree is emitted with placeholders intact, which is the documented workflow — but it is **not silent**: the mode and every remaining placeholder are printed with `file:line`. The distinction is deliberate, and it is what keeps the shipped `--icm` tests meaningful instead of turning the interactive workflow into an error.

### 3. Substitution is a separate strict pass; the two halves compose

`src/onboarding.ts` owns `{{SCREAMING_SNAKE}}` / `{{?NAME}}` / `{{/NAME}}` and nothing else. A lowercase `{{name}}` is passed through untouched for `renderer.ts`/the walker to own, so the halves neither double-report nor compete. Residue detection is likewise split: `scanResiduals` reports only the ICM forms, because the walker's `unresolved[]` is already the existing data source for the lowercase half.

The pass runs on `rendered` **before** `fingerprintFiles()`, so `.harness/manifest.json` records the bytes that actually land on disk, and the manifest and the output cannot disagree about what the answers resolved.

### 4. Conditional markers are **line-consuming** when they own their line

The syntax doc's rule is that a conditional wraps *whole sections* — its stated rationale being that "wrapping complete sections means removal always produces clean markdown". The authored shape is therefore

```
…last line of the previous section
<blank>
{{?NAME}}
## Heading
…
{{/NAME}}
<blank>
## Next section
```

Consuming only the marker *bytes* satisfies "no orphaned markers" while still producing doubled blank-line runs (true) or tripled runs (false) — marker-free, but not the clean markdown the rule exists to guarantee. So a conditional token that is alone on its line consumes that whole line, and a *removed* section additionally collapses the blank line it was set off by. A `{{?NAME}}` that is *not* alone on its line is left as residue rather than guessed at, and nested conditionals are rejected explicitly.

### 5. The sample config ships in-repo with values that are structural only, and admits one comment form

`examples/icm-onboarding/answers.example.json` is committed, and the public-visibility warning is **in the file**, not only in the spec (task 4.5). The fork is public and inherits upstream's visibility, so the sample carries structural values only — no personal context, credentials, machine paths, or real brand data. JSON has no comments, so `parseAnswers` strips **full-line** `//` comments: a data line can never begin with `//` in JSON, so that form is unambiguous by construction. Trailing-comment stripping is deliberately *not* supported — it would require tracking string/escape state to avoid mangling a legitimate value such as `"https://example.com/repo"`, which is a bug surface larger than the convenience it buys.

## Consequences

- **A headless run is now possible, and replayable.** The same config in two different temp dirs produces byte-identical trees (the only difference anywhere is `.harness/manifest.json`'s wall-clock `generated_at` and the `manifest.sha256` derived from it), and no absolute path is embedded in any output file. This is what makes the feature usable from CI and from another program.
- **A missing answer is loud.** It is reported by name with `file:line`, the run exits non-zero, and the unanswered placeholder is *left in place* rather than blanked out — so a half-answered tree remains diagnosable rather than plausible.
- **The question surface cannot drift from the content.** Adding a placeholder to a stage contract without adding metadata fails at generation time (`icmQuestionsFor` throws) and at test time (advertised ≠ derived). Removing metadata for a live placeholder fails the same way. There is no path by which the catalog advertises a question nothing consumes.
- **The interactive workflow is unchanged in outcome but no longer quiet.** `--icm` without a config still exits 0 and still emits placeholders; it now also prints what it left behind.
- **`renderer.ts` stays non-strict.** The strictness lives in the new pass, which is where it can be strict without breaking the detected-partial-render contract the renderer exists to serve.
- **The `hint` field is advisory only.** A future contributor must not promote it to a fallback default to "help" headless runs; doing so reintroduces the silent gap, and the missing-key test would not catch a *defaulted* key (it asserts resolution, not provenance). The decision is recorded here so that change is deliberate rather than incidental.
- **The pass is ICM-scoped.** It runs only when `opts.icm === true`, and only touches files containing `{{`, so a flagless scaffold remains byte-identical to upstream-at-pin (ADR-279 decision 2) — the constraint that must not regress.

## Alternatives Considered

- **Reuse `renderer.ts` for ICM placeholders.** Rejected: it is non-strict by design and leaves unknown vars in place, which is precisely the failure mode (a silently partial tree) this feature exists to prevent.
- **Give each question a `default` in `ICM_QUESTIONS` so a config need not answer everything.** Rejected: it is the silent gap wearing a friendlier costume. A generator that invents `npm test` for you produces a harness that looks complete and is wrong.
- **Key the config by position or by a separate short id (`q1`, `goal`).** Rejected: the value must be derivable from the content that consumes it, or the config and the tree drift with nothing to catch it.
- **A second hand-maintained list of questions next to the content.** Rejected explicitly by the spec, and correctly — it is the drift the derivation exists to prevent.
- **Make `--icm` without answers a failure too.** Rejected: that is the documented interactive workflow, and failing it would break the shipped `--icm` tests and the human path alike. Reporting without failing is the honest middle.
- **Strip trailing `//` comments as well as full-line ones.** Rejected: requires string/escape-state tracking to avoid corrupting URLs and paths; the one comment form that cannot be confused with JSON data is enough for the warning the sample needs.
- **Leave the markers' blank lines alone (strip token bytes only).** Rejected: produces doubled/tripled blank runs, which is not the "clean markdown" the whole-section rule exists to guarantee. Caught by hand-testing the emitted `FIX_LOOP=false` contract before it was committed — the fix is the line-consuming rule above, and `expect(test).not.toMatch(/\n{3,}/)` now pins it.

## Test Contract

**Status (2026-09-13): Unit 4 tasks 4.1–4.10 are complete. `create-agent-harness` runs 622 passed / 2 skipped (606 before Unit 4; the 16 new tests are `__tests__/onboarding.test.ts`).**

- **Determinism (task 4.6).** Two `scaffold()` runs with the same config in two different temp dirs produce identical file sets and identical bytes for every path other than `.harness/manifest.json` / `manifest.sha256`, whose single difference is the masked `generated_at`; and no output file contains the temp root. *Committed form: `onboarding.test.ts`.*
- **The committed sample loads and resolves (task 4.5).** `answer.example.json` is fed through `parseAnswers` + `scaffold()` in the determinism suite, so the shipped example cannot rot silently; every emitted file is asserted free of ICM tokens.
- **Missing key is named, not silent (task 4.7).** Scaffolding with `TEST_COMMAND`/`REVIEW_FOCUS` omitted yields `residuals` naming exactly those two, each with a `stages/0N-*/CONTEXT.md:<line>` location; the answered half is still reported as resolved; the unanswered placeholders remain in the file. The CLI form asserts **exit 1**, the names on stderr, a `file:line` location, and *no stack trace*.
- **Complete config exits 0 (task 4.7, positive half).** The CLI prints `All ICM placeholders resolved.` and exits 0.
- **Interactive still reports (task 4.4).** `--icm` with no config exits **0** and prints `interactive` plus all six names — the residue is reported rather than silent, without failing the documented workflow.
- **Conditional sections, both directions (task 4.8).** `FIX_LOOP=false` removes the heading, the table, and the prose, leaves `\n\n## Audit\n` (exactly one blank line), and no `\n{3,}` run; `FIX_LOOP=true` keeps the section with markers stripped and the same spacing invariants. An *unset* conditional is reported and left in place — never read as false, which would silently drop a section the author never decided about.
- **Unit guards.** `parseAnswers` accepts full-line comments and rejects (by name) lowercase keys, empty strings, non string|boolean values, array roots, and invalid JSON; a trailing `//` inside a string value survives; `substituteIcm` leaves lowercase mustache vars for the renderer half; `scanResiduals` reports true line numbers; nested conditionals throw.
- **Single-source rule (task 4.1).** `catalog.json`'s advertised `icm.questions` equals `requiredQuestions()` derived from the emitted tree, compared at runtime against `Object.keys(COMPLETE)`.
- **Falsified before commit.** Three mutations, each caught by its target assertion and reverted: disabling the blank-line collapse → 4.8 removal test red (the `\n{3,}` invariant); treating an unset conditional as `false` → both 4.8 unset/silent-removal tests red; making the interactive branch report no residue → the 4.4 "not silent" test red. The unmutated run is 16/16 green.
- **Regression gates (unchanged).** `create-agent-harness` 622 passed / 2 skipped; lint (`tsc --noEmit`) clean; `path-guard.mjs` clean; `healthcheck.mjs` 8/8; `vertical-tour.mjs` 19/19 verticals HEALTHY plus 2/2 ICM trees OK; `npm run gen:templates` idempotent (templates tree hash unchanged before/after).
- **Byte-equality without the flag is untouched.** The pass is gated on `opts.icm === true` and skips files without `{{`, so `icm-off.test.ts` (ADR-279 decision 2) still holds.

**Hand verification (tasks 4.9/4.10).** `harness scaffold demo --template vertical:coding --answers examples/icm-onboarding/answers.example.json` prints the six resolved values and `All ICM placeholders resolved.`, exit 0; `stages/01-plan/CONTEXT.md` shows the resolved goal in the Inputs table in place of `{{PROJECT_GOAL}}`; and a single tree-wide `grep -rn '{{'` over the scaffold returns nothing (exit 1 = no matches = zero residue).

## References

- `docs/specs/01-spec-icm-generator-emission/01-tasks-icm-generator-emission.md` §4.0 (tasks 4.1–4.10), `01-spec-icm-generator-emission.md`
- ADR-279 (fork pin policy, `--icm` opt-in, `.icm/` overlay, `CLAUDE.md` ownership) — this ADR extends it and does not amend it
- Upstream `_core/placeholder-syntax.md` (conditional-section rules, questionnaire mapping), `_core/CONVENTIONS.md`
- `packages/create-agent-harness/src/{onboarding.ts,index.ts,renderer.ts,walker.ts,manifest.ts}`, `templates/catalog.def.mjs`, `scripts/gen-templates.mjs`
- `examples/icm-onboarding/answers.example.json` (committed sample, structural values only)
- Upstream: `ruvnet/metaharness` @ `d5833dc6512ac1adeeef91a331c29055cd8a4dbb`
