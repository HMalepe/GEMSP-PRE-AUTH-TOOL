export interface LateJoinerPenaltyResult {
  applies: boolean;
  /** A in the formula below — years without cover past age 35. 0 when the penalty doesn't apply. */
  yearsWithoutCover: number;
  /** The Regulation 13(2) band, as a loading fraction on the risk contribution. 0 when the penalty doesn't apply. */
  loadingFraction: number;
}

const BANDS: readonly [maxYears: number, fraction: number][] = [
  [4, 0.05],
  [14, 0.25],
  [24, 0.5],
  [Infinity, 0.75],
];

/**
 * Late Joiner Penalty per Regulation 13(2) of the Medical Schemes Act 131
 * of 1998 (docs/gems-annexures-compilation.md §7). Applicants under 35 at
 * application are never penalised.
 *
 * A = B - (35 + C)
 *   B = age at application
 *   C = years of prior creditable cover
 *   A = years without cover past age 35, banded into a loading fraction:
 *       1-4y -> 0.05x, 5-14y -> 0.25x, 15-24y -> 0.50x, 25y+ -> 0.75x
 *
 * This is a contribution/premium loading — it has no field on the §4.3
 * decision object. Gate 7 surfaces it only as an informational reason.
 */
export function calculateLateJoinerPenalty(ageAtApplication: number, priorCoverYears: number): LateJoinerPenaltyResult {
  if (ageAtApplication < 35) {
    return { applies: false, yearsWithoutCover: 0, loadingFraction: 0 };
  }

  const yearsWithoutCover = ageAtApplication - (35 + priorCoverYears);
  if (yearsWithoutCover <= 0) {
    return { applies: false, yearsWithoutCover: 0, loadingFraction: 0 };
  }

  const band = BANDS.find(([maxYears]) => yearsWithoutCover <= maxYears);
  const loadingFraction = band ? band[1] : 0.75;

  return { applies: true, yearsWithoutCover, loadingFraction };
}
