import { describe, expect, it } from "vitest";
import { licenseLabel } from "@/lib/modelLicense";

describe("licenseLabel (I3)", () => {
  it.each([
    ["apache-2.0", "Libera, anche commerciale (Apache 2.0)"],
    ["mit", "Libera, anche commerciale (MIT)"],
    ["openrail++", "Libera, con alcuni divieti d'uso (OpenRAIL++)"],
    ["cc-by-nc-sa-4.0", "Solo uso non commerciale (CC BY-NC-SA 4.0)"],
  ])("says %s in words", (raw, expected) => {
    expect(licenseLabel(raw)).toBe(expected);
  });

  it("keeps a license already written in words", () => {
    expect(licenseLabel("Fooocus, da verificare prima di un uso commerciale")).toBe(
      "Fooocus, da verificare prima di un uso commerciale",
    );
  });
});
