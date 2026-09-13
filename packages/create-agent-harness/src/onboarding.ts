// SPDX-License-Identifier: MIT
//
// Headless onboarding (Unit 4, tasks 4.1–4.4). ADR-281.
//
// The ICM five-layer tree ships with `{{SCREAMING_SNAKE}}` placeholders and
// `{{?NAME}}…{{/NAME}}` conditional sections (see upstream
// `_core/placeholder-syntax.md`). In the interactive workflow an *agent* asks
// the questions and edits the files. Headless mode has to do the same job from a
// JSON answers file, deterministically, with no human in the loop.
//
// Why this is a separate pass and not `renderer.ts`:
//   `render()` is deliberately non-strict — an unknown `{{var}}` is left in
//   place so partial renders are detectable downstream. Leaving ICM
//   placeholders in place is exactly the failure mode we must not ship, so the
//   substitution here is *strict and named*: anything unresolved comes back as
//   a `file:line` residual and fails the run (task 4.3, the no-silent-gap
//   rule). `render()` remains the right tool for the lowercase `{{name}}`
//   template vars, which the walker handles; the two halves compose rather than
//   overlap. (`validate.ts`'s `icm-structure` check uses the same split: it
//   filters `{{?COND}}`/`{{SCREAMING}}` out of the lowercase leak check, then
//   reports residuals by name.)

import { readFileSync } from 'node:fs';

/**
 * A headless answers config: question id (`{{SCREAMING_SNAKE}}` placeholder or
 * `{{?CONDITIONAL}}` section name) -> answer. Text questions take non-empty
 * strings; boolean conditionals take booleans.
 *
 * This is the *documented* shape (task 4.1). `loadAnswers` validates it rather
 * than trusting it, because a config typo must surface as a named problem, not
 * as a silently unterminated section.
 */
export interface AnswersConfig {
  [questionId: string]: string | boolean;
}

/** Where a residual placeholder was found, for the named report (task 4.3). */
export interface Residual {
  name: string;
  file: string;
  line: number;
}

/** Outcome of a substitution pass over one content string. */
export interface SubstituteResult {
  content: string;
  /** Placeholder/conditional names that had no answer. */
  unresolved: string[];
}

export class AnswersConfigError extends Error {}

/** Matches `{{NAME}}` and the conditional forms `{{?NAME}}` / `{{/NAME}}`. */
const ICM_TOKEN_RE = /\{\{\s*([?/]?)\s*([A-Z][A-Z0-9_]*)\s*\}\}/g;

/**
 * Strip `//` **full-line** comments before parsing.
 *
 * The answers config is a hand-edited file (task 4.5 requires a
 * public-visibility warning at the top of the committed sample), and JSON has no
 * comment syntax. Rather than invent a `"_comment"` key — which the key-form
 * validation below would (correctly) reject — we accept the one comment form
 * that cannot be confused with data: a line whose first non-whitespace
 * characters are `//`.
 *
 * Deliberately *only* full-line comments. Stripping trailing comments would
 * mean tracking string/escape state to avoid mangling a legitimate value such as
 * `"https://example.com/repo"`, and the value that buys is smaller than the bug
 * it invites. A data line can never begin with `//` in JSON — that would require
 * a key starting with `//` — so this form is unambiguous by construction.
 */
function stripLineComments(raw: string): string {
  return raw
    .split('\n')
    .map((line) => (/^\s*\/\//.test(line) ? '' : line))
    .join('\n');
}

/**
 * Parse + validate an answers config (task 4.1).
 *
 * Rejects, with a named message: non-object roots, out-of-form keys (the config
 * is keyed by ICM placeholder names, so a lowercase or dotted key is a mistake
 * worth catching early), empty strings, and non string|boolean values.
 *
 * Full-line `//` comments are permitted (see `stripLineComments`).
 */
export function parseAnswers(raw: string, source = 'answers config'): AnswersConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripLineComments(raw));
  } catch (e) {
    throw new AnswersConfigError(
      `${source} is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new AnswersConfigError(`${source} must be a JSON object mapping question ids to answers`);
  }
  const out: AnswersConfig = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(k)) {
      throw new AnswersConfigError(
        `${source}: key "${k}" is not a question id — keys are ICM placeholder names in ` +
          `{{SCREAMING_SNAKE_CASE}} form (see _core/placeholder-syntax.md)`,
      );
    }
    if (typeof v === 'boolean') {
      out[k] = v;
      continue;
    }
    if (typeof v === 'string') {
      if (v.trim() === '') {
        throw new AnswersConfigError(`${source}: "${k}" is empty — remove the key or supply a value`);
      }
      out[k] = v;
      continue;
    }
    throw new AnswersConfigError(
      `${source}: "${k}" must be a string or boolean, got ${Array.isArray(v) ? 'array' : typeof v}`,
    );
  }
  return out;
}

/** Read + validate an answers config from disk. */
export function loadAnswers(path: string): AnswersConfig {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch {
    throw new AnswersConfigError(`answers config not found: ${path}`);
  }
  return parseAnswers(raw, path);
}

/**
 * Substitute ICM placeholders and resolve conditional sections in one content
 * string (task 4.2).
 *
 * Conditional semantics follow `_core/placeholder-syntax.md` exactly: a
 * `{{?NAME}}…{{/NAME}}` block wraps *whole sections*, so a false condition
 * removes the delimiters **and everything between them**, leaving no orphaned
 * heading, list marker, or dangling prose. Nesting is not part of the syntax and
 * is rejected rather than guessed at.
 *
 * Unanswered names are collected rather than left in place; `renderResiduals`
 * turns them into the named report. A conditional that is *answered true* has
 * its markers stripped and its body kept; that body may itself contain
 * placeholders, which the single left-to-right pass consumes because the
 * markers are removed as the scan reaches them.
 *
 * Conditional markers are *line-consuming* when they sit alone on their line —
 * which is the only form the syntax doc permits. That matters for the output
 * being clean markdown rather than merely marker-free: the authored shape is
 *
 *     …last line of the previous section
 *     <blank>
 *     {{?NAME}}
 *     ## Heading
 *     …
 *     {{/NAME}}
 *     <blank>
 *     ## Next section
 *
 *   so a true section must yield *one* blank line before the heading, and a
 *   false section must leave *one* blank line between its neighbours. Consuming
 *   only the token bytes would leave doubled blank-line runs in the first case
 *   and a tripled run in the second — no orphaned list markers, but not the
 *   clean markdown the whole-section rule exists to guarantee. Hence: consume the
 *   marker's whole line, and on removal also collapse the blank line the block
 *   was set off by.
 */
export function substituteIcm(content: string, answers: AnswersConfig): SubstituteResult {
  const unresolved = new Set<string>();
  let output = '';
  let i = 0;

  while (i < content.length) {
    const open = content.indexOf('{{', i);
    if (open === -1) {
      output += content.slice(i);
      break;
    }

    const close = content.indexOf('}}', open);
    if (close === -1) {
      // Unterminated `{{` — leave the bytes so `scanResiduals` can report the
      // dangling token with its line, rather than swallowing it.
      output += content.slice(i);
      break;
    }

    const token = content.slice(open, close + 2);
    const m = /\{\{\s*([?/]?)\s*([A-Z][A-Z0-9_]*)\s*\}\}/.exec(token);
    const marker = m?.[1] ?? null;
    const name = m?.[2] ?? '';

    // A conditional token on a line of its own (only whitespace before it)
    // consumes that whole line, newline included. Plain `{{NAME}}` placeholders
    // are inline by nature and never do.
    const lineStart = content.lastIndexOf('\n', open - 1) + 1;
    const ownsLine =
      (marker === '?' || marker === '/') && content.slice(lineStart, open).trim() === '';
    const lineEndIdx = content.indexOf('\n', close + 2);
    const lineEnd = lineEndIdx === -1 ? content.length : lineEndIdx + 1;

    // Emit everything up to the point the token's own line begins, so a dropped
    // marker line takes its indentation with it.
    output += content.slice(i, ownsLine ? lineStart : open);

    if (!m) {
      // A lowercase `{{name}}` or some other token. Not ours: the walker/`render`
      // owns those. Pass through untouched so we neither claim nor break them.
      output += token;
      i = close + 2;
      continue;
    }

    if (marker === '?') {
      // Conditional open. Find its matching close, then either keep the body
      // (markers stripped) or drop body + markers entirely.
      const bodyStart = ownsLine ? lineEnd : close + 2;
      const rest = content.slice(bodyStart);
      const closeRe = new RegExp(`\\{\\{\\s*/\\s*${name}\\s*\\}\\}`);
      const closeMatch = closeRe.exec(rest);
      if (!closeMatch) {
        // Unclosed section: not a substitution we can make safely. Report the
        // name and leave the bytes for the residual scan to locate.
        unresolved.add(name);
        output += token;
        i = close + 2;
        continue;
      }
      const absCloseStart = bodyStart + closeMatch.index;
      const closeLineStart = content.lastIndexOf('\n', absCloseStart - 1) + 1;
      const closeOwnsLine = content.slice(closeLineStart, absCloseStart).trim() === '';
      // The body stops before the close marker — and before that marker's own
      // line when it owns one, so the last byte kept is the previous line's `\n`.
      const body = content.slice(bodyStart, closeOwnsLine ? closeLineStart : absCloseStart);
      const after = closeOwnsLine
        ? (() => {
            const nl = content.indexOf('\n', absCloseStart + closeMatch[0].length);
            return nl === -1 ? content.length : nl + 1;
          })()
        : absCloseStart + closeMatch[0].length;
      if (/\{\{\s*\?/.test(body)) {
        throw new AnswersConfigError(
          `nested conditional section inside {{?${name}}} — the syntax only allows ` +
            `sections to wrap whole sections (see _core/placeholder-syntax.md)`,
        );
      }
      const answer = answers[name];
      if (typeof answer !== 'boolean') {
        unresolved.add(name);
        output += token;
        i = close + 2;
        continue;
      }
      if (answer) {
        // Keep the body. Recurse so `{{NAME}}` inside a kept section resolves,
        // and so a nested-but-valid case would still behave — the recursion is
        // on the *body*, whose own markers were just removed.
        const inner = substituteIcm(body, answers);
        output += inner.content;
        for (const n of inner.unresolved) unresolved.add(n);
      } else if (ownsLine && output.endsWith('\n\n')) {
        // Dropping the section would otherwise leave the blank line that set the
        // block off *plus* the blank line that followed it. Collapse to one so
        // the neighbours are separated by a single blank line.
        output = output.slice(0, -1);
      }
      i = after;
      continue;
    }

    if (marker === '/') {
      // A stray close marker (its opener was consumed or never existed). Leave
      // it: `scanResiduals` reports it rather than silently eating content.
      output += token;
      i = close + 2;
      continue;
    }

    // Plain `{{NAME}}`: only a non-empty string substitutes. A boolean answer
    // for a plain placeholder is a config mistake worth naming (`true` is not a
    // sentence), so it is reported unresolved rather than stringified.
    const answer = answers[name];
    if (typeof answer === 'string') {
      output += answer;
    } else {
      unresolved.add(name);
      output += token;
    }
    i = close + 2;
  }

  return { content: output, unresolved: Array.from(unresolved).sort() };
}

/**
 * Find every unresolved ICM token left in one content string, with line numbers
 * (task 4.3). Scans for any `{{` so unterminated and stray-close tokens are
 * reported too, not just well-formed ones.
 *
 * Only `{{SCREAMING_SNAKE}}` / `{{?COND}}` / `{{/COND}}` forms are reported.
 * A leftover lowercase `{{name}}` is the *walker's* `unresolved[]` — task 4.3
 * names it as "the existing data source for the lowercase half" — so folding it
 * in here would double-report and blur which pass failed.
 */
export function scanResiduals(text: string): Array<{ name: string; line: number }> {
  const out: Array<{ name: string; line: number }> = [];
  const lines = text.split('\n');
  for (let ln = 0; ln < lines.length; ln++) {
    const line = lines[ln]!;
    for (const m of line.matchAll(/\{\{\s*([?/]?)\s*([A-Z][A-Z0-9_]*)\s*\}\}/g)) {
      out.push({ name: (m[1] ?? '') + (m[2] ?? ''), line: ln + 1 });
    }
    // An unterminated `{{` on a line yields no match above. Report it only when
    // it looks like an ICM token; a dangling lowercase `{{` belongs to the
    // renderer half.
    const lastOpen = line.lastIndexOf('{{');
    if (lastOpen !== -1 && line.indexOf('}}', lastOpen) === -1) {
      const tail = line.slice(lastOpen);
      if (/\{\{\s*[?/]?\s*[A-Z]/.test(tail)) out.push({ name: tail, line: ln + 1 });
    }
  }
  return out;
}

/**
 * Apply a headless answers pass across a rendered file map (tasks 4.2/4.3).
 *
 * Kept for the *batch* shape — a whole `path -> content` map in, a new map plus
 * a flat residual list out. `scaffold()` drives the same two functions per file
 * (it needs to mutate its own `rendered` entries, which carry more than
 * content), so this is the convenience form for any other caller that holds a
 * plain map. Both share `substituteIcm` and `scanResiduals`, so the semantics
 * cannot drift between them.
 *
 * Only files that actually carry ICM tokens are touched; everything else is
 * returned by reference, so a flagless or non-ICM scaffold is bit-for-bit
 * unaffected. Never throws on residue, because a *report* is the contract and
 * the CLI needs to print it (task 4.3); the caller decides the exit code.
 */
export function onboardFiles(
  files: Record<string, string>,
  answers: AnswersConfig,
): { files: Record<string, string>; residuals: Residual[] } {
  const out: Record<string, string> = {};
  const residuals: Residual[] = [];
  const unresolvedByFile = new Map<string, Set<string>>();

  for (const [path, content] of Object.entries(files)) {
    if (!content.includes('{{')) {
      out[path] = content;
      continue;
    }
    const { content: substituted, unresolved } = substituteIcm(content, answers);
    out[path] = substituted;
    if (unresolved.length > 0) unresolvedByFile.set(path, new Set(unresolved));
    for (const r of scanResiduals(substituted)) {
      residuals.push({ name: r.name, file: path, line: r.line });
    }
  }

  return { files: out, residuals };
}

/**
 * The required question set for a template, given the ICM content it will emit.
 * Derived by scanning the content for tokens — the same derivation
 * `icmQuestionsFor` uses in `catalog.def.mjs`, so the config surface and the
 * emitted tree cannot disagree (task 4.1's single-source rule).
 */
export function requiredQuestions(files: Record<string, string>): string[] {
  const seen = new Set<string>();
  for (const content of Object.values(files)) {
    if (!content.includes('{{')) continue;
    for (const m of content.matchAll(ICM_TOKEN_RE)) {
      const marker = m[1];
      const name = m[2];
      if (marker === '/') continue;
      seen.add(name!);
    }
  }
  return Array.from(seen).sort();
}

/** Human-readable report of what is still unanswered (task 4.3). */
export function formatResiduals(residuals: Residual[]): string[] {
  return residuals.map((r) => `  ${r.name} — ${r.file}:${r.line}`);
}

/** Human-readable report of the resolved answer set (task 4.4's printed half). */
export function formatResolved(answers: AnswersConfig, used: string[]): string[] {
  return used.map((name) => {
    const v = answers[name];
    return `  ${name} = ${typeof v === 'boolean' ? String(v) : JSON.stringify(v)}`;
  });
}
