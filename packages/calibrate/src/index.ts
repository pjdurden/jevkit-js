/**
 * Verify Jev's calibration on your own data, and pick thresholds from it.
 *
 * Calibration is the central claim behind a System One model, and the one thing
 * a user cannot check without tooling. This package computes reliability
 * diagrams, ECE, MCE, Brier and log loss over labeled answers, and turns a
 * labeled set into a defensible confidence threshold.
 *
 * No dependencies beyond jevkit-core. A calibration check that drags in a
 * numerical stack is a calibration check that does not get run.
 */

export {
  Bin, CalibrationReport, Observation, brierScore, calibrate,
  expectedCalibrationError, logLoss, maximumCalibrationError, reliabilityBins,
  type ObservationInit,
} from "./metrics.js";
export { observationsFromRecords, type ExtractOptions } from "./records.js";
export {
  ThresholdPoint, recommendForAccuracy, recommendForCoverage, sweep,
} from "./thresholds.js";

export const VERSION = "0.1.0";
