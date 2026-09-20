/**
 * Static linter for TypeSafe Jev questions.
 *
 * Catches the failure modes TypeSafe documents for jev-1.13 before you spend a
 * token on them. Needs no API key.
 */

export { Diagnostic, type Severity } from "./diagnostic.js";
export { LintResult, lint, type LintOptions } from "./linter.js";
export { RULES, allCodes, rulesFor, type Rule, type LintContext } from "./rules.js";

export const VERSION = "0.1.0";
