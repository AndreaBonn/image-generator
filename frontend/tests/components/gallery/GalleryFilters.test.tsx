import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GalleryFilters } from "@/components/gallery/GalleryFilters";

function baseProps() {
  return {
    kind: "" as const,
    onKindChange: vi.fn(),
    favoriteOnly: false,
    onFavoriteOnlyChange: vi.fn(),
    searchInput: "",
    onSearchInputChange: vi.fn(),
  };
}

describe("GalleryFilters", () => {
  it("labels the search box with the plain word descrizione", () => {
    render(<GalleryFilters {...baseProps()} />);

    expect(screen.getByLabelText("Cerca nella descrizione")).toBeInTheDocument();
  });

  it("offers quick filters by kind of work instead of a task menu (G3)", () => {
    render(<GalleryFilters {...baseProps()} />);

    const group = screen.getByRole("group", { name: "Tipo di lavoro" });
    const names = within(group)
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(names).toEqual(["Tutte", "Create", "Modificate", "Migliorate"]);
    expect(within(group).getByRole("button", { name: "Tutte" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("marks the current kind as pressed", () => {
    render(<GalleryFilters {...baseProps()} kind="modifica" />);

    expect(screen.getByRole("button", { name: "Modificate" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Tutte" })).toHaveAttribute("aria-pressed", "false");
  });

  it("calls onKindChange with the chosen group", async () => {
    const onKindChange = vi.fn();
    render(<GalleryFilters {...baseProps()} onKindChange={onKindChange} />);

    await userEvent.click(screen.getByRole("button", { name: "Migliorate" }));
    await userEvent.click(screen.getByRole("button", { name: "Tutte" }));

    expect(onKindChange.mock.calls).toEqual([["migliora"], [""]]);
  });

  it("shows the favorites filter as a pressed toggle when active", () => {
    render(<GalleryFilters {...baseProps()} favoriteOnly={true} />);

    expect(screen.getByRole("button", { name: "★ Preferite" })).toHaveAttribute("aria-pressed", "true");
  });

  it("toggles the favorites filter", async () => {
    const onFavoriteOnlyChange = vi.fn();
    render(<GalleryFilters {...baseProps()} favoriteOnly={false} onFavoriteOnlyChange={onFavoriteOnlyChange} />);

    await userEvent.click(screen.getByRole("button", { name: "★ Preferite" }));

    expect(onFavoriteOnlyChange).toHaveBeenCalledWith(true);
  });

  it("shows the current search text in the search input", () => {
    render(<GalleryFilters {...baseProps()} searchInput="tramonto" />);

    expect(screen.getByLabelText("Cerca nella descrizione")).toHaveValue("tramonto");
  });

  it("calls onSearchInputChange with the new search text", () => {
    const onSearchInputChange = vi.fn();
    render(<GalleryFilters {...baseProps()} onSearchInputChange={onSearchInputChange} />);

    fireEvent.change(screen.getByLabelText("Cerca nella descrizione"), { target: { value: "tramonto" } });

    expect(onSearchInputChange).toHaveBeenCalledWith("tramonto");
  });
});
