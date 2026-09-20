/** The lint entry point. */

import { normalizeQuestions } from "jevkit-core";

import { Diagnostic, type Severity, compareDiagnostics } from "./diagnostic.js";
import { buildContext, rulesFor } from "./rules.js";

export interface LintOptions {
  state?: unknown;
  select?: Iterable<string>;
  ignore?: Iterable<string>;
}

/** Diagnostics for one request, ordered most severe first. */
export class LintResult {
  readonly diagnostics: Diagnostic[];

  constructor(diagnostics: Diagnostic[]) {
    this.diagnostics = [...diagnostics].sort(compareDiagnostics);
  }

  [Symbol.iterator](): Iterator<Diagnostic> {
    return this.diagnostics[Symbol.iterator]();
  }

  get length(): number {
    return this.diagnostics.length;
  }

  bySeverity(severity: Severity): Diagnostic[] {
    return this.diagnostics.filter((d) => d.severity === severity);
  }

  get errors(): Diagnostic[] {
    return this.bySeverity("error");
  }

  get warnings(): Diagnostic[] {
    return this.bySeverity("warning");
  }

  get infos(): Diagnostic[] {
    return this.bySeverity("info");
  }

  /** True when nothing rose to an error. */
  get ok(): boolean {
    return this.errors.length === 0;
  }

  counts(): { error: number; warning: number; info: number } {
    return {
      error: this.errors.length,
      warning: this.warnings.length,
      info: this.infos.length,
    };
  }

  toJSON() {
    return {
      ok: this.ok,
      counts: this.counts(),
      diagnostics: this.diagnostics.map((d) => d.toJSON()),
    };
  }

  format(color = false): string {
    if (!this.diagnostics.length) return "No problems found.";
    return this.diagnostics.map((d) => d.format(color)).join("\n");
  }
}

/**
 * Lint a jev request without calling the API.
 *
 * `questions` accepts SDK objects or plain objects. `state` is optional: omit it
 * to check the questions alone, though the budget rules can only report
 * meaningfully when the real state is supplied.
 */
export function lint(
  questions: Record<string, unknown>,
  options: LintOptions = {},
): LintResult {
  const normalized = normalizeQuestions(questions);
  const ctx = buildContext(options.state ?? "", normalized);
  const ignored = new Set([...(options.ignore ?? [])].map((c) => c.toUpperCase()));

  const found: Diagnostic[] = [];
  for (const rule of rulesFor(options.select)) {
    if (ignored.has(rule.code)) continue;
    found.push(...rule.check(ctx));
  }
  return new LintResult(found);
}
