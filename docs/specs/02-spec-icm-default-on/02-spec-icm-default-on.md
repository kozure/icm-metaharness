# Spec 02 — `--icm` Promotion: ICM Default-On for ICM-Capable Templates

**Status:** DRAFT (Phase 1 — questions pending)
**Feature:** `create-agent-harness` CLI, ICM generation default
**Amends:** ADR-279 §"Alternatives considered" (which *rejected* "make `--icm` the default")
**Depends on:** Spec 01 (remove-ui-components) — COMPLETE
**Author:** alfred
**Date:** 2026-09-16

---

## 1. Problem Statement

ICM (the five-layer *Intent / Context / Memory* tree) is **opt-in**: a user must
pass `--icm`. Every other flag is ignored by templates that cannot emit it.

```
create-agent-harness my-bot --template vertical:coding            # 20 files, no ICM
create-agent-harness my-bot --template vertical:coding --icm      # 30 files, ICM tree
```

ADR-279 deliberately rejected defaulting this on: emitting a five-layer tree is a
*structural* commitment a first-time user should make knowingly. That reasoning
is now overtaken by three **measured** facts (§3):

1. Only **2 of 20** templates can emit ICM — `minimal` and `vertical:coding`, the
   only two carrying a `.icm/` overlay directory. For the other 18 the flag emits
   no files at all.
2. The capability marker **already exists** in `templates/catalog.json` (an `icm`
   block, `enabled: true`), so "which templates may default-on" is *already data*.
3. `--no-icm` **already exists and is already parsed**, so the opt-out seam is
   built.

The flip therefore changes *what the default resolves to* — not what the
generator is able to do.

## 2. Goal

A user who scaffolds an **ICM-capable** template without mentioning ICM gets ICM.
A user scaffolding a **non-capable** template is unaffected. A user who wants the
old behaviour keeps it exactly via `--no-icm`.

**Non-goal:** making non-capable templates ICM-capable. This spec governs the
default only.

## 3. Verified Current Behaviour

All of the following was measured against the built CLI, not recalled.

### 3.1 Flag parsing — `src/index.ts`

```ts
:225   } else if (a === '--icm')      { out.icm = true;  }
:227   } else if (a === '--no-icm')   { out.icm = false; }
:229   } else if (a === '--answers')  { ...; out.icm = true; }   // answers implies ICM
:1244  icm: args.icm === true,   // ADR-279 d2: ICM five-layer tree, default off
```

So after parsing there are **three** states: `true`, `false`, `undefined`.
`--no-icm` is already wired end-to-end — the opt-out escape hatch needs no new flag.

### 3.2 There is **no capability gate** — this is the central design fact

I expected (and my first draft wrongly assumed) that ICM was gated on the
template's catalog `icm.enabled`. **It is not.** ICM is decided in exactly two
places, both a bare flag check:

```ts
:694   let rendered = await walkTemplate(dir, vars, { strict: false, icm: opts.icm === true });
:855   if (opts.icm === true) {     // headless/interactive onboarding pass
```

`catalog.json`'s `icm.enabled` is consumed only by `validate.ts` (to check an
*already-emitted* tree's stage set). **Nothing in the scaffold path consults it.**

Non-capable templates are therefore no-ops for a *structural* reason, not a
declared one: `walker.ts:116,122` skips `.icm/` when `icm` is false, and when
`icm` is true there is simply **no `.icm/` directory to include** — so the overlay
merge (`walker.ts:69-92`) contributes nothing.

**Consequence:** the capability gate §5 needs must be *introduced*, not reused.

### 3.3 What the flag actually does — measured

| Template | Capable? | `--icm` effect on files |
|---|---|---|
| `minimal` | ✅ `.icm/` present | emits ICM tree |
| `vertical:coding` | ✅ `.icm/` present | +10 files → `CONTEXT.md`, `references/CONTEXT.md`, `stages/{01-plan,02-implement,03-test,04-review}/CONTEXT.md` + `output/.gitkeep` |
| other 18 | ❌ | **no file change** |

The 18 non-capable templates are byte-identical for files with and without
`--icm` (differences are only the pre-existing nondeterministic `generated_at`
stamp, which varies run-to-run even with *identical* args).

**But `--icm` is not a total no-op on non-capable templates — it changes stdout:**

```
# flagless, vertical:devops        # --icm, vertical:devops
Scaffolded …                        Scaffolded …
Files: 18                           Files: 18
Manifest: …                         Manifest: …
                                    Onboarding: interactive (0 questions)   ← spurious
```

This stray line is a real, if cosmetic, defect today, and it is the trap a
*naive* global flip (`opts.icm !== false`) would replicate across all 18
templates.

### 3.4 Consequence for `doctor`

`runIcmStructure` (`validate.ts:248-269`) decides ICM-ness from the **manifest's
file list** (`emitted.some(p => … p.startsWith('stages/'))`), not from the flag.
Absent `stages/`, it SKIPs with the detail string `'not generated with --icm'`.
Post-flip that string is actively wrong: absence will far more often mean
*"scaffolded before the flip"* or *"user passed `--no-icm`"*.

### 3.5 `upgrade` is already safe

`src/upgrade-cmd.ts` derives `icmEnabled` from **the harness's own manifest**,
not from the CLI flag. A flipped default therefore cannot mis-classify a
pre-flip harness. This is a *regression guard* (§3 SC6), not a fix.

## 4. Success Criteria

| # | Criterion | Verification |
|---|---|---|
| SC1 | `--template vertical:coding` (no ICM flag) emits the 10-file ICM tree (30 files) | file-set check; `doctor` → `icm-structure PASS` |
| SC2 | `vertical:coding --no-icm` reproduces **today's** flagless output exactly | byte-equality vs a pinned pre-flip baseline |
| SC3 | All 18 non-capable templates are unaffected — files **and stdout** | file-set diff empty; stdout has no `Onboarding:` line |
| SC4 | `--icm` on a non-capable template stays a no-op — files **and stdout** | as SC3 (today stdout leaks a spurious line; the flip should *fix* it) |
| SC5 | `doctor` on a default-on scaffold reports `icm-structure PASS`, not SKIP | `runIcmStructure` returns PASS |
| SC6 | `upgrade` on a pre-flip flagless harness still infers ICM from its manifest | upgrade-cmd unit test |
| SC7 | **No test is left silently vacuous** (§5) | test-review checklist |
| SC8 | Help text, ADRs and docs state the new default and the `--no-icm` escape | doc diff |

## 5. The Sharp Edge — tests that go silently vacuous

This is the reason the flip is a spec and not a one-line patch.

**`__tests__/icm-off.test.ts`** exists precisely to prove "no flag ⇒ no ICM". It
builds its flagless case by passing `icm: undefined` and asserts the result
matches a pinned upstream baseline. **After a capability-gated flip, `undefined`
resolves to `true` for `vertical:coding`** — so the test would compare an ICM
scaffold against an ICM scaffold, still pass, and prove nothing.

A vacuous test is worse than a failing one: it reports green while the invariant
it was written to defend has quietly died.

The same hazard appears in **`__tests__/scaffold-e2e.test.ts`** — the case
*`'leaves the same template byte-identical when the flag is absent'`* scaffolds
`vertical:coding` with no `icm` key and asserts `stages/` does **not** exist. That
assertion is *correct today* and must be re-pointed to `--no-icm`.

**Therefore the flip is only correct if these are re-pointed in the same change:**
`icm-off.test.ts` from `undefined` → explicit `false`, and the e2e byte-equality
case from "absent" → `--no-icm`. SC7 is a first-class criterion, not a footnote.

## 6. Proposed Design — capability-gated default-on

> Absent an explicit ICM flag, ICM is **on** iff the template declares
> `icm.enabled === true` in `templates/catalog.json`; **off** otherwise.
> An explicit `--icm` / `--no-icm` always wins.

```ts
// index.ts — replace the bare `args.icm === true` at :1244 and the two sites
// that consume it (:694, :855).
const capable = loadCatalog().find(t => t.id === args.template)?.icm?.enabled === true;
const useIcm  = args.icm === undefined ? capable : args.icm === true;
```

Because `loadCatalog()` already exists (`index.ts:134-136`), the resolver is a
lookup plus one ternary. `useIcm` is then threaded to `walkTemplate` (`:694`),
the onboarding gate (`:855`), and the scaffold opts (`:1244`).

This single expression satisfies SC1 (capable turns on), SC2 (`--no-icm` still
wins), and SC3/SC4 (non-capable stays `false` **even when `--icm` is passed**,
which additionally removes the stray `Onboarding:` line from §3.3).

### 6.1 Alternatives considered

| Alt | Shape | Why rejected |
|---|---|---|
| **A0 — global flip** | `opts.icm !== false` | Emits the spurious `Onboarding: interactive (0 questions)` line on all 18 non-capable templates (§3.3); breaks SC3/SC4 |
| **A1 — env/config opt-out** | `HARNESS_ICM=0` | A second invisible control plane for one boolean; `--no-icm` already exists |
| **A2 — deprecation window** | warn for N releases, flip later | The affected surface is 2 templates; a warning with no behaviour change buys little |
| **A3 — capability-gated (chosen)** | follows `icm.enabled` | Smallest change; reuses the existing marker; **also fixes** the §3.3 stdout leak |

## 7. Impact Surface

| File | Change |
|---|---|
| `src/index.ts` | new resolver; thread `useIcm` into `:694` (walk), `:855` (onboarding), `:1244` (opts); help text `:1185` |
| `templates/catalog.json` / `catalog.def.mjs` | none — the `icm.enabled` marker already exists (confirm `minimal`, Q3) |
| `src/validate.ts` | reword the `'not generated with --icm'` SKIP detail (§3.4) |
| `__tests__/icm-off.test.ts` | re-point flagless case → explicit `false` |
| `__tests__/scaffold-e2e.test.ts` | byte-equality case → `--no-icm` |
| `__tests__/icm-optin.test.ts` | add default-on assertions + the no-stray-stdout case |
| `docs/adrs/` | supersede ADR-279's rejected alternative (§Q5) |
| `README.md` / docs | document the default and the escape hatch |

## 8. Open Questions (Phase 1 gate — these block Phase 2)

Each carries my recommendation.

**Q1 — Which templates default-on: `vertical:coding` only, or also `minimal`?**
*Recommendation:* `vertical:coding` only. `minimal` is the template whose *name
promises* the smallest output; its catalog entry has `generate: false` and the
vertical tour deliberately excludes it. Flipping it changes what "minimal" means.
Note `minimal` **does** carry a `.icm/` overlay, so it is genuinely capable —
this is a policy choice, not a limitation.

**Q2 — Clean flip, or a deprecation window?**
*Recommendation:* clean flip, plus a one-line `--no-icm` note in the scaffold
output. The exposed surface is one template and `--no-icm` preserves the old path
exactly. Say the word if you'd rather have a warning release.

**Q3 — The resolver's predicate: `icm.enabled` alone, or `generate !== false && icm.enabled`?**
`minimal` is `icm.enabled: true` **and** `generate: false`. If Q1 is "coding
only", the predicate needs two conjuncts. *Recommendation:* the two-conjunct form
— it encodes "capable *and* default-generated here" and makes Q1 fall out of the
data rather than a special case. **Please confirm**, since it decides whether the
resolver is one condition or two.

**Q4 — Reword `doctor`'s SKIP detail?**
Today: `'not generated with --icm'`. Post-flip, absence usually means *pre-flip*
or *`--no-icm`*. *Recommendation:* reword to name both causes — cheap, and the
current string would mislead exactly the people most likely to read it.

**Q5 — Supersede ADR-279 in place, or write ADR-280?**
*Recommendation:* new **ADR-280** citing 279. `INDEX.md`'s own rule is that a
ratified ADR is amended by a follow-on ADR, never edited in place — and here the
*reasoning trail* matters: we considered this, rejected it, and later reversed it
on new data. Editing 279 would erase that.

**Q6 — Version/changelog posture?**
`minor` (behaviour change, pre-1.0) or a `major` signal? *Recommendation:*
`minor`, with the changelog entry *leading* with the behaviour change, since
`--no-icm` preserves the old path exactly.

**Q7 — Should the flip also silence the "8 ICM placeholder(s) left for setup" note?**
A default-on capable scaffold will now always print the residual list — and 3 of
those 8 entries (`?SUBAGENT_HANDOFF`, `/SUBAGENT_HANDOFF`, `?FIX_LOOP`) are
*conditional markers*, which the vertical-tour gate explicitly treats as
legitimate, not placeholders. So the note currently miscounts. Not caused by the
flip, but the flip makes it visible on every capable scaffold.
*Recommendation:* out of scope for this spec — raise as a follow-up — unless you
want it folded in, in which case it becomes SC9.

## 9. Not In Scope

- The three option-C gaps (openclaw `doctor` false-issue; `examples-quickstart`
  deterministic fail; 2 stale `publish.yml` assertions) — tracked separately.
- Making non-capable templates ICM-capable.
- `upgrade` / `eject` inference logic (§3.5 already correct).
- The §Q7 residual-count wart, pending your call.
