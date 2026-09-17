# Pre-removal ICM baseline fixture

Captured by sub-task **5.1** of `docs/specs/02-spec-icm-default-on/`.

**What this is.** The `.harness/manifest.json` of a `vertical:coding` harness
scaffolded with ICM emission **off** — i.e. the behaviour that existed *before*
ADR-285 made ICM follow the template's capability. Its recorded file map
contains **no** ICM paths (no `CONTEXT.md`, `references/CONTEXT.md`, or
`stages/**`), which is the property the fixture exists to preserve.

**Provenance.**

- Captured at HEAD `f59fbe7` (`vertical:coding`, generator `0.0.0`).
- Produced through the internal `scaffold({ icm: false })` override. That
  override *is* the pre-flip behaviour: post-ADR-285 the CLI no longer supplies
  it (task 2.4), so it is reachable only from the library, which is exactly what
  a baseline needs — a faithful pre-removal render, not a hand-authored
  approximation.
- `generated_at` was replaced with `"MASKED"`. The field is a wall-clock stamp,
  not content, and a real timestamp would make the fixture churn on every
  capture (the same masking `onboarding.test.ts` applies to scaffolds).
- 19 files recorded, 0 of them ICM paths.

**Why a manifest and not a whole tree.** `upgradeCmd` reads the manifest to
decide what the harness *emitted* (`icmEnabled`, `upgrade-cmd.ts:56`) and
re-renders the **current** template to compute drift. It never reads the
harness's own file contents to decide ICM-ness, and absent on-disk files simply
classify any change as `clean` rather than `conflict`. Committing 19 rendered
files would add rot for no assertion the manifest does not already support.

**Precedent.** Spec 01's `arc-pre-removal-tools.json` — a committed baseline is
what makes the claim auditable rather than asserted.
