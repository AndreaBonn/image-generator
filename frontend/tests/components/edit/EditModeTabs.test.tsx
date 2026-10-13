import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { EditModeTabs } from "@/components/edit/EditModeTabs";

describe("EditModeTabs (M1)", () => {
  it("explains each mode in one line under its name", () => {
    render(<EditModeTabs mode="modifica_libera" onSelect={vi.fn()} />);

    expect(screen.getByRole("tab", { name: "Modifica con le parole" })).toHaveAccessibleDescription(
      "Scrivi cosa cambiare, anche in italiano",
    );
    expect(screen.getByRole("tab", { name: "Modifica una parte" })).toHaveAccessibleDescription(
      "Colora la zona da rifare",
    );
    expect(screen.getByRole("tab", { name: "Allarga l'immagine" })).toHaveAccessibleDescription(
      "Aggiungi spazio ai lati",
    );
  });
});
