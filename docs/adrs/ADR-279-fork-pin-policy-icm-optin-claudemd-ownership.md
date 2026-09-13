# ADR-279: Fork design — pinned upstream baseline, `--icm` opt-in emission, and single authorship of root `CLAUDE.md`

- **Status**: Accepted — implemented by `docs/specs/01-spec-icm-generator-emission/` (spec, tasks, audit PASS); fork bootstrap tasks 1.1–1.12.
- **Date**: 2026-09-12
- **Deciders**: Chris (kozure) — fork owner; direction ratified during SDD Phase 1 (8 answers, 2026-09-11); re-pin ruled 2026-09-12.
- **Tags**: fork, pin-policy, icm, harness-generator, claude-md-ownership, upstream-drift, process
- **Extends**: ADR-002 (kernel boundary), ADR-008/ADR-012 (manifest drift + eject), ADR-277 (autogenous metaharness adapter)
- **Related**: ADR-277 (pin), upstream `ruvnet/metaharness` @ `d5833dc`
- **Prompted by**: the fork bootstrap (Phase 5, tasks 1.1–1.12) of the ICM generator-emission feature against a pinned upstream baseline.

---

## Context

This repository is a **standalone fork** of `ruvnet/metaharness` (`kozure/icm-metaharness`) built to add **ICM (Intent-Contract-Model) harness emission** to the generator: a `--icm` flag that emits a staged, five-layer-routed harness (Layer 0 `CLAUDE.md` → Layer 1 `CONTEXT.md` → Layer 2 stage `CONTEXT.md` → Layer 3 `references/` → Layer 4 working artifacts) alongside the harness the generator already produces.

Three fork-level decisions had to be recorded before any fork code lands, because each one is expensive to reverse later and each one shapes the merge surface with upstream:

1. **Where the fork's baseline sits**, and how it is kept honest as upstream moves. Upstream publishes npm releases **without cutting git tags** (the pinned baseline is npm `0.4.16` while the newest upstream tag is `v0.4.5`), so "which commit is our baseline" is not answerable from tags and the drift surface is real: during bootstrap, upstream `main` advanced `42f568b` → `d5833dc` (+4/−0) and the originally ratified pin went stale.
2. **Whether `--icm` is on by default.** The fork exists to be merged upstream if it proves out; an always-on flag makes that merge a behaviour change for every existing consumer.
3. **Who writes root `CLAUDE.md`.** The generator's host adapter (`host-claude-code`) already emits a root `CLAUDE.md`, and ICM introduces a *router* variant for the same path. Two writers of one path is a correctness hazard, not a style question.

Two further requirements in the spec's Unit 2 **cannot be implemented as literally written**, because of how upstream emission actually works at the pin. A third deviation (the gating mechanism) was discovered during implementation, when the first cut of the ICM payload — plain files in the template dir — silently broke decision 2. All three are recorded below as explicit deviations with faithful equivalents.

## Decision

### 1. Pin policy — pin the commit whose package version equals npm `latest`

The fork is pinned to a **specific upstream commit**, recorded durably in `.fork-pin` at the repo root (40-hex sha + trailing newline) and checked against `git log -1 --format=%H fork/main`.

**Re-sync criterion:** re-sync when upstream has a commit whose `packages/create-agent-harness/package.json` `version` equals npm's current `latest` — **not** a tag. Upstream `main` sitting ahead of the pin with unreleased commits is **not itself a re-sync trigger**; that is exactly how the previous pin went stale.

**Topology:** the fork is a **clone with shared history**, not the GitHub fork button:

- `upstream` → `ruvnet/metaharness`, with its **push URL set to `DISABLED`** (fetch-only, so a stray push cannot reach upstream).
- `origin` → `kozure/icm-metaharness`, a **standalone public repository, not a GitHub fork object** (`"fork": false`). A GitHub fork's visibility is tied to the upstream network; a standalone repo does not inherit it.
- Exactly one long-lived branch, `fork/main`, so a re-sync is a single `git merge` and upstream commits stay ancestors (fast-forwardable).

**Rationale:** the pin's authority comes from the *package version*, which is the artifact consumers install. `.fork-pin` is the machine-checkable form of that claim; `FORK-RESYNC.md` (task 1.11) is the named manual procedure that reads it. Automation is deliberately out of scope (Open Question 2, resolved).

**Current pin: `d5833dc6512ac1adeeef91a331c29055cd8a4dbb`** (npm `0.4.16`), superseding `42f568b7297c59065ea562247937bb25cd353a6a`. The package version is unchanged across the move, and **zero build-path files** changed (walker / index / catalog / gen-templates / templates / validate / renderer / manifest / host-config / upgrade), so the re-pin did not alter the code the feature builds against.

### 2. `--icm` is opt-in, and off by default

Emission is gated on an explicit `--icm` flag. **With the flag absent, the rendered file set must be byte-identical to upstream-at-pin output** — same content, same order, same manifest.

**Rationale:** the fork's value proposition is a merge, not a divergence. An always-on flag converts every existing consumer's scaffold into a different artifact and makes the upstream merge a behaviour change; opt-in keeps the merge surface to additive code behind one branch. It also makes the guarantee testable in the strongest available form: byte-equality (`icm-off.test.ts`).

### 3. The ICM router owns root `CLAUDE.md` — exactly one author

Under `--icm`, the ICM **router** variant is the single author of root `CLAUDE.md`. The competing writer is **suppressed** — see the implementation note immediately below for how, and why not by editing `claudeMd()` as task 2.11 originally specified.

The router keeps the existing Mustache header (`{{name}}`, `{{description}}`) so the non-strict renderer's contract is unchanged, and contains **no** `{{SCREAMING_SNAKE_CASE}}` placeholders — Layer 0 must work before onboarding runs. (Per `_core/placeholder-syntax.md`, such placeholders may appear in Layer 1 and its routing tables only as Inputs-table values, and never in `CLAUDE.md` or the top-level routing structure.)

**Rationale:** two writers of one path means last-writer-wins, which is nondeterministic across emission order and silently discards one of them. Suppression makes authorship explicit rather than incidental. Asserting *both* directions (nothing under `--icm`, unchanged output without) pins the property.

**Implemented at the collision point, not by suppressing `claudeMd()` (2026-09-12).** Investigation showed task 2.11's premise does not hold in the scaffold path: `hostConfigFiles('claude-code')` returns `[]` ("templates own the `.claude/` tree"), and `packages/create-agent-harness` never imports `host-claude-code` — only `packages/bench` does. `claudeMd()` is therefore never called during a scaffold, so suppressing it would be speculative complexity guarding a path that cannot execute. The single-author property is instead enforced where the collision *can* occur: the walker's `.icm/` overlay wins any path collision with the template's own files (see Deviation B, realized), so exactly one author of root `CLAUDE.md` exists in each mode — the template's own `CLAUDE.md.tmpl` when the flag is off, the overlay router when it is on.

### 4. Architectural deviations (faithful equivalents, not literal implementations)

**Deviation A — "manifest-only emission" / manifest rows as the emission vehicle → emit through the standard walk path.** Upstream emission is directory-walk based: `src/walker.ts` recurses `templates/<id>/`, renders `.tmpl` files and drops the suffix, and **explicitly skips `manifest.json`**; `scaffold()` walks exactly one root resolved by `templateDir()`. A manifest row pointing outside that root is never read, so manifest rows cannot be the emission vehicle. *Equivalent:* emit ICM artifacts through the existing `walkTemplate()` path, so the file map, `unresolved[]` capture, and manifest fingerprinting all work unchanged and `.harness/manifest.json` (the ADR-008/ADR-012 drift + eject record) naturally covers the ICM files.

**Deviation B — a shared `templates/_icm/` directory → single-source the content as data in `templates/catalog.def.mjs`.** The walker has no include/overlay concept and `TEMPLATES_ROOT = resolve(__dirname, '..', 'templates')` is a hardcoded single root that is also what the npm tarball ships, so a shared directory cannot be emitted. *Equivalent:* single-source the ICM content as data in `templates/catalog.def.mjs` (the documented canonical source of truth) and have `gen-templates.mjs` emit it per `generate:true` template. Generated directories are never hand-edited, and the stage list has exactly one encoding.

**Realized (2026-09-12): the payload is emitted into a gated `.icm/` overlay subtree.** The first implementation took "single-source as data, emit per `generate:true` template" to mean *plain files in the template dir* — which silently broke decision 2, because `walkTemplate()` recurses the whole dir and emits everything it finds. A flagless `scaffold('vertical:coding')` therefore produced 31 files (upstream: 21) and a router `CLAUDE.md` instead of upstream's banner. The gate is the missing piece, and it is implemented as a reserved `.icm/` subtree inside the owned template dir:

- `walkTemplate()` gains `icm?: boolean`. A flagless walk skips the subtree entirely; an opted-in walk includes it, strips the prefix (`.icm/CONTEXT.md` → `CONTEXT.md`) and lets it **win any path collision** with the template's own files.
- The template root therefore keeps upstream's `CLAUDE.md.tmpl` untouched, and the router lives *only* in the overlay. One payload, two modes, one author per mode.

This keeps the FR's "no post-walk emitter" constraint satisfied — the files still ride the standard walk, so `.harness/manifest.json` covers all 10 of them and `harness upgrade` treats them as managed rather than drift — while making the payload invisible to a flagless walk. A consequence worth recording: the per-template `manifest.json` no longer carries ICM rows, because the overlay is not part of that template's flagless output. Nothing in `src/` reads that file (the walker explicitly skips it; only a plugin-coverage test inspects a row), so this costs nothing and keeps the file upstream-identical.

**Deviation C — "all ICM files shall be emitted through template manifest rows only" → emitted through the walk with `manifest.json` kept as an accurate flagless index.** Same root cause as Deviation A: manifest rows are metadata, not the emission vehicle. The drift-detection requirement the FR is actually after is met by `.harness/manifest.json` at scaffold time, verified by diffing a `--icm` scaffold's manifest against its `find` output.

Both deviations are **subtractive**: each replaces an unemittable mechanism with the mechanism upstream already uses for the same purpose, rather than adding a parallel one.

## Consequences

- **The pin is machine-checkable and human-explained.** `.fork-pin` gives one-line verification; `FORK-RESYNC.md` gives the criterion and the mechanics. Staleness is detected by comparison, not memory.
- **A re-sync is a fast-forwardable `git merge`**, because history is shared. The cost is that the fork must never be re-cloned from the GitHub fork button — the topology is load-bearing.
- **Upstream's `v*.*.*` tags are never pushed.** They exist in the clone, and `publish.yml` triggers on tags; `git push --tags` and `git push --all` are therefore forbidden, and `fork/main` is pushed by explicit name.
- **Byte-equality without `--icm` is a hard constraint**, so any fork change that perturbs default output is a defect, even if ICM itself is correct.
- **Single authorship is enforced at the collision point**, in the walker's overlay precedence rather than by suppressing `claudeMd()`. That function is not in the scaffold path, so the walker is where two candidate `CLAUDE.md`s can actually meet; the overlay wins, deterministically. Task 2.11's test is recorded as not-applicable rather than silently skipped.
- **The `.icm/` overlay is the gating mechanism, so it is load-bearing.** Anything parked directly in a template dir is emitted unconditionally — the leak that made a flagless scaffold non-identical. A future contributor adding ICM content must place it under `.icm/`, and `.icm/` must remain the walker's only reserved directory name.
- **The two deviations trade literal spec text for emittable mechanisms.** They are documented here and at the top of the task list rather than silently reworded, so a future reader can see what the spec asked for and why the equivalent was chosen.
- **New upstream workflows arrive active.** A re-sync reintroduces upstream's CI set, so the task-1.7 disposition (`publish.yml`, `pages.yml`, `proxy-pin-drift.yml`, `published-smoke.yml`, `pages-monitor.yml` disabled; `draco.yml`'s scheduled judged cadence removed; `ci.yml` and `security.yml` kept) must be re-verified after every re-sync. Each workflow file carries a disposition header recording its intended state.

## Alternatives Considered

- **Use the GitHub fork button.** Rejected: visibility is tied to the upstream network (upstream is public, so the fork would be public with no way to make it private), and it does not preserve the `merge-base` discipline as cleanly as an explicit clone-and-remote setup.
- **Pin by git tag.** Rejected: upstream publishes npm releases without cutting tags, so the newest tag (`v0.4.5`) trails the published version (`0.4.16`). A tag-based criterion would never fire and would silently pin stale code.
- **Make `--icm` the default.** Rejected: it makes the upstream merge a behaviour change for every consumer and destroys the byte-equality guarantee that currently makes "we changed nothing by default" testable.
- **Let both writers emit root `CLAUDE.md` and resolve by order.** Rejected: last-writer-wins is nondeterministic and silently discards content; the hazard is exactly what the FR exists to prevent.
- **Delete the hazardous workflows rather than disable them.** Rejected (task 1.7 requirement): disabling by edit keeps the fork diff minimal and keeps the upstream merge clean; deleting files makes every future re-sync conflict.
- **Create a literal `templates/_icm/` shared directory.** Rejected: the walker has no overlay concept and `TEMPLATES_ROOT` is a single hardcoded root, so it is not emittable (Deviation B).
- **Automate re-sync.** Deliberately out of scope (Open Question 2): the criterion involves a judgement about unreleased upstream commits, and a named manual procedure is auditable where a bot is not.

## Test Contract

**Status (2026-09-12): the two merge-safety guarantees are verified by direct measurement; the named test files below are not yet written (task 3.5 / 5.x remain).**

Verified by scaffold-level measurement against upstream-at-pin (`d5833dc`), not yet by committed test:

- **No-flag byte-identity (decision 2).** Scaffolding `vertical:coding` on upstream-at-pin and on the fork yields an identical 21-file set and identical per-file content hashes; the only differing byte is `.harness/manifest.json`'s wall-clock `generated_at`. The 10-file ICM delta appears only under `--icm`.
- **Single authorship of root `CLAUDE.md` (decision 3).** Under `--icm` the emitted `CLAUDE.md` is the router: it renders `{{name}}`/`{{description}}` and contains **zero** `{{SCREAMING_SNAKE_CASE}}` placeholders with `unresolved == []`. Flag off, the same file is upstream's banner, byte-identical.
- **Placeholder survival (task 2.9 second half).** Stage contracts are plain copies, so `{{PROJECT_GOAL}}` survives verbatim for the onboarding pre-fill, while the router — a `.tmpl` — does not carry such placeholders at all.
- **Manifest coverage (task 3.3).** `.harness/manifest.json` lists all 10 ICM paths via the standard walk, with no schema change and `hosts`/`meta` untouched.
- **Idempotence (task 2.7).** Two consecutive `npm run gen:templates` runs are byte-identical across `templates/` and the web-ui catalog.
- **Regression gates.** `create-agent-harness`: 572 passed / 0 failed, no test edited. Repo-wide: 22 failures, all inherited — against a pristine upstream-at-pin clone (27 failures) the change introduces **zero** new failures. `.icm/` ships in the npm tarball (11 files), so dotdirs survive the packlist.

`packages/create-agent-harness/__tests__/icm-off.test.ts` (new, task 3.5 — NOT YET WRITTEN):
- A no-flag scaffold is **byte-identical** to upstream-at-pin output for the same template and host — same content, same order, same manifest. This is the merge-safety guarantee for decision 2. The measurement above is the manual form of this test; the committed form is outstanding.

`packages/create-agent-harness/__tests__/icm-scaffold.test.ts` (new):
- The emitted stage set equals `catalog.icm.stages` **exactly** — asserting the stage list is single-sourced in the catalog (Deviation B) rather than encoded twice.
- For every stage, `CONTEXT.md` and `output/.gitkeep` are present, plus a **single root** `references/CONTEXT.md` and **no** per-stage `references/` directories (the amended Unit 2 shape).

`packages/host-claude-code/__tests__/host-config.test.ts` (extended, task 2.11):
- **Not applicable as written.** `claudeMd()` is never called in the scaffold path (`hostConfigFiles('claude-code')` returns `[]`; `create-agent-harness` does not import `host-claude-code`). The property it was meant to pin — one author of root `CLAUDE.md` — is enforced in the walker's overlay precedence and covered by the byte-identity measurement above. Adding the test would assert a path that cannot execute.

`packages/create-agent-harness/__tests__/validate.test.ts` (extended):
- The `icm-structure` check reports `PASS`/`WARN`/`SKIP` as named outcomes; a scaffold missing a required ICM artifact is caught.

`packages/create-agent-harness/__tests__/scaffold-e2e.test.ts` (extended):
- End-to-end `--icm` scaffold emits the router `CLAUDE.md` with `{{name}}`/`{{description}}` rendered while every `{{SCREAMING_SNAKE_CASE}}` placeholder survives verbatim (the non-strict renderer leaves unknown vars in place — that is the mechanism, not a bug).

Driver assertions (task 5.11–5.13):
- Typed structured output replaces tail-scrape; a permission-denial path is asserted; and the driver **never** passes `--bare` for harness runs (`--bare` skips discovery of `CLAUDE.md`, `.claude/`, skills, and subagents — precisely the content an ICM harness *is*), with the validated CLI version recorded in the driver header.

Fork-level verification (task 1.6 / 1.12, not a unit test):
- `ci.yml` goes green on the fork (Rust ×3-OS, WASM ×3-OS, Node jobs), and `gh workflow list --all` matches the task-1.7 disposition exactly — `ci.yml` and `security.yml` still enabled.

## References

- `docs/specs/01-spec-icm-generator-emission/01-spec-icm-generator-emission.md`, `01-tasks-icm-generator-emission.md`, `01-audit-icm-generator-emission.md`
- `FORK-RESYNC.md`, `.fork-pin` (this repository)
- `docs/adrs/ADR-000-...md` (kernel boundary; ADR-002 in the upstream series), ADR-008/ADR-012 (manifest drift + eject)
- `docs/adrs/ADR-277-autogenous-metaharness-adapter.md` (the ADR immediately preceding; pin is 277, hence 279 — **ADR-278 is taken** by `ADR-278-darwin-tier2-sandbox-gate-closure.md`)
- Upstream: `ruvnet/metaharness` @ `d5833dc6512ac1adeeef91a331c29055cd8a4dbb`; `packages/create-agent-harness/{src/walker.ts,src/index.ts,src/validate.ts,src/renderer.ts,scripts/gen-templates.mjs,templates/catalog.def.mjs}`
- `_core/CONVENTIONS.md`, `_core/placeholder-syntax.md` (ICM conventions, read in task 2.1)
