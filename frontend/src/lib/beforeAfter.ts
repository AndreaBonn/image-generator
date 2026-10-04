/** Pure clip-path math for the Migliora before/after comparison slider (SPEC.md § 11.2). */

/**
 * CSS `clip-path` that reveals the "after" image from the left up to
 * `percent` of its width, hiding the rest so the "before" image underneath
 * shows through. Clamped to [0, 100] so an out-of-range slider value never
 * produces a negative inset.
 */
export function clipPathForPercent(percent: number): string {
  const clamped = Math.min(100, Math.max(0, percent));
  return `inset(0 ${100 - clamped}% 0 0)`;
}
