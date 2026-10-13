// Upper bounds of each word on the denoise scale of "Ingrandisci con rifinitura" (catalog range 0.1-0.5).
const LIGHT_MAX = 0.2;
const MEDIUM_MAX = 0.35;

/** The refinement strength said in words (P3): a decimal like 0.30 has no scale for most users. */
export function refinementLevel(denoise: number): "poco" | "abbastanza" | "molto" {
  if (denoise <= LIGHT_MAX) return "poco";
  if (denoise <= MEDIUM_MAX) return "abbastanza";
  return "molto";
}
