import type { Style } from "@/api/types";

/** How many search matches the picker renders before asking to refine the query. */
export const MAX_VISIBLE_MATCHES = 24;
const FEATURED_PREFIX = "Fooocus";

export interface VisibleStyles {
  visible: Style[];
  hiddenCount: number;
}

/**
 * Which unselected styles the picker lists (SPEC.md § 3.5). Fooocus ships about 280
 * styles: rendering all of them buries the rest of the form, so without a query only
 * the "Fooocus" family is listed, and a query shows its first matches. Selected styles
 * are rendered separately by the picker, so they are excluded here.
 */
export function pickVisibleStyles(styles: Style[], query: string, selected: string[]): VisibleStyles {
  const unselected = styles.filter((style) => !selected.includes(style.id));
  const pool =
    query.trim() === ""
      ? unselected.filter((style) => style.name.startsWith(FEATURED_PREFIX))
      : unselected;
  const visible = pool.slice(0, MAX_VISIBLE_MATCHES);
  return { visible, hiddenCount: unselected.length - visible.length };
}
