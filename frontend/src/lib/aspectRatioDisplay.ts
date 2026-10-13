const LABEL_SIZE_SEPARATOR = " · ";
// Width/height ratio of the featured formats and the use people know them by (C10).
const TYPICAL_USES: ReadonlyArray<{ ratio: number; use: string }> = [
  { ratio: 9 / 16, use: "storie, telefono" },
  { ratio: 4 / 5, use: "post social" },
  { ratio: 1, use: "profilo, post" },
  { ratio: 1152 / 896, use: "foto classica" },
  { ratio: 3 / 2, use: "fotografia" },
  { ratio: 16 / 9, use: "schermo, video" },
];
const RATIO_TOLERANCE = 0.05;

/** "Verticale 9:16 · 768×1344" → "Verticale 9:16": the pixel size means nothing to most users. */
export function ratioName(label: string): string {
  return label.split(LABEL_SIZE_SEPARATOR)[0] ?? label;
}

/** Typical use of a format, or null when the shape has no common one. */
export function ratioUse(width: number, height: number): string | null {
  const ratio = width / height;
  const match = TYPICAL_USES.find((entry) => Math.abs(entry.ratio - ratio) <= RATIO_TOLERANCE);
  return match?.use ?? null;
}
