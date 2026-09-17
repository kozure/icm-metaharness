# Examples

Real, runnable patterns showing how to use `agent-harness-generator`.

| Example | What it shows | Runnable? |
|---|---|---|
| [`quickstart/`](./quickstart/) | One-script zero-to-validated-harness end-to-end demo | yes |
| [`multi-host/`](./multi-host/) | One harness targeting Claude Code + Codex with the same kernel | docs |
| [`federation/`](./federation/) | Two harness instances coordinating via the kernel's federation transport | yes |
| [`icm-onboarding/`](./icm-onboarding/) | ICM headless onboarding: a committed answers config + how to run it | n/a |

### Try the quickstart first

```bash
node examples/quickstart/quickstart.mjs
```

That's the smallest possible end-to-end run — scaffold → validate → report — exit 0 if HEALTHY. Default takes ~50ms on a built checkout. If it passes locally, the rest of the pipeline is mostly automation around the same flow.

See [`quickstart/README.md`](./quickstart/README.md) for `--host`, `--template`, `--keep` flags.

### Then try the federation demo

```bash
node examples/federation/federation.mjs
```

7-step bidirectional handshake: spins up two harness instances, has them add each other as trusted peers, round-trips the state through disk, demonstrates asymmetric demotion. ~20ms. See [`federation/README.md`](./federation/README.md) for what the script proves about the federation transport.

### ICM headless onboarding

```bash
metaharness scaffold my-harness --template vertical:coding \
  --answers examples/icm-onboarding/answers.example.json
```

**ICM follows the template — there is no flag.** A template that can emit an ICM
tree emits one (`vertical:coding`, and `minimal` on request); the other 18 carry
no `.icm/` overlay and are unaffected. `--icm`/`--no-icm` were removed in
[ADR-285](../docs/adrs/ADR-285-icm-default-on-capability-derived-emission.md).

The emitted ICM five-layer tree carries `{{SCREAMING_SNAKE_CASE}}` placeholders left for a human or agent to answer. `--answers` answers them headlessly: the run prints the resolved set, and any question the config leaves out is reported **by name with `file:line`** and fails the run rather than being silently defaulted. Without `--answers` the interactive path runs — it succeeds and prints exactly what it left unanswered.

[`icm-onboarding/answers.example.json`](./icm-onboarding/answers.example.json) is the committed sample. It carries **structural values only** (see the warning at the top of the file): this repo is public, so never paste personal context, credentials, or machine paths into it — pass the path to your own out-of-repo config instead. See ADR-281 for the decisions behind the format.

