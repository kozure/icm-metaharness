# Reference Material

Navigation for Layer 3. This file says what is here and when to load it. It does not carry the rules themselves.

## What to Load

| Task | Load These | Do NOT Load |
|------|-----------|-------------|
| Writing code | The relevant file under `references/`, named in the stage Inputs table | Every reference file at once |
| Checking style | The single convention file the stage names | Other stages and older runs are out of scope |
| Domain work | The skill named in the stage Inputs table | Skills unrelated to this stage |

## Where Reference Material Lives

| Kind | Location | Notes |
|------|----------|-------|
| Persistent conventions | `references/` | Configured once, stable across every run |
| Bundled skills | `.claude/skills/*/SKILL.md` | Domain knowledge shipped with this harness |
| Stage working artifacts | `stages/*/output/` | Layer 4, not reference material |

## Adding Reference Material

One file per subject, under `references/`. Point at it from the Inputs table of the stage that needs it. Never copy the same rule into two files: give it one home and point there.
