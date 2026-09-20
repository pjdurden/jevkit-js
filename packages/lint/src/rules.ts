/**
 * Lint rules.
 *
 * Every rule maps to a failure mode TypeSafe documents for `jev-1.13`
 * (https://docs.typesafe.ai/model-jaggedness/jev-1.13) or to a structural
 * mistake that makes an answer unusable. The `mode` field names the documented
 * failure mode so the CLI can point at the source.
 *
 * Rules are static. They read your question definitions and never call the API,
 * which is why jevkit-lint works without an API key.
 */

import { type BudgetReport, type Question, checkBudget } from "jevkit-core";

import { Diagnostic } from "./diagnostic.js";

export interface LintContext {
  questions: Question[];
  state: unknown;
  budget: BudgetReport;
}

export interface Rule {
  code: string;
  name: string;
  mode: string;
  check: (ctx: LintContext) => Diagnostic[];
}

export function buildContext(state: unknown, questions: Question[]): LintContext {
  // Budget estimation canonicalizes its input, so questions are reduced to
  // plain JSON here. SDK objects may not be serializable, and the raw form is
  // only needed by rules that read the normalized view anyway.
  const plain: Record<string, unknown> = {};
  for (const q of questions) {
    plain[q.id] = { type: q.type, instructions: q.instructions, criteria: q.criteria };
  }
  return { questions, state, budget: checkBudget(state, plain) };
}

function find(patterns: RegExp[], text: string): string | null {
  for (const pattern of patterns) {
    const match = new RegExp(pattern.source, pattern.flags.replace("g", "")).exec(text);
    if (match) return match[0].trim();
  }
  return null;
}

function findAll(pattern: RegExp, text: string): string[] {
  return [...text.matchAll(new RegExp(pattern.source, pattern.flags + "g"))].map((m) => m[0]);
}

// -- JEV001 Math and Numbers ------------------------------------------------

const COUNT_PATTERNS = [
  /\bhow many\b/i, /\bnumber of\b/i, /\bcount (?:the|of|how)\b/i, /\btally\b/i,
  /\btotal (?:number|count|of)\b/i, /\bsum of\b/i, /\baverage\b/i, /\bmean of\b/i,
  /\bcalculate\b/i, /\bcompute the\b/i, /\bpercentage of\b/i, /\bhow much (?:is|does)\b/i,
  /\bmultipl(?:y|ied)\b/i, /\bdivided?\b/i, /\bsubtract\b/i,
];

const checkMath = (ctx: LintContext): Diagnostic[] =>
  ctx.questions.flatMap((q) => {
    const hit = find(COUNT_PATTERNS, q.text);
    return hit
      ? [new Diagnostic({
          code: "JEV001", severity: "error", questionId: q.id,
          message: "Question asks the model to count or do arithmetic.",
          evidence: hit,
          hint: "jev-1.13 is not a calculator and does not count reliably. Iterate the " +
                "candidates in code, ask one Noul per item, and sum the answers yourself.",
        })]
      : [];
  });

// -- JEV002 Date and time comparison ---------------------------------------

const DATE_PATTERNS = [
  /\b(?:before|after|earlier than|later than|prior to)\b[^.?]{0,40}\b(?:date|day|month|year|deadline|timestamp)\b/i,
  /\b(?:date|day|month|year|deadline|timestamp)\b[^.?]{0,40}\b(?:before|after|earlier|later)\b/i,
  /\bhow (?:long|many days|many months|many years)\b/i,
  /\bwithin \d+ (?:day|week|month|year)s?\b/i,
  /\b(?:days|weeks|months|years) (?:between|apart|since|until)\b/i,
  /\bmost recent\b/i, /\bchronologic(?:al|ally)\b/i,
  /\b(?:which|what)\b[^.?]{0,30}\b(?:came|comes|happened|occurred|was|is)\s+(?:first|last|earliest|latest|more recent)\b/i,
  /\b(?:earliest|latest|oldest|newest)\b[^.?]{0,20}\b(?:date|day|month|year|deadline|timestamp|event|entry)\b/i,
  /\b(?:date|day|month|year|deadline|timestamp)\b[^.?]{0,20}\b(?:first|last|earliest|latest)\b/i,
  /\bexpired?\b/i, /\boverdue\b/i, /\bin the (?:past|last|next) \d+\b/i,
];

const checkDates = (ctx: LintContext): Diagnostic[] =>
  ctx.questions.flatMap((q) => {
    const hit = find(DATE_PATTERNS, q.text);
    return hit
      ? [new Diagnostic({
          code: "JEV002", severity: "error", questionId: q.id,
          message: "Question compares or measures dates.",
          evidence: hit,
          hint: "jev-1.13 reads dates as text, not ordered quantities. Extract the parts " +
                "as Choices over closed sets (12 months, 31 days, a bounded year range, " +
                "plus an explicit 'not stated'), then order and subtract in code.",
        })]
      : [];
  });

// -- JEV003 Generation ------------------------------------------------------

const GENERATION_PATTERNS = [
  /\b(?:write|draft|compose|author) (?:a|an|the|some)\b/i,
  /\b(?:generate|produce|create) (?:a|an|the)\s+(?:summary|response|reply|message|list|description|explanation|text|paragraph)\b/i,
  /\bsummari[sz]e\b/i, /\bparaphrase\b/i, /\brephrase\b/i, /\brewrite\b/i,
  /\bexplain (?:why|how|what)\b/i, /\bdescribe (?:in|the|what|how)\b/i,
  /\bin your own words\b/i,
  /\bprovide (?:a|an) (?:summary|explanation|rationale|reason)\b/i,
  /\bgive (?:a|an) (?:reason|explanation|rationale)\b/i, /\btranslate\b/i,
];

const checkGeneration = (ctx: LintContext): Diagnostic[] =>
  ctx.questions.flatMap((q) => {
    const hit = find(GENERATION_PATTERNS, q.instructionsText);
    return hit
      ? [new Diagnostic({
          code: "JEV003", severity: "error", questionId: q.id,
          message: "Question asks the model to generate text.",
          evidence: hit,
          hint: "Jev returns typed answers and probabilities, never generated text. Use a " +
                "generative model for this, or restate it as a selection over candidates " +
                "your code already has.",
        })]
      : [];
  });

// -- JEV004 Literal reading: negation --------------------------------------

const NEGATIONS =
  /\b(?:not|never|no|none|neither|nor|without|except|unless|excluding|absent|lacks?|fails? to|cannot|can't|doesn't|does not|isn't|is not|aren't|won't)\b/i;

const checkNegation = (ctx: LintContext): Diagnostic[] =>
  ctx.questions.flatMap((q) => {
    const hits = findAll(NEGATIONS, q.instructionsText);
    if (hits.length >= 2) {
      const unique = [...new Set(hits.map((h) => h.toLowerCase()))].sort();
      return [new Diagnostic({
        code: "JEV004", severity: "warning", questionId: q.id,
        message: `Instructions contain ${hits.length} negations, which compounds into a double negative.`,
        evidence: unique.join(", "),
        hint: "jev-1.13 reads negations literally and loses accuracy on double negatives. " +
              "Restate positively, or split into two literal questions and combine them in code.",
      })];
    }
    if (hits.length === 1 && q.type === "noul") {
      return [new Diagnostic({
        code: "JEV004", severity: "info", questionId: q.id,
        message: "Noul instruction is phrased negatively.",
        evidence: hits[0]!.toLowerCase(),
        hint: "A Noul returns the probability the statement is true. A negative statement " +
              "inverts the reading of every threshold downstream. Prefer the positive form " +
              "and invert in code if you need it.",
      })];
    }
    return [];
  });

// -- JEV005 Literal reading: vague scoping ---------------------------------

const VAGUE = /\b(?:relevant|appropriate|important|significant|suitable|proper|good|bad|better|reasonable|acceptable|sufficient|adequate|meaningful|noteworthy|problematic)\b/i;

const checkVague = (ctx: LintContext): Diagnostic[] =>
  ctx.questions.flatMap((q) => {
    const found = [...new Set(findAll(VAGUE, q.instructionsText).map((h) => h.toLowerCase()))].sort();
    if (found.length && !q.criteriaText.trim()) {
      return [new Diagnostic({
        code: "JEV005", severity: "warning", questionId: q.id,
        message: "Instructions lean on an undefined evaluative word and give no criteria to pin it down.",
        evidence: found.join(", "),
        hint: "jev-1.13 answers the question you wrote, not the one you meant. Define what " +
              "the word means here in the criteria, including the boundary cases.",
      })];
    }
    if (found.length >= 2) {
      return [new Diagnostic({
        code: "JEV005", severity: "info", questionId: q.id,
        message: "Instructions stack several undefined evaluative words.",
        evidence: found.join(", "),
        hint: "Each one is a separate judgment the model has to guess at. Name the exact " +
              "condition, or split into separate questions.",
      })];
    }
    return [];
  });

// -- JEV006 Indirection -----------------------------------------------------

const INDIRECTION_PATTERNS = [
  /\bthe \w+ of the \w+ of the\b/i,
  /\bwhoever\b[^.?]{0,40}\bwhose\b/i,
  /\bif .{0,60}\bthen\b.{0,60}\bif\b/i,
  /\bwould have (?:been|had)\b/i,
  /\bimplies? that\b[^.?]{0,40}\bwhich\b/i,
  /\bindirectly\b/i, /\btransitively\b/i,
];

const checkIndirection = (ctx: LintContext): Diagnostic[] =>
  ctx.questions.flatMap((q) => {
    const hit = find(INDIRECTION_PATTERNS, q.instructionsText);
    return hit
      ? [new Diagnostic({
          code: "JEV006", severity: "warning", questionId: q.id,
          message: "Instructions require multiple hops of reasoning.",
          evidence: hit,
          hint: "Every hop costs accuracy. Resolve the intermediate step in code and name " +
                "the resulting state field directly in the instruction.",
        })]
      : [];
  });

// -- JEV007 Noul polarity ---------------------------------------------------

const FALSEY = ["no", "false", "absent", "none", "negative", "not present", "does not", "fails"];
const TRUTHY = ["yes", "true", "present", "positive", "does", "passes"];

const checkNoulPolarity = (ctx: LintContext): Diagnostic[] =>
  ctx.questions.flatMap((q) => {
    const c = q.criteria;
    if (q.type !== "noul" || !c || typeof c !== "object" || Array.isArray(c)) return [];
    const crit = c as Record<string, unknown>;
    const trueSide = String(crit["true"] ?? "").toLowerCase();
    const falseSide = String(crit["false"] ?? "").toLowerCase();
    if (!trueSide && !falseSide) return [];
    const inverted =
      FALSEY.some((t) => trueSide.includes(t)) && TRUTHY.some((t) => falseSide.includes(t));
    return inverted
      ? [new Diagnostic({
          code: "JEV007", severity: "error", questionId: q.id,
          message: "Noul criteria invert polarity: 'true' describes a no and 'false' describes a yes.",
          evidence: `true=${JSON.stringify(trueSide)} false=${JSON.stringify(falseSide)}`,
          hint: "TypeSafe documents this exact shape as a performance loss. Swap the two " +
                "descriptions and rewrite the instruction so 'true' means yes.",
        })]
      : [];
  });

// -- JEV008 / JEV009 / JEV010 Choice structure -----------------------------

const NO_MATCH = new Set([
  "none", "none_of_the_above", "no_match", "nomatch", "other", "unknown", "unclear",
  "not_stated", "not_applicable", "n_a", "na", "neither", "cannot_tell", "insufficient",
  "uncertain", "ambiguous", "not_specified",
]);

const checkChoiceNoMatch = (ctx: LintContext): Diagnostic[] =>
  ctx.questions.flatMap((q) => {
    if (q.type !== "choice") return [];
    const keys = q.options.map((k) => k.toLowerCase().replace(/[- ]/g, "_"));
    if (!keys.length || keys.some((k) => NO_MATCH.has(k))) return [];
    return [new Diagnostic({
      code: "JEV008", severity: "warning", questionId: q.id,
      message: "Choice has no no-match option.",
      evidence: [...keys].sort().join(", "),
      hint: "A Choice always returns one of its options. With nothing meaning 'none of " +
            "these', a state that fits no option still produces a confident-looking answer. " +
            "Add an explicit none/unknown option, or gate on a separate presence Noul.",
    })];
  });

const checkChoiceArity = (ctx: LintContext): Diagnostic[] =>
  ctx.questions.flatMap((q) => {
    if (q.type !== "choice") return [];
    const n = q.options.length;
    if (n === 0) {
      return [new Diagnostic({
        code: "JEV009", severity: "error", questionId: q.id,
        message: "Choice defines no options.",
        hint: "Give the Choice a criteria object mapping each option key to a description " +
              "of when it applies.",
      })];
    }
    if (n === 1) {
      return [new Diagnostic({
        code: "JEV009", severity: "error", questionId: q.id,
        message: "Choice defines a single option, so the answer is predetermined.",
        evidence: q.options[0]!,
        hint: "Use a Noul if the question is really yes/no, or add the competing options.",
      })];
    }
    return [];
  });

const checkEmptyDescriptions = (ctx: LintContext): Diagnostic[] =>
  ctx.questions.flatMap((q) => {
    if (q.type !== "choice") return [];
    const blank = q.optionDescriptions().filter(([, d]) => !d.trim()).map(([k]) => k);
    return blank.length
      ? [new Diagnostic({
          code: "JEV010", severity: "warning", questionId: q.id,
          message: "Choice options have no description.",
          evidence: blank.join(", "),
          hint: "The option key alone is all the model gets. Describe when each option " +
                "applies, especially the boundary against its nearest rival.",
        })]
      : [];
  });

// -- JEV011 Score structure -------------------------------------------------

const checkScoreLevels = (ctx: LintContext): Diagnostic[] =>
  ctx.questions.flatMap((q) => {
    if (q.type !== "score") return [];
    const levels = q.options;
    if (levels.length < 2) {
      return [new Diagnostic({
        code: "JEV011", severity: "error", questionId: q.id,
        message: `Score defines ${levels.length} level(s); at least 2 are needed to form a scale.`,
        hint: "Give each level a concrete description of the situation it covers.",
      })];
    }
    const terse = levels.filter((lv) => lv.trim().split(/\s+/).length < 2);
    return terse.length
      ? [new Diagnostic({
          code: "JEV011", severity: "warning", questionId: q.id,
          message: "Score levels are bare labels rather than descriptions.",
          evidence: terse.join(", "),
          hint: "Levels must describe concrete situations and stand on their own. " +
                "'Frustrated but civil' works; 'medium' does not.",
        })]
      : [];
  });

// -- JEV012 Instructions present -------------------------------------------

const checkInstructions = (ctx: LintContext): Diagnostic[] =>
  ctx.questions.flatMap((q) => {
    const text = q.instructionsText.trim();
    if (!text) {
      return [new Diagnostic({
        code: "JEV012", severity: "error", questionId: q.id,
        message: "Question has no instructions.",
        hint: "The instruction carries the judgment. Without it the model only has the " +
              "criteria to go on.",
      })];
    }
    if (text.split(/\s+/).length < 3) {
      return [new Diagnostic({
        code: "JEV012", severity: "warning", questionId: q.id,
        message: "Instructions are too terse to state a condition.",
        evidence: text,
        hint: "State the exact condition being judged, in language an average reader would " +
              "resolve the same way you do.",
      })];
    }
    return [];
  });

// -- JEV013 Question ids are not sent to the model --------------------------

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const checkIdReference = (ctx: LintContext): Diagnostic[] => {
  const ids = ctx.questions.map((q) => q.id);
  return ctx.questions.flatMap((q) => {
    const text = q.instructionsText;
    const referenced = ids
      .filter((other) => other !== q.id)
      .filter((other) => new RegExp(`(?<![\\w.\`])${escapeRe(other)}(?![\\w\`])`).test(text))
      .sort();
    return referenced.length
      ? [new Diagnostic({
          code: "JEV013", severity: "warning", questionId: q.id,
          message: "Instructions refer to another question by its id.",
          evidence: referenced.join(", "),
          hint: "Question ids are for your code and are not sent to the model. Questions in " +
                "one request are answered in parallel and cannot see each other. State the " +
                "premise explicitly, or split into a second request.",
        })]
      : [];
  });
};

// -- JEV014 / JEV015 Budgets ------------------------------------------------

const checkStateBudget = (ctx: LintContext): Diagnostic[] =>
  ctx.budget.overState
    ? [new Diagnostic({
        code: "JEV014", severity: "error", questionId: null,
        message: `state plus the longest question is about ${ctx.budget.longestPair.toLocaleString("en-US")} tokens, over the 32,000 limit.`,
        evidence: `longest question: ${ctx.budget.longestQuestionId}`,
        hint: "Retrieve and filter in code so the state carries only the fields this " +
              "judgment needs. Estimates are approximate; leave headroom.",
      })]
    : [];

const checkTotalBudget = (ctx: LintContext): Diagnostic[] =>
  ctx.budget.overTotal
    ? [new Diagnostic({
        code: "JEV015", severity: "error", questionId: null,
        message: `state plus all ${ctx.questions.length} questions is about ${ctx.budget.total.toLocaleString("en-US")} tokens, over the 64,000 limit.`,
        hint: "Split into several requests, or drop speculative questions that this state " +
              "can never make relevant.",
      })]
    : [];

// -- JEV016 Noisy state -----------------------------------------------------

const LARGE_STATE_RATIO = 8;
const LARGE_STATE_FLOOR = 4_000;

const checkStateSize = (ctx: LintContext): Diagnostic[] => {
  const b = ctx.budget;
  if (b.overState || b.overTotal) return []; // Already an error; don't double up.
  const questionTokens = Object.values(b.questionTokens).reduce((a, c) => a + c, 0) || 1;
  const ratio = b.stateTokens / questionTokens;
  if (b.stateTokens >= LARGE_STATE_FLOOR && ratio >= LARGE_STATE_RATIO) {
    return [new Diagnostic({
      code: "JEV016", severity: "info", questionId: null,
      message: `state is about ${b.stateTokens.toLocaleString("en-US")} tokens against ${questionTokens.toLocaleString("en-US")} tokens of questions (${Math.round(ratio)}x).`,
      hint: "Accuracy falls as the state grows with content unrelated to the decision, and " +
            "a large state makes a wrong answer hard to attribute. Filter in code first, or " +
            "use a Noul to screen for relevance.",
    })];
  }
  return [];
};

// -- JEV017 Numeric representations ----------------------------------------

const NUMERIC_REPR = [
  /#[0-9a-fA-F]{6}\b/, /\brgba?\s*\(/i, /\bhex(?:adecimal)? (?:value|code|colou?r)\b/i,
  /\bbinary (?:value|encoding|representation)\b/i, /\bbase64\b/i,
  /\bassembly (?:instruction|opcode)\b/i, /\bopcode\b/i, /\bbytecode\b/i,
];

const checkNumericRepr = (ctx: LintContext): Diagnostic[] =>
  ctx.questions.flatMap((q) => {
    const hit = find(NUMERIC_REPR, q.text);
    return hit
      ? [new Diagnostic({
          code: "JEV017", severity: "warning", questionId: q.id,
          message: "Question reasons over a machine-oriented numeric representation.",
          evidence: hit,
          hint: "jev-1.13 does better on semantic representations than numeric ones: colour " +
                "names beat hex, high-level code beats bytecode. Convert in code and pass " +
                "the name or a named bucket.",
        })]
      : [];
  });

// -- JEV018 Duplicate judgments --------------------------------------------

const checkDuplicates = (ctx: LintContext): Diagnostic[] => {
  const seen = new Map<string, string>();
  const out: Diagnostic[] = [];
  for (const q of ctx.questions) {
    const key = q.text.toLowerCase().replace(/\W+/g, " ").trim();
    if (!key) continue;
    const prior = seen.get(key);
    if (prior !== undefined) {
      out.push(new Diagnostic({
        code: "JEV018", severity: "info", questionId: q.id,
        message: `Question is textually identical to "${prior}".`,
        hint: "Identical questions in one request cost tokens twice for the same answer. If " +
              "you meant to measure self-consistency, note that they are evaluated in one " +
              "pass and are not independent samples.",
      }));
    } else {
      seen.set(key, q.id);
    }
  }
  return out;
};

export const RULES: Rule[] = [
  { code: "JEV001", name: "math-and-counting", mode: "Math and Numbers", check: checkMath },
  { code: "JEV002", name: "date-comparison", mode: "Date and time comparison", check: checkDates },
  { code: "JEV003", name: "generation-request", mode: "Generation", check: checkGeneration },
  { code: "JEV004", name: "negation", mode: "Literal reading", check: checkNegation },
  { code: "JEV005", name: "vague-scoping", mode: "Literal reading", check: checkVague },
  { code: "JEV006", name: "indirection", mode: "Indirection", check: checkIndirection },
  { code: "JEV007", name: "noul-polarity", mode: "Contradictory instructions and criteria", check: checkNoulPolarity },
  { code: "JEV008", name: "choice-no-match", mode: "Common-sense structural invariants", check: checkChoiceNoMatch },
  { code: "JEV009", name: "choice-arity", mode: "Common-sense structural invariants", check: checkChoiceArity },
  { code: "JEV010", name: "option-descriptions", mode: "Literal reading", check: checkEmptyDescriptions },
  { code: "JEV011", name: "score-levels", mode: "Literal reading", check: checkScoreLevels },
  { code: "JEV012", name: "instructions-present", mode: "Literal reading", check: checkInstructions },
  { code: "JEV013", name: "question-id-reference", mode: "Indirection", check: checkIdReference },
  { code: "JEV014", name: "state-budget", mode: "Large state full of irrelevant detail", check: checkStateBudget },
  { code: "JEV015", name: "total-budget", mode: "Large state full of irrelevant detail", check: checkTotalBudget },
  { code: "JEV016", name: "state-noise-ratio", mode: "Large state full of irrelevant detail", check: checkStateSize },
  { code: "JEV017", name: "numeric-representation", mode: "Math and Numbers", check: checkNumericRepr },
  { code: "JEV018", name: "duplicate-questions", mode: "Common-sense structural invariants", check: checkDuplicates },
];

export function rulesFor(codes?: Iterable<string>): Rule[] {
  if (!codes) return [...RULES];
  const wanted = new Set([...codes].map((c) => c.toUpperCase()));
  return RULES.filter((r) => wanted.has(r.code));
}

export function allCodes(): string[] {
  return RULES.map((r) => r.code);
}
