#!/usr/bin/env node
/** `jevkit-calibrate` command line interface. */

import { RecordFormatError, readRecords, type Record as JevlRecord } from "jevkit-core";

import { calibrate } from "./metrics.js";
import { observationsFromRecords } from "./records.js";
import { recommendForAccuracy, recommendForCoverage } from "./thresholds.js";

export const EXIT_OK = 0;
export const EXIT_FAILED_GATE = 1;
export const EXIT_USAGE = 2;

const USAGE = `usage: jevkit-calibrate <labeled.jevl...> [options]

Measure how well Jev's probabilities match outcomes on your labeled data, and
pick a confidence threshold from it. Never calls the API.

  --bins N               reliability bins (default 10)
  --question ID          restrict to this question id (repeatable)
  --use-confidence       calibrate the API's confidence, not the probability
  --target-accuracy F    recommend the lowest threshold reaching this accuracy
  --min-coverage F       recommend the highest threshold still covering this
  --max-ece F            exit non-zero if ECE exceeds this
  --format text|json
  --no-diagram`;

export function main(argv: string[] = process.argv.slice(2)): number {
  const files: string[] = [];
  const questions: string[] = [];
  let bins = 10;
  let useConfidence = false;
  let targetAccuracy: number | null = null;
  let minCoverage: number | null = null;
  let maxEce: number | null = null;
  let format: "text" | "json" = "text";
  let noDiagram = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    switch (arg) {
      case "--bins": bins = Number(argv[++i]); break;
      case "--question": questions.push(String(argv[++i])); break;
      case "--use-confidence": useConfidence = true; break;
      case "--target-accuracy": targetAccuracy = Number(argv[++i]); break;
      case "--min-coverage": minCoverage = Number(argv[++i]); break;
      case "--max-ece": maxEce = Number(argv[++i]); break;
      case "--no-diagram": noDiagram = true; break;
      case "--format": {
        const v = argv[++i];
        if (v !== "text" && v !== "json") { console.error("jevkit-calibrate: --format expects text or json"); return EXIT_USAGE; }
        format = v; break;
      }
      case "-h": case "--help": console.log(USAGE); return EXIT_OK;
      default:
        if (arg.startsWith("--")) { console.error(`jevkit-calibrate: unknown option ${arg}`); return EXIT_USAGE; }
        files.push(arg);
    }
  }

  if (!files.length) { console.error(USAGE); return EXIT_USAGE; }

  const records: JevlRecord[] = [];
  try {
    for (const path of files) records.push(...readRecords(path));
  } catch (err) {
    const message = err instanceof RecordFormatError ? err.message : (err as Error).message;
    console.error(`jevkit-calibrate: ${message}`);
    return EXIT_USAGE;
  }

  const observations = observationsFromRecords(records, {
    questionIds: questions.length ? questions : undefined,
    useConfidence,
  });
  if (!observations.length) {
    console.error(
      "jevkit-calibrate: no labeled observations found. Records need a 'label' object " +
      "keyed by question id.",
    );
    return EXIT_USAGE;
  }

  const report = calibrate(observations, bins);
  const recommendation =
    targetAccuracy !== null
      ? { kind: "accuracy" as const, target: targetAccuracy, point: recommendForAccuracy(observations, targetAccuracy) }
      : minCoverage !== null
        ? { kind: "coverage" as const, target: minCoverage, point: recommendForCoverage(observations, minCoverage) }
        : null;

  if (format === "json") {
    const payload: Record<string, unknown> = { ...report.toJSON() };
    if (recommendation) {
      const p = recommendation.point;
      payload["recommendation"] = {
        for: recommendation.kind, target: recommendation.target,
        threshold: p?.threshold ?? null, coverage: p?.coverage ?? null,
        accuracy: p?.accuracy ?? null, errors: p?.errors ?? null,
      };
    }
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(report.summary());
    if (!noDiagram) { console.log(); console.log(report.diagram()); }
    if (recommendation) {
      console.log();
      const { kind, target, point } = recommendation;
      if (!point) {
        console.log(
          kind === "accuracy"
            ? `No threshold reaches ${(target * 100).toFixed(1)}% accuracy on this data. The ` +
              `question cannot be automated at that bar; change the question rather than the threshold.`
            : `No threshold covers ${(target * 100).toFixed(1)}% of cases.`,
        );
      } else {
        console.log(
          `threshold ${point.threshold.toFixed(2)}: covers ${(point.coverage * 100).toFixed(1)}% ` +
          `(${point.covered}/${point.total}) at ${(point.accuracy * 100).toFixed(1)}% accuracy, ` +
          `${point.errors} wrong answer(s) acted on, ${point.escalated} escalated`,
        );
      }
    }
  }

  if (maxEce !== null && report.ece > maxEce) {
    console.error(`jevkit-calibrate: ECE ${report.ece.toFixed(4)} exceeds ${maxEce}`);
    return EXIT_FAILED_GATE;
  }
  return EXIT_OK;
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) process.exit(main());
