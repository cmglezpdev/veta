import type { RunRecord } from "./run-record.ts";
import { STEP_ORDER, type StepName } from "./steps.ts";

/**
 * First step that still needs work, or null when every step is terminal.
 *
 * `complete` and `skipped` are both treated as finished; only `pending` blocks
 * resume.
 */
export function firstIncompleteStep(record: RunRecord): StepName | null {
  for (const step of STEP_ORDER) {
    if (record.steps[step] === "pending") {
      return step;
    }
  }
  return null;
}
