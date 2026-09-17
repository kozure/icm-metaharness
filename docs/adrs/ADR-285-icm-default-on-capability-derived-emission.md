# ADR-285: ICM emission follows the template — the `--icm` flag surface is removed

- **Status**: Accepted — implemented by `docs/specs/02-spec-icm-default-on/` (spec, tasks, audit PASS). Capability-derived default at `src/index.ts:768`; flag surface deleted from the parser; CI tour and default-coverage pass green.
- **Date**: 2026-09-16
- **Deciders**: Chris (kozure) — fork owner; direction ratified during SDD Phase 1 (7 answers, 2026-09-15).
- **Tags**: icm, flag-removal, default-on, breaking-change, capability-gate, upstream-drift, process
- **Supersedes**: ADR-279 §2 (`--icm` is opt-in and off by default); amends ADR-279 §3 rationale (the collision-point enforcement stands, its merge-economics justification does not)
- **Extends**: ADR-279 §1 and §4 (both stand — the pin policy and the subtractive deviations are untouched by this ADR)
- **Related**: ADR-281 (headless onboarding — `--answers` implied `--icm` and must be re-read under a default that no longer needs the flag), ADR-282 (seam smoke test — its "still holds" claim about ADR-279's byte-equality is now false; corrected by cross-reference in §6 below, not by edit), ADR-283 and ADR-284 (the standalone determinations that retired the merge argument), `docs/specs/01-spec-icm-generator-emission/`
- **Prompted by**: the flag became a second way to ask a question the catalog had already answered, and the reason for opt-in (merge economics) expired when this repo became standalone.

---

## Context

ADR-279 §2 made ICM emission opt-in behind `--icm`, with a hard companion constraint: **with the flag absent the rendered file set must be byte-identical to upstream-at-pin output**. Its stated rationale was merge economics — "the fork's value proposition is a merge, not a divergence" — so an always-on flag would convert every consumer's scaffold into a different artifact and make the upstream merge a behaviour change.

Two later facts spent that rationale:

1. **The capability marker already exists.** `templates/catalog.json` carries an `icm` block per template. "Which templates can emit ICM" is *already declared data* — the flag was a second, redundant way to ask a question the catalog answers (the resolver exported at `src/index.ts:183`).
2. **The merge is no longer a live goal.** ADR-283 and ADR-284 record this repository as standalone (`isFork: false`). The byte-equality guarantee was protecting a destination no longer on the route.

The user-visible result: a user scaffolding `vertical:coding` got 20 files and no ICM tree, then had to learn a flag to get the tree their template was built to emit.

### What was measured before deciding

- **Only two of twenty templates are capable.** `minimal` and `vertical:coding` carry a `.icm/` overlay; the other eighteen have none, so a *global* default flip leaks `"Onboarding: interactive (0 questions)"` onto eighteen non-capable templates — the spec's first finding, and the reason this is not a one-line predicate swap.
- **`minimal` is the sharp edge.** It advertises `icm` (it is capable) but is `generate: false`. A bare capability default would make `minimal`'s tree emittable and change its default output — the failure mode recorded as F1 and now guarded (see §4).
- **No capability gate existed in the scaffold path.** `scaffold()` read a raw boolean and never called `loadCatalog()`, so the gate had to be *introduced*, not reused.

## Decision

### 1. Emission follows the template's capability; the flag surface is deleted

`--icm` and `--no-icm` are removed from the parser and from `--help`. In their place a single resolver decides:

```ts
export function resolveIcmDefault(templateId: string): boolean {
  const entry = loadCatalog().find(t => t.id === templateId);
  if (!entry) return false;                                  // fail-closed
  return entry.icm?.enabled === true && entry.generate !== false;
}
```

`scaffold()` computes `const useIcm = opts.icm ?? resolveIcmDefault(opts.template)` — one decision point, consulted once. A capable template emits its tree; a non-capable template is unaffected, so the eighteen-template leak is closed by construction rather than by enumerating them.

### 2. The predicate has two conjuncts, and both are load-bearing

`icm.enabled` alone is not the predicate. `minimal` is `icm: true` **and** `generate: false`: it is capable in the sense that the overlay exists, but it is not a template the scaffold path emits. `icm.enabled && generate !== false` states the real question — "does this template emit, and can it emit ICM?" — and `generate !== false` is written as an explicit negative because upstream treats an absent `generate` as true, so `=== false` is the honest test.

### 3. The API-level override survives

`opts.icm` remains, and still wins in both directions over the resolver. Two reasons, in order of weight:

- **`walkTemplate()` has two callers, and they ask different questions.** `scaffold()` (`src/index.ts:778`) asks "what should this template emit *now*?" — a catalog question. `upgrade-cmd.ts:108` asks "what did this harness *already* emit?" — derived from the manifest file map via `icmEnabled(manifest)`, not from the catalog. They are two different questions about two different sources; collapsing them into the resolver would make an upgrade re-derive emission from a catalog that may have changed since the harness was created.
- **Keeping the override preserves a testable seam.** An explicit `icm: true` still emits `minimal`'s tree, and an explicit `icm: false` still suppresses `vertical:coding`'s — asserted, both directions, mutation-falsified.

The two resolvers are deliberately **not** merged. `resolveIcmDefault` ("what should this template emit?") and `icmEnabled` ("what did this harness already emit?") are named distinctly so a future reader cannot mistake one for the other.

### 4. F1, recorded explicitly

**A bare capability default would have made `minimal`'s tree unemittable-adjacent — it would have caused `minimal` to start emitting an ICM tree, changing a template's default output for a reason unrelated to the change's purpose.** That is the concrete failure the second conjunct prevents, and it is now asserted in CI rather than assumed: the tour's default pass computes the expected value from the **catalog fields**, never by calling `resolveIcmDefault`, because the scaffold calls that function — using it as the oracle would move both sides together and pass vacuously under exactly the mutation it exists to catch.

### 5. The honest phrase, repeated wherever the change is described

> **byte-equality retired, capability-preservation substituted.**

ADR-279's Consequences called byte-equality without `--icm` "a hard constraint, so any fork change that perturbs default output is a defect, even if ICM itself is correct." Removing the flags **deliberately abandons that constraint for capable templates.** It is not a free reversal, and the cost is recorded in the spec §1.1, in the changelog, and here, rather than discovered later. The `upstream` remote survives with its push URL `DISABLED`; a future re-pin would merge against a baseline this fork now knowingly diverges from.

### 6. Cross-reference ADR-282 rather than editing it

ADR-282 says, twice, that ADR-279's byte-equality guarantee "still holds" — under its **"What does not change"** paragraph and again under **"Byte-equality without the flag is untouched."** Both sentences are now **false** for capable templates. Per `INDEX.md`'s amendment rule — a ratified ADR is amended by a follow-on and never edited in place — ADR-282's body is **left untouched** and corrected by this cross-reference. Its statements were true when written; the corpus is a record of work performed, not a live document.

## Consequences

- **A `vertical:coding` scaffold now emits its ICM tree by default** — the same 10 paths the explicit override always emitted (`CONTEXT.md`, `references/CONTEXT.md`, `stages/{01-plan,02-implement,03-test,04-review}/CONTEXT.md`, and a `output/.gitkeep` per stage) — and `minimal` remains ICM-free by default. Measured flagless vs. `icm: false`: 21 → 31 files on disk, a delta of exactly those 10. (The spec's "20 → 30" figures counted one fewer bookkeeping file; the delta of 10 is the stable quantity and is what the tour asserts.) This is a breaking change to default output with no opt-out, stated in words in the changelog (§4.2 of the spec: on a pre-1.0 CLI, the release is taken as `minor` with the break stated, not signalled through the number).
- **`icm-off.test.ts`'s premise died and its guards were repurposed, not deleted** (commit `be36438`). Its five tests built a flagless case from `icm: undefined` and asserted it matched a pinned upstream baseline; after the flip, `undefined` resolves to `true` for `vertical:coding`, so the test would have compared an ICM scaffold against an ICM scaffold, still passed, and proven nothing. This is the sharp edge that made the work a spec rather than a patch.
- **The default is now covered in CI, where before it was covered nowhere.** Every pre-existing ICM assertion in the repository drives the explicit override, so before task 6.2 the *default* — the entire point of this change — was exercised by no CI check. The tour's flagless pass closes that hole across all twenty templates.
- **The CI tour's ICM-pass rationale was rewritten** (task 6.3). The separate pass is kept — it prevents ambiguous file counts in the table — but the justification "the flagless path is the byte-equality guarantee" retired with byte-equality. The separate pass now proves *per-template emission*; the default pass proves *the default*. Neither subsumes the other.
- **The capability gate is load-bearing and lives in one place.** A future contributor adding a template with a `.icm/` overlay gets the default behavior from the catalog block alone; nothing needs to be added to a list.
- **`upgrade`'s behavior is unchanged**, because its resolver reads the manifest, not the catalog. The distinction is contractual and named.
- **A residual prose surface is knowingly left alone.** `docs/specs/01-*/01-spec-*.md` and the historical ADR bodies still describe `--icm` as a flag. They are historical records, not misses; a later grep finding them is looking at history, not drift. Recorded in the task list (task 6.9) so the next reader is not misled.

## Alternatives Considered

- **Flip the default globally without a capability gate.** Rejected: measured to leak `"Onboarding: interactive (0 questions)"` onto the eighteen non-capable templates. The finding that forced the gate.
- **Capability default = `entry.icm?.enabled === true` (one conjunct).** Rejected: `minimal` is `icm: true` + `generate: false`, so it would start emitting an ICM tree — F1. Caught by mutation against the new CI pass.
- **Keep the `--icm` flag as a defaulted-on flag (`--no-icm` to suppress).** Rejected: preserves the flag surface the change exists to delete, keeps the `--help` cost, and leaves two sources of truth for a question the catalog answers.
- **Merge the two resolvers into one.** Rejected: they answer different questions from different sources; `upgrade` must not re-derive emission from a possibly-changed catalog.
- **Amend ADR-279 §2 in place.** Rejected: `INDEX.md`'s rule — a ratified ADR is amended by a follow-on ADR and never edited in place. Supersession by follow-on is the corpus convention (`INDEX.md:359`).
- **Delete `icm-off.test.ts` when its premise died.** Rejected: the tests' *intent* (no flag ⇒ no ICM for non-capable templates) is still a live property; only its construction was stale. Guarding the property is better than removing the guard.

## Test Contract

Verified by the repository's own gates, not by tests authored to bless the output:

- `__tests__/icm-default.test.ts` — the resolver's truth table, including `minimal`'s `generate: false` conjunct and the unknown-template fail-closed case.
- `__tests__/icm-optin.test.ts` — the override still wins in both directions (`icm: true` on `minimal` emits; `icm: false` on `vertical:coding` suppresses).
- `__tests__/icm-off.test.ts` — repurposed (commit `be36438`): the non-capable templates remain ICM-free flaglessly.
- `examples/vertical-tour/vertical-tour.mjs` — the explicit-override pass (2/2 OK) **and** the default pass (20/20 OK, task 6.2), the latter falsified by dropping the `generate` conjunct: `minimal` then reports "default false but an ICM tree was emitted".
- `node scripts/healthcheck.mjs`, `node scripts/preflight.mjs` — the structural and release gates, unaffected.
- **Retired:** the byte-equality guarantee itself. Nothing asserts it any more, because nothing can — it was deliberately abandoned, and the replacement guarantee is capability preservation.

## References

- `docs/specs/02-spec-icm-default-on/` — spec, questions, task list, proofs
- ADR-279 — fork design: pin policy (§1), `--icm` opt-in (§2, superseded), `CLAUDE.md` ownership (§3, rationale amended), deviations (§4)
- ADR-281 — headless onboarding (`--answers` implied `--icm`; now redundant-but-harmless)
- ADR-282 — the seam smoke test, whose ADR-279 byte-equality claim is corrected here rather than edited there
- ADR-283, ADR-284 — the standalone determinations that retired the merge argument
- `packages/create-agent-harness/src/index.ts` (`resolveIcmDefault`, `useIcm`), `src/upgrade-cmd.ts` (`icmEnabled`), `src/walker.ts` (the `icm` gate)
- `crates/template-catalog/src/lib.rs` — the cross-language catalog assertion that keeps the capability data honest
- `docs/adrs/INDEX.md` — the amendment rule and the ADR-279 annotation updated by this ADR
