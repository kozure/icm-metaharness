# Stage 04: Review

Hunt correctness bugs in the change before it lands.

## Inputs

| Source | File/Location | Section/Scope | Why |
|--------|--------------|---------------|-----|
| Previous stage | `../02-implement/output/[topic-slug]-implementation.md` | Full file | The change under review |
| Earlier stage | `../03-test/output/[topic-slug]-test-report.md` | Full file | Evidence the change works |
| Project | `{{REVIEW_FOCUS}}` | Full value | What this review must focus on |
| Reference | `../../references/CONTEXT.md` | "What to Load" | What counts as a finding |

## Process

1. Read the change summary and the test report
2. Read the diff itself rather than trusting the summary
3. Report only high-confidence findings, each with a file, a line, and a concrete fix
4. Separate bugs from nits
5. End with APPROVE or REQUEST-CHANGES and a one-line reason
6. Save to output/

## Checkpoints

| After Step | Agent Presents | Human Decides |
|------------|---------------|---------------|
| 5 | Findings with severity, and the verdict | Land the change or return it to implement |

## Audit

| Check | Pass Condition |
|-------|---------------|
| Verdict | The review ends with APPROVE or REQUEST-CHANGES, not a summary |
| Evidence | Every finding names a file and a line |
| Severity | Bugs and nits are separated, not blended |
| Permissions | Any widened permission or swallowed error is reported as a bug |

## Outputs

| Artifact | Location | Format |
|----------|----------|--------|
| Review | `output/[topic-slug]-review.md` | Findings, severity, verdict |
