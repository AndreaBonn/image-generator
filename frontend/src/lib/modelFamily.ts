const FAMILY_LABELS: Record<string, string> = {
  sdxl: "SDXL (Juggernaut)",
  sdxl_libero: "SDXL (Lustify)",
  flux2_klein: "FLUX.2 klein",
  zimage: "Z-Image",
  upscale: "Ingrandimento",
};

/** Human-readable family name for "modello in memoria" (SPEC.md § 5.3, § 11.2). */
export function familyLabel(family: string | null): string {
  if (family === null) return "Nessuno";
  return FAMILY_LABELS[family] ?? family;
}
