export type EditMode = "modifica_libera" | "inpaint" | "outpaint";

const EDIT_MODES: readonly EditMode[] = ["modifica_libera", "inpaint", "outpaint"];

/** The edit mode named by a `?mode=` link (e.g. "Modifica con le parole" on a result), or null if unknown. */
export function parseEditMode(value: string | null): EditMode | null {
  return EDIT_MODES.find((mode) => mode === value) ?? null;
}
