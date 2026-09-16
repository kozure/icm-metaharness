# User Guide

> Plain-language guide. No jargon. If you've never used an "AI agent harness"
> before, start here.

---

## What is this?

`agent-harness-generator` turns any GitHub repo — or a blank slate — into a
small AI **agent** that knows about that repo and can help work on it.

You don't write code. You don't deploy anything. You don't sign up for an
account.

You paste a GitHub URL, click a button, and download a `.zip`. Inside the
`.zip` is a fully working tool you can run on your laptop with
`npm install && npx my-bot --help`.

That's it. That's the whole pitch.

---

## What does an "agent harness" actually do?

Think of it like a wrapper. Underneath, you're still talking to Claude or
GPT or any other AI model. The wrapper adds:

- **A name and a brand** — `npx my-repo-agent` instead of `claude code`
- **Knowledge about a specific project** — it knows which files matter, which
  test commands run, which security rules apply
- **A set of skills** — "review this diff", "find the missing tests", "make
  sure the release is signed"
- **A safety net** — it can't run shell commands it wasn't allowed to, it
  can't reach the internet unless you let it, it can't see your secrets
  unless you wire them in

So instead of a generic chatbot, you get a tool that's tuned for one
codebase, owned by you, runs on your laptop.

---

## What can I do with it?

### 1. Paste a GitHub URL and generate a harness for it

```bash
npx metaharness analyze https://github.com/sindresorhus/ky
```

1. `analyze` reads the repo and recommends agents and skills for it
2. Review the recommendation, then generate the harness:

```bash
npx metaharness my-bot --from-repo https://github.com/sindresorhus/ky --host claude-code
```

3. `npx metaharness --list` shows every template if you would rather start from one

Run `npm install` in the generated folder and you have a working agent that
knows about that repo.

Nothing is uploaded. `analyze` reads the repo file list via GitHub's public
API and runs entirely on your machine. No code executes.

### 2. Start from scratch

If you don't have a target repo yet, the **Create harness** tab lets you
pick:

- A name (e.g. `acme-support-bot`)
- A vertical template (19 options — coding, support, trading, education, …)
- Which agent hosts you want it to run on (Claude Code, Codex, pi.dev, Prime Agent, …)
- Which skills to include
- Whether to expose an MCP server (default-deny if so)

Same result: a `.zip` you download, unzip, and run.

### 3. Author a single skill

If you only want one re-usable skill (not a whole harness), use the
**Skill / Agent / Command** tab. You'll get a single `SKILL.md` folder you
can drag into Claude desktop or claude.ai.

### 4. Verify a harness someone else gave you

Got a `.zip` from a colleague? The **Verify** tab checks it without
unzipping or running anything. It looks at:

- Structure (does it match the expected layout?)
- Kernel version (will it run with what you have installed?)
- MCP policy (are there risky permissions?)
- Secrets (did anyone accidentally embed a token?)

---

## How do I run my generated harness?

You picked a host with `--host` (e.g. **claude-code**). After generating:

```bash
cd my-bot
npm install
```

Then for each host:

| Host | Command |
|---|---|
| Claude Code | `claude code` from inside the folder |
| OpenAI Codex | `cp .codex/config.toml ~/.codex/config.toml && codex` |
| pi.dev | `pi` from inside the folder (pi auto-discovers `AGENTS.md`) |
| Hermes | `hermes` from inside the folder |
| OpenClaw | `openclaw run --harness .` |
| RVM | `rvm launch --partition ./rvm-partition.toml` |
| Prime Agent | `prime-agent` from inside the folder (skills auto-discovered from `.prime/agent/skills/`) |

`npx metaharness doctor` prints the right command for the hosts you picked.

---

## What does it cost?

- **The CLI is free and runs entirely locally.** No backend, no account.
- **The generated harness is free.** You own it, you can publish it to npm
  under any name you want.
- **The model behind the harness is whatever you bring.** Claude Code uses
  your Anthropic plan. Codex uses your OpenAI plan. pi.dev / Hermes /
  OpenClaw / RVM are open-source or self-hosted.

There is no "agent-harness-generator account."

---

## What's the catch?

There isn't one, but here's what to know:

- **The harness is a starting point, not magic.** It scaffolds 80% of what
  most agents need. You'll still want to tweak prompts and add a skill or
  two yourself.
- **The MCP server is default-deny.** That's a feature — it means the agent
  can't accidentally `rm -rf` your project — but it also means you have to
  explicitly allow tools when you want them.
- **The "Repo → Harness" analysis is deterministic and shallow.** It looks
  at the file list, package.json, README, and language mix. It doesn't read
  every line of code. The output is a strong starting point; you'll get
  better results if you edit it before downloading.

---

## Common questions

### Q: Do I need to be a developer?

You need enough Node.js comfort to run `npm install` and `npx my-bot --help`
in a terminal. You don't need to write JavaScript.

### Q: Does my code go anywhere?

No. The CLI runs entirely on your machine. `analyze` fetches the public repo
file list from GitHub (the same way `git ls-tree` does); it never uploads your
code anywhere. Your harness is generated and signed locally.

### Q: Is it safe to run a harness someone else gave me?

Run `npx metaharness validate` on it first. It scans for:
- Hardcoded secrets / tokens
- Risky MCP permissions (shell, network, file-write)
- Unexpected file structure
- Kernel version compatibility

If those pass, the harness is at least no riskier than any other npm
package you'd `npm install`.

### Q: Why are there 10 hosts?

Different teams use different agent runtimes. Claude Code is most common.
Codex is OpenAI's. pi.dev is Mariozechner / Badlogic's monorepo agent.
Hermes is Nous Research's open-weights runtime. OpenClaw is a personal-AI
fork. RVM is a hardware-isolated microhypervisor for untrusted scenarios.
Copilot rides VSCode's MCP support, OpenCode is a terminal UI, and GitHub
Actions runs the harness non-interactively in CI. Prime Agent is Prime
Intellect's open-source harness — it has no MCP, so your tools ship as
Python-backed skills, and it has no sandbox, so a deny-list comes with a
`SANDBOX-REQUIRED.md` warning instead of being silently dropped.
The harness output works the same on all of them — the only differences
are config-file shape and how you launch.

### Q: Can I publish my harness to npm?

Yes — that's exactly the point. The output is a valid npm package. Read
the publish-readiness section of `harness validate`, then `npm publish`.
For witness-signed releases, also run `harness sign` first.

### Q: What's the relationship to "ruflo"?

[ruflo](https://github.com/ruvnet/ruflo) is the big bundled meta-harness
that this generator is a focused, factored-apart subset of. ruflo bundles
the kernel **and** content (60+ agents, 30+ skills, 33 plugins) into a
single thing. `agent-harness-generator` lets you take the kernel and
generate just the content you actually need, owned by you, branded by you.

---

## When this isn't the right tool

- **You want a chatbot.** Use Claude or ChatGPT directly.
- **You want a no-code platform.** This emits Node.js code. You'll need to
  open a terminal.
- **You want a hosted agent.** This generates local-first artifacts. There's
  no hosted "agent-harness-generator service" — the CLI is the interface, the
  generated package is the product.
- **You want to fine-tune a model.** The model is whatever your host uses.
  This tool shapes the *harness* around the model.

---

## Next steps

1. **Try the CLI:** `npx metaharness --list`, then generate one.
2. **Generate a harness for a repo you know:** the first time, pick a repo
   you're familiar with so you can sanity-check the output.
3. **Read the agent prompts in `src/agents/*.ts`:** that's where the
   personality lives. Edit them to taste.
4. **Run `harness doctor` after install:** confirms the scaffold is healthy.
5. **Run `harness diag` if anything seems off:** kernel-version skew is the
   #1 source of "this doesn't work" support tickets.

---

## Where to find help

- Bug? <https://github.com/ruvnet/metaharness/issues>
- Discussion? <https://github.com/ruvnet/metaharness/discussions>
- Read the architecture: [`docs/ARCHITECTURE.md`](ARCHITECTURE.md)
- Read the design decisions: [`docs/adrs/INDEX.md`](adrs/INDEX.md)
- File a support ticket the right way: `harness diag --bundle > bundle.json`
  and attach the `bundle.json` to your issue. It contains everything a
  maintainer needs and **never** contains your secrets (the bundle pattern
  redacts them — see [ADR-031](adrs/ADR-031-bundle-json-pattern.md)).
