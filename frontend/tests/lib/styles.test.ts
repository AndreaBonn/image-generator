import { describe, expect, it } from "vitest";
import { MAX_VISIBLE_MATCHES, pickVisibleStyles } from "@/lib/styles";
import type { Style } from "@/api/types";

function style(name: string): Style {
  return { id: name, name, source_file: "sdxl_styles.json" };
}

const catalog = [
  style("Fooocus Sharp"),
  style("Fooocus Enhance"),
  ...Array.from({ length: 40 }, (_, i) => style(`sai-style-${i}`)),
];

describe("pickVisibleStyles", () => {
  it("lists only the Fooocus family without a query and counts the rest", () => {
    const result = pickVisibleStyles(catalog, "", []);
    expect(result.visible.map((s) => s.name)).toEqual(["Fooocus Sharp", "Fooocus Enhance"]);
    expect(result.hiddenCount).toBe(40);
  });

  it("caps search matches and reports how many are hidden", () => {
    const matches = catalog.slice(2);
    const result = pickVisibleStyles(matches, "sai", []);
    expect(result.visible).toHaveLength(MAX_VISIBLE_MATCHES);
    expect(result.hiddenCount).toBe(40 - MAX_VISIBLE_MATCHES);
  });

  it("never lists an already selected style", () => {
    const result = pickVisibleStyles(catalog, "", ["Fooocus Sharp"]);
    expect(result.visible.map((s) => s.name)).toEqual(["Fooocus Enhance"]);
  });
});
