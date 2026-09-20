/** Diagnostics produced by the linter. */

export type Severity = "error" | "warning" | "info";

const ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

export interface DiagnosticInit {
  code: string;
  severity: Severity;
  questionId: string | null;
  message: string;
  hint: string;
  evidence?: string;
}

export class Diagnostic {
  readonly code: string;
  readonly severity: Severity;
  readonly questionId: string | null;
  readonly message: string;
  readonly hint: string;
  readonly evidence: string;

  constructor(init: DiagnosticInit) {
    this.code = init.code;
    this.severity = init.severity;
    this.questionId = init.questionId;
    this.message = init.message;
    this.hint = init.hint;
    this.evidence = init.evidence ?? "";
  }

  get sortKey(): [number, string, string] {
    return [ORDER[this.severity], this.code, this.questionId ?? ""];
  }

  format(color = false): string {
    const loc = this.questionId ?? "<request>";
    let head = `${loc}: ${this.severity} [${this.code}] ${this.message}`;
    if (color) {
      const tint: Record<Severity, string> = {
        error: "\u001b[31m",
        warning: "\u001b[33m",
        info: "\u001b[36m",
      };
      head = `${tint[this.severity]}${head}\u001b[0m`;
    }
    const lines = [head];
    if (this.evidence) lines.push(`    found: ${this.evidence}`);
    lines.push(`    hint:  ${this.hint}`);
    return lines.join("\n");
  }

  toJSON() {
    return {
      code: this.code,
      severity: this.severity,
      questionId: this.questionId,
      message: this.message,
      hint: this.hint,
      evidence: this.evidence,
    };
  }
}

export function compareDiagnostics(a: Diagnostic, b: Diagnostic): number {
  const [as_, ac, aq] = a.sortKey;
  const [bs, bc, bq] = b.sortKey;
  if (as_ !== bs) return as_ - bs;
  if (ac !== bc) return ac < bc ? -1 : 1;
  if (aq !== bq) return aq < bq ? -1 : 1;
  return 0;
}
