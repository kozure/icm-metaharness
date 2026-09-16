# Task 01 Proofs — ICM follows the template: capability default with a surviving override

## Task Summary

This task replaces the two `--icm` flag checks in `scaffold()` with a single
capability-derived resolution (`resolveIcmDefault`), so ICM emission follows the
*template* rather than a flag the user must remember. The resolution happens
**once** and both consumers (the template walk and the onboarding gate) reuse it.

Two design constraints shaped the implementation, and both are load-bearing:

- **`minimal` must stay ICM-free *by default* but remain *emittable*.** It is
  `generate: false` yet carries a 3-stage ICM tree, and four internal callers pass
  `icm: true` to reach it. A bare capability default makes its tree unreachable by
  any path and reddens the CI tour — so the capability supplies the **default** and
  an explicit internal argument supplies the **override**.
- **The manifest-derived gate in `upgrade-cmd.ts` must survive untouched.** It
  answers a different question (*what did this harness emit?*) than the capability
  resolver (*what should this template emit?*), and merging them would retro-add
  ICM files to pre-existing harnesses on upgrade.

## What This Task Proves

- A **flagless** scaffold of a capable template (`vertical:coding`) emits the full
  five-layer ICM tree, and the tree passes `icm-structure` validation.
- A **flagless** scaffold of a non-capable template (`vertical:devops`) is
  unchanged in files *and* runs no onboarding pass — the leak the naive global flip
  caused is closed at the level where it is observable.
- An explicit `icm: true` still emits `minimal`'s hand-authored tree, and an
  explicit `icm: false` still suppresses the tree on a capable template — the
  override wins in **both** directions.
- The CI tour (`vertical-tour.mjs`, the iter-88 gate) stays green, `2/2 ICM trees OK`.
- Four independent mutations each turn the new guards red, so the guards are not
  vacuous.

## Evidence Summary

| Artifact | Result |
|---|---|
| CLI flagless non-capable (`vertical:devops`) | exit 0, `Files: 19`, **no** `Onboarding:` line |
| Library flagless capable (`vertical:coding`) | 31 files, stages `01-plan 02-implement 03-test 04-review`, `interactive (6 questions)` |
| `harness validate` on that flagless capable harness | `PASS icm-structure — five-layer shape ok (4 stages)` |
| Override matrix | `minimal` flagless → none; `minimal` `icm:true` → 3 stages; `coding` flagless → 4 stages; `coding` `icm:false` → none |
| New guard suite | `9 passed` |
| Mutation (a) resolver→`false` | 3 red |
| Mutation (b) resolver→`true` | 3 red |
| Mutation (c) override dropped | 2 red here + 2 red in `icm-optin` + CI tour `1/2 OK` |
| CI tour (unmutated) | `19/19 verticals HEALTHY, 2/2 ICM trees OK` |
| Full package suite | 654 passed, 7 failed (all seven are the documented premise-dies tests — task 3.0's remit) |

## Artifact: One resolver, resolved once, reused by both consumers

**What it proves:** ICM-ness is decided in a single place from catalog data, and both consumers of that decision share the value — they cannot disagree.

**Why it matters:** The two flag checks (`index.ts:694`, `:855`) were the entire
surface of the old design. Replacing them with one value is the change; resolving
twice would reintroduce the same class of bug in a new shape.

**Artifact path:** `packages/create-agent-harness/src/index.ts`

The predicate encodes Q1's decision as catalog data rather than a hard-coded id
check. Note `generate !== false` is the conjunct that excludes `minimal`:
`minimal` and `vertical:coding` **both** declare `icm.enabled === true`, so the
second conjunct is what separates them.

```ts
export function resolveIcmDefault(templateId: string): boolean {
  const entry = loadCatalog().find(t => t.id === templateId);
  if (!entry) return false; // fail-closed: unknown template emits no ICM
  return entry.icm?.enabled === true && entry.generate !== false;
}
```

**Result summary:** Resolving once and reusing the value for both the walk
(`:754`) and the onboarding gate (`if (useIcm)`) means the emitted tree and the
onboarding pass can never disagree about the same harness.

```ts
const useIcm = opts.icm ?? resolveIcmDefault(opts.template);
let rendered = await walkTemplate(dir, vars, { strict: false, icm: useIcm });
```

## Artifact: Flagless capable scaffold emits the tree, and it validates

**What it proves:** The new default actually works — no flag needed, and the emitted tree satisfies the catalog's declared stage set.

**Why it matters:** This is the entire point of the change. It is also the
artifact `vertical-tour.mjs`'s ICM pass structurally cannot produce, because that
pass scaffolds with an explicit `icm: true` to check per-template emission.

**Command:**

~~~bash
node -e "...scaffold({template:'vertical:coding', ...no icm key})"
harness validate <that dir>
~~~

**Result summary:** 31 files emitted, stages `01-plan 02-implement 03-test
04-review`, onboarding `interactive (6 questions)`; `validate` reports
`PASS icm-structure — five-layer shape ok (4 stages)`.

~~~text
flagless capable -> files: 31
stages: 01-plan  02-implement  03-test  04-review
onboarding: interactive (6 questions)

  PASS icm-structure — five-layer shape ok (4 stages); 4 residual placeholder(s):
       BUILD_COMMAND, PROJECT_GOAL, REVIEW_FOCUS, TEST_COMMAND
~~~

The 4 residual placeholders are recorded here because task 5.4 measures this
number; note it counts **markers**, not questions, which is exactly the
distinction task 5.0 exists to fix.

## Artifact: Non-capable path is unchanged — files and stdout

**What it proves:** The 18 non-capable templates behave exactly as before; the naive global flip's `Onboarding:` leak is closed.

**Why it matters:** `opts.icm !== false` (a bare flip) made every non-capable
template announce `Onboarding: interactive (0 questions)` — a workflow with no ICM
content behind it. This is the regression the capability gate exists to prevent.

**Command:**

~~~bash
node dist/bin.js my-bot --template vertical:devops --force
~~~

**Result summary:** exit 0, `Files: 19`, and **no** `Onboarding:` line.

~~~text
Scaffolded my-bot into .../my-bot
Files: 19
Manifest: .../my-bot/.harness/manifest.json
~~~

**Honest caveat (found while falsifying):** the *CLI* form of this assertion
cannot fail on a broken resolver yet, because the CLI still passes
`icm: args.icm === true` explicitly (that passthrough is removed in task 2.4), and
an explicit `false` masks the resolver on every CLI run. Mutation (b) confirmed
this: the CLI stayed silent while the **library** correctly leaked
`onboarding: "interactive"`. The guard therefore asserts `result.onboarding ===
undefined` at the library level, where the capability default is live today, with
the CLI/stdout assertion kept as the user-visible surface. Both are in
`__tests__/icm-default.test.ts`.

## Artifact: The override wins in both directions

**What it proves:** An explicit `icm` argument overrides the capability default — `true` emits, `false` suppresses.

**Why it matters:** Without `true`-on-`minimal`, `minimal`'s ICM generation is
unreachable by any path (its `generate: false` makes the default `false`); without
`false`-on-capable, an override honoured only in the `true` direction would pass
every other assertion and silently be a one-way switch.

**Command:** `node /tmp/ev3.mjs` (scaffold matrix, `stages/` listing)

**Result summary:** The matrix is correct in all four cells.

~~~text
{ tpl: 'minimal',         icm: 'undefined', stages: '(none)' }
{ tpl: 'minimal',         icm: 'true',      stages: '01-plan,02-build,03-verify' }
{ tpl: 'vertical:coding', icm: 'undefined', stages: '01-plan,02-implement,03-test,04-review' }
{ tpl: 'vertical:coding', icm: 'false',     stages: '(none)' }
~~~

## Artifact: The CI gate stays green

**What it proves:** The resolution change does not break the iter-88 tour gate, and `minimal` still emits under the explicit override.

**Why it matters:** This was the concrete risk of the change — the tour's ICM pass
scaffolds `catalog.filter(t => t.icm)`, which **includes `minimal`**, so a
capability default that discarded the override would redden every push.

**Command:** `node examples/vertical-tour/vertical-tour.mjs`

**Result summary:** exit 0, both ICM trees OK.

~~~text
## ICM pass (`--icm` scaffold, checked against the catalog block)

| Template | stages | icm tree |
|----------|--------|----------|
| `minimal` | 4 | OK |
| `vertical:coding` | 5 | OK |

ICM pass: 2/2 OK.
[vertical-tour] DONE — 19/19 verticals HEALTHY, 2/2 ICM trees OK
~~~

## Artifact: Mutation falsification — the guards actually gate

**What it proves:** Each of the three failure modes the design guards against turns the suite red; the guards are not passing vacuously.

**Why it matters:** ADR-279's own standard is that a gate must be shown to go red.
A guard that cannot fail is documentation, not a gate.

**Command:** mutate `src/index.ts`, `npm run build`, `npx vitest run __tests__/icm-default.test.ts`

**Result summary:**

| Mutation | Reddens |
|---|---|
| (a) `resolveIcmDefault` → always `false` | 3 guards (predicate, flagless emission, manifest record) |
| (b) `resolveIcmDefault` → always `true` | 3 guards (predicate ×2, **no-onboarding-pass leak guard**) |
| (c) `opts.icm ??` dropped (capability only) | 2 `icm-default` guards **+ 2 `icm-optin` `minimal` tests + CI tour `1/2 OK`** |

Mutation (c) at the CI level — the iter-88 risk demonstrated live:

~~~text
| `minimal` | 4 | FAIL — missing stages/01-plan/CONTEXT.md |
| `vertical:coding` | 5 | OK |
ICM pass: 1/2 OK.
[vertical-tour] FAIL: 1 of 2 ICM trees drifted
~~~

**Finding worth carrying forward:** mutation (b) initially reddened only the two
predicate unit tests — the 1.9 stdout guard *passed* because the CLI's explicit
`false` masked the resolver. The guard was strengthened (library-level
`result.onboarding === undefined`) and re-falsified before this task was closed.
Recorded because it is exactly the "passes for the wrong reason" failure the spec
warns about, and because task 2.4 changes which level is authoritative.

## Artifact: `walkTemplate`'s parameter and the manifest-derived gate survive

**What it proves:** The two resolvers stay separate, and `walkTemplate` keeps both of its callers.

**Why it matters:** `upgrade-cmd.ts` re-renders from the *manifest*, not from
capability. If it stopped passing `icm`, an ICM harness's upgrade would report its
10 managed files as drift; if it were switched to the capability resolver, upgrade
would retro-add ICM files to a harness the user never opted into (task 5.3).

**Artifact path:** `src/walker.ts:65`, `src/upgrade-cmd.ts:100`, `src/index.ts:754`

**Result summary:** `walkTemplate`'s `icm?: boolean` option is untouched, and the
two callers pass different sources by design.

~~~text
src/upgrade-cmd.ts:100:  walkTemplate(tdir, manifest.vars, { strict: false, icm: icmEnabled(manifest) })
src/index.ts:754:        walkTemplate(dir, vars, { strict: false, icm: useIcm })
~~~

A cross-reference comment was added in each direction naming the two questions so
a future merge is caught in review rather than in production.

## Artifact: `analyze-repo.ts:426` behaviour change (task 1.7)

**What it proves:** The one non-CLI caller that passes no `icm` was audited, and its changed behaviour is intended.

**Why it matters:** Task 1.7 requires the finding to be recorded rather than
changed silently. `analyze-repo` scaffolds from a recommended plan; with no `icm`
key, the capability default now applies.

**Result summary:** `analyze-repo`'s plans reference six templates —
`vertical:agentics`, `ai`, `business`, `coding`, `devops`, `research`. Of these,
**only `vertical:coding` is ICM-capable**, so `analyze-repo --scaffold` on an
mcp-server / rust-crate / typescript-sdk project now emits ICM where it
previously did not. `minimal` is **unreachable** from `analyze-repo` plans
(`grep 'minimal' src/analyze-repo.ts` → no match), so no caller hits the
`generate: false` interaction. **Verdict: intended, not changed.**

~~~text
template: 'vertical:agentics'
template: 'vertical:ai'
template: 'vertical:business'
template: 'vertical:coding'   <- the only capable one reachable here
template: 'vertical:devops'
template: 'vertical:research'
~~~

## Artifact: Full package suite — no unexpected regression

**What it proves:** The default flip's blast radius is confined to the tests whose premise it retires.

**Why it matters:** 654 tests passing is the evidence that nothing else moved; the
7 failures are enumerated so a reviewer can confirm each is accounted for.

**Command:** `npm test` (in `packages/create-agent-harness`)

**Result summary:** `654 passed | 7 failed | 2 skipped (663)`. All 7 failures are
premise-dies tests owned by task 3.0:

~~~text
icm-off.test.ts    × replaces the banner with the router at root CLAUDE.md
icm-off.test.ts    × adds exactly the ICM paths and nothing else
icm-off.test.ts    × keeps the flagless manifest free of every ICM path
icm-optin.test.ts  × emits no ICM file at all when the flag is absent
icm-optin.test.ts  × emits the template banner, not the router, for root CLAUDE.md
icm-optin.test.ts  × adds the ICM payload and nothing else
scaffold-e2e.test.ts × leaves the same template byte-identical when the flag is absent
~~~

**Finding for task 3.0 (not in the spec's §5 table):** of `icm-off.test.ts`'s 5
tests, only **3** fail. The other two — "yields identical bytes for every file the
flag does not legitimately rewrite" and "leaves the flagless manifest
byte-identical across two independent runs" — now **pass vacuously**, comparing an
ICM scaffold against another ICM scaffold. The file's own comment says "excluding
them silently would make this test vacuous"; the flagless baseline it compares
against *is* ICM now. Task 3.2 and 3.4 re-point these two; task 3.0's proof should
assert they fail if un-repointed, not rely on the current green.

## Artifact: Local gates run for this task

**What it proves:** The build, typecheck, structural healthcheck, and CI tour are all green after the change.

**Why it matters:** These are the gates that can actually detect a mistake in this
change; the ones that cannot (and are therefore deferred) are named below so a
reviewer does not read their absence as a pass.

**Commands:** `npm run build` · `npm run lint` · `node scripts/healthcheck.mjs` ·
`node examples/vertical-tour/vertical-tour.mjs`

**Result summary:**

~~~text
npm run build            -> exit 0 (tsc)
npm run lint             -> exit 0 (tsc --noEmit)
healthcheck.mjs          -> HEALTHY (7/7 pass), incl.
                            PASS catalogCount 20 templates in JSON + TS test + Rust test (in sync)
vertical-tour.mjs        -> 19/19 verticals HEALTHY, 2/2 ICM trees OK
~~~

**Not run / not green — and why (task 6.8, not task 1.0):**

`node scripts/preflight.mjs` is the ~30s release gate, but in this checkout it is
neither ~30s nor green, for reasons unrelated to this change:

- **`cargo test` does not finish** — `darwin::tests::dynamic_can_match_or_beat_best_static_on_leduc`
  runs past 60s and blocked the whole preflight (it was stopped after ~7 minutes).
- **`version drift` FAIL** — 41 published packages carry independent versions
  (`metaharness=0.4.16`, `@metaharness/darwin=0.10.2`, …). Pre-existing.
- **`evals-extract is missing README.md` FAIL.** Pre-existing.

This commit touches **0 `package.json` and 0 `README.md` files**
(`git show --name-only HEAD`), so neither FAIL is attributable to it. Task 6.8's
release-gate proof must confront these three directly rather than re-running
preflight and reporting a red gate as expected.

## Reviewer Conclusion

The capability default works and is guarded non-vacuously: a flagless capable
scaffold emits a tree that passes `icm-structure`, a non-capable one is unchanged
in files and stdout, and the internal override wins in both directions. The CI
tour stays green at `2/2`. Four mutations each turn the new guards red, and
mutation (c) demonstrates at the CI level exactly why the override must survive.
The 7 suite failures are all task 3.0's premise-dies tests; two of them pass
vacuously and must be re-pointed rather than trusted.
