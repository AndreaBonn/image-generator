import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GalleryFilters } from "@/components/gallery/GalleryFilters";
import { buildTask } from "../../fixtures/task";

function baseProps() {
  return {
    tasks: [
      buildTask({ id: "qualita", label: "Immagine di qualità" }),
      buildTask({ id: "veloce", label: "Immagine veloce" }),
    ],
    taskId: "",
    onTaskIdChange: vi.fn(),
    favoriteOnly: false,
    onFavoriteOnlyChange: vi.fn(),
    searchInput: "",
    onSearchInputChange: vi.fn(),
  };
}

describe("GalleryFilters", () => {
  it("lists every task plus the all-tasks default option", () => {
    render(<GalleryFilters {...baseProps()} />);

    expect(screen.getByRole("option", { name: "Tutti i compiti" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Immagine di qualità" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Immagine veloce" })).toBeInTheDocument();
  });

  it("reflects the current taskId in the select value", () => {
    render(<GalleryFilters {...baseProps()} taskId="veloce" />);

    expect(screen.getByRole("combobox", { name: "Compito" })).toHaveValue("veloce");
  });

  it("calls onTaskIdChange with the selected task id", async () => {
    const onTaskIdChange = vi.fn();
    render(<GalleryFilters {...baseProps()} onTaskIdChange={onTaskIdChange} />);

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Compito" }), "veloce");

    expect(onTaskIdChange).toHaveBeenCalledWith("veloce");
  });

  it("checks the favorite-only checkbox when favoriteOnly is true", () => {
    render(<GalleryFilters {...baseProps()} favoriteOnly={true} />);

    expect(screen.getByLabelText("Solo preferiti")).toBeChecked();
  });

  it("leaves the favorite-only checkbox unchecked when favoriteOnly is false", () => {
    render(<GalleryFilters {...baseProps()} favoriteOnly={false} />);

    expect(screen.getByLabelText("Solo preferiti")).not.toBeChecked();
  });

  it("calls onFavoriteOnlyChange with true when the unchecked box is clicked", async () => {
    const onFavoriteOnlyChange = vi.fn();
    render(<GalleryFilters {...baseProps()} favoriteOnly={false} onFavoriteOnlyChange={onFavoriteOnlyChange} />);

    await userEvent.click(screen.getByLabelText("Solo preferiti"));

    expect(onFavoriteOnlyChange).toHaveBeenCalledWith(true);
  });

  it("calls onFavoriteOnlyChange with false when the checked box is clicked", async () => {
    const onFavoriteOnlyChange = vi.fn();
    render(<GalleryFilters {...baseProps()} favoriteOnly={true} onFavoriteOnlyChange={onFavoriteOnlyChange} />);

    await userEvent.click(screen.getByLabelText("Solo preferiti"));

    expect(onFavoriteOnlyChange).toHaveBeenCalledWith(false);
  });

  it("shows the current search text in the search input", () => {
    render(<GalleryFilters {...baseProps()} searchInput="tramonto" />);

    expect(screen.getByPlaceholderText("Cerca...")).toHaveValue("tramonto");
  });

  it("calls onSearchInputChange with the new search text", () => {
    const onSearchInputChange = vi.fn();
    render(<GalleryFilters {...baseProps()} onSearchInputChange={onSearchInputChange} />);

    fireEvent.change(screen.getByPlaceholderText("Cerca..."), { target: { value: "tramonto" } });

    expect(onSearchInputChange).toHaveBeenCalledWith("tramonto");
  });
});
