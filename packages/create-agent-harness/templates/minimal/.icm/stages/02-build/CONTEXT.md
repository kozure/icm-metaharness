# Stage 02: Build

Make the planned change, minimally, in the project own style.

## Inputs

| Source | File/Location | Section/Scope | Why |
|--------|--------------|---------------|-----|
| Previous stage | `../01-plan/output/[topic-slug]-plan.md` | Full file | The plan to implement |
| Project | `{{BUILD_COMMAND}}` | Full value | How to build or compile the project |
| Reference | `../references/CONTEXT.md` | "What to Load" | Style and structure rules |

## Process

1. Read the plan from the previous stage
2. Make the smallest change that satisfies the plan
3. Match the surrounding naming, comment density, and idioms
4. Build the project using the build command above
5. Run the audit checks below. If any fail, revise before saving
6. Save to output/

## Audit

| Check | Pass Condition |
|-------|---------------|
| Builds | The build command completes with no new errors |
| Matches plan | Every change traces to a step in the plan, and nothing else changed |
| Style match | The change reads like the code that was already there |
| No unrelated refactor | No file outside the plan file list was touched |

## Outputs

| Artifact | Location | Format |
|----------|----------|--------|
| Change summary | `output/[topic-slug]-implementation.md` | What changed, per file, and why |
