# 01-task-01-proofs.md — Unit 1.0

Proof record for parent task **1.0 — Sever the UI couplings so no surviving code behaves around the UI**
(`01-tasks-remove-ui-components.md`, spec Unit 1).

All command output below is captured verbatim from real runs on this tree. Nothing is hand-written.

---

## 1. Task summary

| | |
| --- | --- |
| Parent task | 1.0 — sever the UI couplings |
| Sub-tasks | 1.1 – 1.17 (17 of 17 complete) |
| Spec requirements covered | Unit 1 FR-1 … FR-6 |
| Commit | one scoped commit, un-pushed — see §7 |
| Tree state at end | ARC workspace suite green (71/71); `npm run lint` green; nothing deleted from `apps/` yet (that is 2.0) |

### What changed

| Area | Change |
| --- | --- |
| `create-agent-harness/src/manifest.ts` | `surface?: 'cli' \| 'web-ui'` → `surface?: 'cli'`; doc + emit-path comments rewritten (1.1) |
| `create-agent-harness/src/index.ts` | stale "web-UI port can still set `surface='web-ui'`" comment removed (1.2) |
| `create-agent-harness/src/diag.ts`, `src/subcommands.ts` | `cli/web-ui` comments reworded; **no runtime logic touched** (1.3) |
| `create-agent-harness/scripts/gen-templates.mjs` | `uiGenDir`, `uiCatalogTs()`, the `catalog.ts` write, its log line, the header's third output, and the now-unused `repoRoot` all removed (1.5) |
| `create-agent-harness/templates/catalog.def.mjs` | header no longer names the UI tree as a consumer (1.6) |
| `arc-agi-3-chatgpt/src/resource.ts` | deleted whole (43 LOC) (1.8) |
| `arc-agi-3-chatgpt/src/server.ts`, `types.ts`, `index.ts` | full `widgetHtml` thread + the `./resource.js` import and re-export removed (1.8, 1.9) |
| `arc-agi-3-chatgpt/src/tools.ts` | `arc_render` reverted from `registerAppTool` to `server.registerTool`; `registerAppTool` import and `ARC_WIDGET_URI` removed (1.10) |
| `arc-agi-3-chatgpt/.harness/mcp-capabilities.json` | `ui://metaharness/arc-agi-3/canvas` removed; `resources` kept as `[]` (1.11) |
| `arc-agi-3-chatgpt/package.json` + root `package-lock.json` | `@modelcontextprotocol/ext-apps` removed after a clean-import check (1.12) |
| `arc-agi-3-chatgpt/__tests__/no-ui-surface.test.ts` | **new** — the four-part built-server guard (1.13) |
| `arc-agi-3-chatgpt/__tests__/fixtures/arc-pre-removal-tools.json` | **new** — the pre-removal baseline (1.8) |
| `create-agent-harness/__tests__/generated-templates.test.ts` | **new** FR-1 / FR-2 guards appended (1.16) |
| `arc-agi-3-chatgpt/__tests__/mcp.integration.test.ts` | **inverted** — see §5, an 8th hard-fail site the plan did not enumerate |

---

## 2. What this task proves

1. **No surviving code writes into a UI tree.** The template generator ran to completion and touched nothing under `apps/`, verified against the working tree (not just its stdout).
2. **The manifest can no longer declare a UI surface.** `manifest.surface` admits only `'cli'`, and that narrowing is held by a source-text assertion — the only kind of guard that catches a re-widened union, since widening is backward-compatible and invisible to `tsc --noEmit`.
3. **The ARC harness registers no rendered surface, and `arc_render` survives intact.** Asserted against the *built* server over a real Streamable-HTTP MCP client: no `ui://` resource on any lane in either arm, and `arc_render` still returns authoritative JSON in `structuredContent`.
4. **The tool list lost nothing.** "Baseline minus zero entries" is auditable, not asserted from memory: a pre-removal capture taken **before** `resource.ts` was deleted is committed as a fixture and asserted equal to the post-removal registered set.
5. **The widget dependency removal was gated, not assumed.** `@modelcontextprotocol/ext-apps` was removed only after a clean-import check returned empty — Open Question 3's primary branch.
6. **Both new guards actually fire.** Each was mutated individually and produced the expected failure, and `npm run lint` was shown *not* to catch the union mutation.

---

## 3. Per-artifact evidence

### 3.1 The pre-removal baseline (sub-task 1.8) — captured before anything was deleted

**Context.** This is the load-bearing ordering constraint of the whole unit. The registered tool-name set can only be read off a server that still has `resource.ts`; once that file is gone the baseline is unrecoverable. So the very first action of 1.0's ARC leg was a `npm run build` on the unmodified tree followed by a capture, over a real MCP client, of every lane's registered tools and resource URIs in both arms (legacy and AVO). The result is committed at `packages/arc-agi-3-chatgpt/__tests__/fixtures/arc-pre-removal-tools.json` and is what sub-task 1.13(d) asserts against.

Note `gitHead` — the capture is anchored to the pre-removal commit — and note that **both actor arms carried the `ui://` resource** at capture time. That is the delta the removal is allowed to produce, and the only one.

```json
{
  "note": "Pre-removal baseline captured by sub-task 1.8 of 01-tasks-remove-ui-components.md, against the built server at HEAD f1eadbc (before packages/arc-agi-3-chatgpt/src/resource.ts was deleted). Asserted by 1.13(d).",
  "capturedAt": "2026-09-16T08:14:51.121Z",
  "gitHead": "f1eadbc3a00741836437d2569b15463ddb170110",
  "lanes": {
    "actor": {
      "tools": [
        "arc_act",
        "arc_checkpoint",
        "arc_execute_guarded_plan",
        "arc_graph_frontier",
        "arc_memory_commit",
        "arc_memory_query",
        "arc_observe",
        "arc_receipts_verify",
        "arc_render",
        "arc_resume",
        "arc_start",
        "arc_status",
        "arc_supervise"
      ],
      "resources": [
        "ui://metaharness/arc-agi-3/canvas"
      ]
    },
    "actorAvo": {
      "tools": [
        "arc_avo_context",
        "arc_avo_step",
        "arc_checkpoint",
        "arc_receipts_verify",
        "arc_render",
        "arc_resume",
        "arc_start",
        "arc_status"
      ],
      "resources": [
        "ui://metaharness/arc-agi-3/canvas"
      ]
    },
    "boss": {
      "tools": [
        "arc_supervisor_case",
        "arc_supervisor_directive_commit"
      ],
      "resources": []
    }
  }
}
```

### 3.2 FR-1 — the generator no longer targets a dead tree (sub-tasks 1.5, 1.7)

**Context.** `gen-templates.mjs` used to materialise a third output, `apps/web-ui/src/generated/catalog.ts`, via a `uiGenDir` path constant. The whole coupling is gone: the path constant, the `uiCatalogTs()` builder, the write call, the log line, and the header comment that advertised it. The proof is taken *before* `apps/` is deleted (that happens in 2.0), so a phantom re-creation cannot be confused with a leftover file — a `git status` on `apps/` that shows nothing means the generator genuinely did not write there.

```
### PROOF A — generator no longer targets a UI tree (FR-1)
$ cd packages/create-agent-harness && node scripts/gen-templates.mjs
✓ generated 14 template dirs
✓ wrote templates/catalog.json (20 entries)
exit=0

$ git status --short -- apps
(no output above = no path under apps/ was touched)
```

### 3.3 FR-2 — the surface union is narrowed (sub-tasks 1.1, 1.2)

**Context.** Two greps and the declaration itself. `manifest.ts` no longer contains the string `web-ui` anywhere (type literal or comment), and `index.ts` no longer carries the stale promise that a web-UI port would set the field.

```
### PROOF B — surface union narrowed, stale comment gone (FR-2)
$ grep -n "web-ui" packages/create-agent-harness/src/manifest.ts
exit=1 (1 = no match)
$ grep -n "web-UI port" packages/create-agent-harness/src/index.ts
exit=1 (1 = no match)
$ grep -n "surface?:" packages/create-agent-harness/src/manifest.ts
17:  surface?: 'cli';
```

### 3.4 FR-5 / FR-6 — widget plumbing and dependency gone (sub-tasks 1.8 – 1.12)

**Context.** One grep covers all three removed identifiers across the ARC package's sources, tests, and manifest. The `ext-apps` half of it *is* sub-task 1.12's clean-import check: an empty result is what authorises removing the dependency, so this grep is both the gate and the proof. `git ls-files` confirms `resource.ts` is deleted from the index, not merely untracked. The capability declaration keeps its schema shape (`resources` present, empty) and its `tools` lists are undisturbed — `arc_render` still appears in both actor lanes.

```
### PROOF D — widget plumbing gone, dependency check clean (FR-5, FR-6)
$ grep -rn "ext-apps\|registerArcWidgetResource\|widgetHtml" packages/arc-agi-3-chatgpt/src packages/arc-agi-3-chatgpt/__tests__ packages/arc-agi-3-chatgpt/package.json
exit=1 (1 = no match)
$ git ls-files packages/arc-agi-3-chatgpt/src/resource.ts
(no output above = untracked/deleted)

### capability declaration after 1.11
$ python3 -c ... resources key
resources = []
actor tools = 13 | actorAvo = 8 | boss = 2
arc_render in actor: True | in actorAvo: True
```

### 3.5 FR-3 / FR-4 — the built server registers no rendered surface (sub-task 1.13)

**Context.** `no-ui-surface.test.ts` is the unit's central guard. It imports `../dist/server.js` — the **built** server produced by the package's `pretest` build, not the TypeScript sources — starts it on an ephemeral port in both arms, and drives it with a real `StreamableHTTPClientTransport` MCP client. Four assertions, matching 1.13(a)–(d):

- **(a)** `arc_render` is still registered in both arms and its result carries a non-empty `structuredContent` object containing `observation`.
- **(b)** no lane, in either arm, lists a URI matching `/^ui:\/\//` — and the tracked capability file declares `resources: []`.
- **(c)** each lane's registered tool-name set equals that lane's `tools` list in `.harness/mcp-capabilities.json`, which makes the tracked declaration self-verifying and keeps the check reproducible after the deletion.
- **(d)** each lane's set equals the 1.8 fixture exactly, and the only permitted resource delta — the widget URI disappearing — is asserted explicitly.

```
 RUN  v2.1.9 /Users/phaedrus/DEV/Projects/icm-metaharness

 ✓ packages/arc-agi-3-chatgpt/__tests__/no-ui-surface.test.ts > ADR-284 — the ARC harness registers no rendered surface > keeps arc_render registered and returning authoritative structuredContent
 ✓ packages/arc-agi-3-chatgpt/__tests__/no-ui-surface.test.ts > ADR-284 — the ARC harness registers no rendered surface > registers no ui:// resource on any lane in either arm
 ✓ packages/arc-agi-3-chatgpt/__tests__/no-ui-surface.test.ts > ADR-284 — the ARC harness registers no rendered surface > registers exactly the tools the capability declaration lists, per lane
 ✓ packages/arc-agi-3-chatgpt/__tests__/no-ui-surface.test.ts > ADR-284 — the ARC harness registers no rendered surface > matches the pre-removal tool-name baseline exactly, and drops only the ui:// resource

 Test Files  1 passed (1)
      Tests  4 passed (4)
   Start at  01:26:11
   Duration  881ms (transform 239ms, setup 0ms, collect 444ms, tests 141ms, environment 0ms, prepare 64ms)
```

### 3.6 Nothing else depended on the widget (sub-task 1.14)

**Context.** The full ARC workspace suite, run through its own `pretest` build. This is the proof that the resource removal was self-contained.

```
   ✓ durable content-addressed checkpoints > persists and reloads a real 6,624-action controller checkpoint below the 64 MiB bound 43206ms

 Test Files  7 passed (7)
      Tests  71 passed (71)
   Start at  01:21:55
   Duration  51.27s (transform 2.65s, setup 0ms, collect 11.28s, tests 69.35s, environment 4ms, prepare 2.87s)
```

### 3.7 `npm run lint` (`tsc --noEmit`, all workspaces)

```
$ npm run lint
lint exit=0

> @metaharness/workspace-probe@0.1.1 lint
> tsc --noEmit
```

---

## 4. Falsifiability of the new guards (sub-task 1.17)

**Context.** Sub-task 1.16 added two guards whose failure modes are invisible to the type checker, so each was mutated individually and re-run. The unmutated suite was green before and after each mutation. These runs are evidence, not commits — the tree was returned to its unmutated state and re-verified.

### 4.1 Mutation (a) — re-add a generator write into `apps/`

A `writeFileMkdir(...apps/web-ui/src/generated/catalog.ts...)` call was re-inserted into `gen-templates.mjs`. The guard asserts against the working tree, so the silent write was caught:

```
     → gen-templates.mjs touched a path under apps/ (before: ""): expected 'M apps/web-ui/src/generated/catalog.ts' to be '' // Object.is equality

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  packages/create-agent-harness/__tests__/generated-templates.test.ts > ADR-284 — the generator and the manifest declare no UI surface > FR-1: a real generator run writes no path under apps/
AssertionError: gen-templates.mjs touched a path under apps/ (before: ""): expected 'M apps/web-ui/src/generated/catalog.ts' to be '' // Object.is equality

- Expected
+ Received

+ M apps/web-ui/src/generated/catalog.ts

 ❯ packages/create-agent-harness/__tests__/generated-templates.test.ts:309:7
    307|       after.trim(),
    308|       `gen-templates.mjs touched a path under apps/ (before: ${JSON.st…
    309|     ).toBe(before.trim());
       |       ^
    310|   }, 120_000);
    311| 

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

 Test Files  1 failed (1)
      Tests  1 failed | 42 skipped (43)
   Start at  01:23:24
   Duration  622ms (transform 119ms, setup 0ms, collect 146ms, tests 178ms, environment 0ms, prepare 70ms)
```

### 4.2 Mutation (b) — re-widen `manifest.surface`

`surface?: 'cli';` was widened back to `surface?: 'cli' | 'web-ui';`.

```
1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  packages/create-agent-harness/__tests__/generated-templates.test.ts > ADR-284 — the generator and the manifest declare no UI surface > FR-2: manifest.surface admits only 'cli'
AssertionError: manifest.surface was re-widened; ADR-284 admits only 'cli': expected 'surface?: \'cli\' | \'web-ui\';' to be 'surface?: \'cli\';' // Object.is equality

Expected: "surface?: 'cli';"
Received: "surface?: 'cli' | 'web-ui';"

 ❯ packages/create-agent-harness/__tests__/generated-templates.test.ts:319:7
    317|       declaration![0],
    318|       'manifest.surface was re-widened; ADR-284 admits only \'cli\'',
    319|     ).toBe("surface?: 'cli';");
       |       ^
    320|     expect(source, 'manifest.ts still names the removed web-ui surface…
    321|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

 Test Files  1 failed (1)
      Tests  1 failed | 42 skipped (43)
   Start at  01:23:39
   Duration  1.16s (transform 246ms, setup 0ms, collect 304ms, tests 20ms, environment 0ms, prepare 203ms)
```

**And the part that makes the guard necessary** — under the *same* mutation, the type checker is silent, because widening a union is backward-compatible:

```
$ npm run lint      # with manifest.surface re-widened to 'cli' | 'web-ui'
lint exit=0
```

### 4.3 Reverted, green again

```
   ✓ ADR-284 — the generator and the manifest declare no UI surface > FR-1: a real generator run writes no path under apps/ 403ms

 Test Files  1 passed (1)
      Tests  43 passed (43)
   Start at  01:25:24
   Duration  2.99s (transform 299ms, setup 0ms, collect 367ms, tests 1.46s, environment 0ms, prepare 205ms)
```

---

## 5. Plan deviation — an 8th hard-fail site (reported, not silently rewritten)

**What the plan said.** The task list enumerates the ARC package's inversion site as `packages/arc-agi-3-chatgpt/__tests__/package.test.ts:38` only (sub-task 3.5), and the audit's verified count of hard-fail sites is **7**.

**What was actually true.** `packages/arc-agi-3-chatgpt/__tests__/mcp.integration.test.ts` carries a second, unenumerated set of UI assertions:

- `:64` the test's own title, "…and reads the exact UI resource"
- `:70-72` `arc_render._meta.ui.resourceUri === 'ui://metaharness/arc-agi-3/canvas'`
- `:110-117` `listResources()` contains the widget URI, and `readResource()` returns its HTML

Sub-task 1.14 requires the ARC suite green after the widget removal, and Unit 1's own proof artifact states "the ARC package's own test suite passes after the widget removal". Both are unreachable while this file asserts the removed behaviour, so it was inverted **in 1.0** rather than deferred to 3.0 — it is a Unit-1 coupling, not a Unit-2 artifact.

**The invariant actually verified** (replacing the plan's literal premise that 1.14 goes green unaided):

- *no* tool on the actor lane — `arc_render` included — carries `_meta.ui`, strengthening the original loop that exempted `arc_render`;
- `resources/list` and `resources/read` both answer `-32601 Method not found`, which is the correct post-removal shape for a lane that registers no resources capability at all.

**Also observed, and not a failure:** on the first full-suite run, `package.test.ts` timed out at vitest's 5 000 ms default while `npm pack --dry-run` competed with the parallel `store.test.ts` workers. Re-run alone it passes in 1.3 s, and it passed in the final full-workspace run (§3.6). No change was made for it.

**Nothing in the spec, the task list's scope, or the audit was edited.** The two deviations above are recorded here for the maintainer's decision.

---

## 6. Sub-task ledger

| Sub-task | State | Evidence |
| --- | --- | --- |
| 1.1 narrow `manifest.surface` | done | §3.3 |
| 1.2 remove stale port comment | done | §3.3 |
| 1.3 reword `cli/web-ui` comments | done | diff shows comment-only change |
| 1.4 verify surface readers untouched | done | `packages/create-agent-harness/__tests__` — 650 passed, 2 skipped |
| 1.5 sever generator coupling | done | §3.2 |
| 1.6 update `catalog.def.mjs` header | done | header no longer names the UI tree |
| 1.7 run generator, capture FR-1 proof | done | §3.2 |
| 1.8 **pre-removal capture**, then delete `resource.ts` | done | §3.1 |
| 1.9 remove the `widgetHtml` thread | done | §3.4 |
| 1.10 revert `arc_render` to a plain tool | done | §3.4, §3.5(a) |
| 1.11 strip `ui://` from the capability file | done | §3.4 |
| 1.12 clean-import check → remove `ext-apps` | done (primary branch) | §3.4 |
| 1.13 add `no-ui-surface.test.ts` | done | §3.5 |
| 1.14 build + ARC suite green | done | §3.6 |
| 1.15 commit 1.0 | done | §7 |
| 1.16 add FR-1 / FR-2 guards | done | §4 |
| 1.17 prove both guards falsifiable | done | §4.1 – §4.3 |

---

## 7. Commit

Sub-task 1.15 landed as one scoped conventional commit:

```
refactor(ui): sever generator, manifest-surface, and ARC widget couplings
```

A commit cannot record its own hash, so read it back with:

```
$ git log --oneline -1 -- docs/specs/01-spec-remove-ui-components/01-proofs/01-task-01-proofs.md
```

Parent commit is `f1eadbc` (`docs(spec): apply the remove-UI remediation — close 3 gate failures + 2 flags`).

**Left un-pushed** per sub-task 4.18. `git status` is clean afterwards; no `git push` was run at any point.
