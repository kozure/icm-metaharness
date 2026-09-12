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

Two further requirements in the spec's Unit 2 **cannot be implemented as literally written**, because of how upstream emission actually works at the pin. Both are recorded below as explicit deviations with faithful equivalents.

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

Under `--icm`, the ICM **router** variant is the single author of root `CLAUDE.md`. The competing writer is **suppressed**: `packages/host-claude-code`'s `claudeMd()` must emit **nothing** when `--icm` is enabled, and must be an unchanged no-op when the flag is off (task 2.11).

The router keeps the existing Mustache header (`{{name}}`, `{{description}}`) so the non-strict renderer's contract is unchanged, and contains **no** `{{SCREAMING_SNAKE_CASE}}` placeholders — Layer 0 must work before onboarding runs. (Per `_core/placeholder-syntax.md`, such placeholders may appear in Layer 1 and its routing tables only as Inputs-table values, and never in `CLAUDE.md` or the top-level routing structure.)

**Rationale:** two writers of one path means last-writer-wins, which is nondeterministic across emission order and silently discards one of them. Suppression makes authorship explicit rather than incidental. Asserting *both* directions (nothing under `--icm`, unchanged output without) pins the property.

### 4. Architectural deviations (faithful equivalents, not literal implementations)

**Deviation A — "manifest-only emission" / manifest rows as the emission vehicle → emit through the standard walk path.** Upstream emission is directory-walk based: `src/walker.ts` recurses `templates/<id>/`, renders `.tmpl` files and drops the suffix, and **explicitly skips `manifest.json`**; `scaffold()` walks exactly one root resolved by `templateDir()`. A manifest row pointing outside that root is never read, so manifest rows cannot be the emission vehicle. *Equivalent:* emit ICM artifacts through the existing `walkTemplate()` path, so the file map, `unresolved[]` capture, and manifest fingerprinting all work unchanged and `.harness/manifest.json` (the ADR-008/ADR-012 drift + eject record) naturally covers the ICM files.

**Deviation B — a shared `templates/_icm/` directory → single-source the content as data in `templates/catalog.def.mjs`.** The walker has no include/overlay concept and `TEMPLATES_ROOT = resolve(__dirname, '..', 'templates')` is a hardcoded single root that is also what the npm tarball ships, so a shared directory cannot be emitted. *Equivalent:* single-source the ICM content as data in `templates/catalog.def.mjs` (the documented canonical source of truth) and have `gen-templates.mjs` emit it per `generate:true` template. Generated directories are never hand-edited, and the stage list has exactly one encoding.

Both deviations are **subtractive**: each replaces an unemittable mechanism with the mechanism upstream already uses for the same purpose, rather than adding a parallel one.

## Consequences

- **The pin is machine-checkable and human-explained.** `.fork-pin` gives one-line verification; `FORK-RESYNC.md` gives the criterion and the mechanics. Staleness is detected by comparison, not memory.
- **A re-sync is a fast-forwardable `git merge`**, because history is shared. The cost is that the fork must never be re-cloned from the GitHub fork button — the topology is load-bearing.
- **Upstream's `v*.*.*` tags are never pushed.** They exist in the clone, and `publish.yml` triggers on tags; `git push --tags` and `git push --all` are therefore forbidden, and `fork/main` is pushed by explicit name.
- **Byte-equality without `--icm` is a hard constraint**, so any fork change that perturbs default output is a defect, even if ICM itself is correct.
- **Suppression is two-directional**: the host adapter must be silent under `--icm` *and* unchanged without it. A one-directional fix would either leak a second writer or regress non-ICM output.
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

`packages/create-agent-harness/__tests__/icm-off.test.ts` (new):
- A no-flag scaffold is **byte-identical** to upstream-at-pin output for the same template and host — same content, same order, same manifest. This is the merge-safety guarantee for decision 2.

`packages/create-agent-harness/__tests__/icm-scaffold.test.ts` (new):
- The emitted stage set equals `catalog.icm.stages` **exactly** — asserting the stage list is single-sourced in the catalog (Deviation B) rather than encoded twice.
- For every stage, `CONTEXT.md` and `output/.gitkeep` are present, plus a **single root** `references/CONTEXT.md` and **no** per-stage `references/` directories (the amended Unit 2 shape).

`packages/host-claude-code/__tests__/host-config.test.ts` (extended, task 2.11):
- `claudeMd()` emits **nothing** when `--icm` is enabled — the ICM router is the single author of root `CLAUDE.md` (decision 3).
- `claudeMd()` output is **unchanged** when the flag is off — the suppression is a no-op, and default host output stays byte-identical to upstream.

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
