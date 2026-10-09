import type { Severity } from "./types.ts";

/** How much one affected row costs the score, by its worst severity. Shown in the app. */
export const SCORE_WEIGHTS: Record<Severity, number> = { blocking: 1, warning: 0.4, tidy: 0.1 };

/**
 * 100 minus the weighted share of rows with a problem, rounded and kept between
 * 0 and 100. Each row counts once, under its worst severity.
 */
export function score(rowsAffected: Record<Severity, number>, rowCount: number): number {
  if (rowCount <= 0) return 100;
  const cost =
    SCORE_WEIGHTS.blocking * rowsAffected.blocking +
    SCORE_WEIGHTS.warning * rowsAffected.warning +
    SCORE_WEIGHTS.tidy * rowsAffected.tidy;
  return Math.max(0, Math.min(100, Math.round(100 * (1 - cost / rowCount))));
}
