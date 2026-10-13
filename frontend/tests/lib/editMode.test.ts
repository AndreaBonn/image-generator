import { describe, expect, it } from "vitest";
import { parseEditMode } from "@/lib/editMode";

describe("parseEditMode", () => {
  it.each(["modifica_libera", "inpaint", "outpaint"] as const)("accepts the known mode %s", (mode) => {
    expect(parseEditMode(mode)).toBe(mode);
  });

  it.each([null, "", "sconosciuto", "INPAINT"])("returns null for %o", (value) => {
    expect(parseEditMode(value)).toBeNull();
  });
});
