import { describe, expect, it } from "vitest";
import { modelStatusLabel } from "@/lib/modelStatus";

describe("modelStatusLabel", () => {
  it("translates every model status to Italian", () => {
    expect(modelStatusLabel("installed")).toBe("Installato");
    expect(modelStatusLabel("missing")).toBe("Mancante");
  });
});
