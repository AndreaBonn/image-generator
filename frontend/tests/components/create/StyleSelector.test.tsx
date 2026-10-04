import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StyleSelector } from "@/components/create/StyleSelector";
import * as queries from "@/api/queries";
import type { Style } from "@/api/types";

function buildStyle(overrides: Partial<Style> = {}): Style {
  return { id: "fooocus-enhance", name: "Fooocus Enhance", source_file: "sdxl_styles_fooocus.json", ...overrides };
}

function renderStyleSelector(selected: string[], onChange = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <StyleSelector selected={selected} onChange={onChange} />
    </QueryClientProvider>,
  );
  return onChange;
}

describe("StyleSelector", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the placeholder when no style is selected", async () => {
    vi.spyOn(queries, "fetchStyles").mockResolvedValue([]);
    renderStyleSelector([]);
    await vi.advanceTimersByTimeAsync(300);

    expect(screen.getByText("Nessuno stile scelto.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Stili scelti")).not.toBeInTheDocument();
  });

  it("renders a chip per selected style, pressed, with a remove control", async () => {
    vi.spyOn(queries, "fetchStyles").mockResolvedValue([]);
    renderStyleSelector(["fooocus-enhance"]);
    await vi.advanceTimersByTimeAsync(300);

    const chip = screen.getByRole("button", { name: /fooocus-enhance/ });
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Nessuno stile scelto.")).not.toBeInTheDocument();
  });

  it("removes a style from the selection when its chip is clicked", async () => {
    vi.spyOn(queries, "fetchStyles").mockResolvedValue([]);
    const onChange = renderStyleSelector(["fooocus-enhance", "fooocus-sharp"]);
    await vi.advanceTimersByTimeAsync(300);

    await userEvent.click(screen.getByRole("button", { name: /fooocus-enhance/ }));
    expect(onChange).toHaveBeenCalledWith(["fooocus-sharp"]);
  });

  it("fetches styles on mount with an empty query and lists only the Fooocus-prefixed ones (SPEC.md § 3.5)", async () => {
    const fetchStyles = vi
      .spyOn(queries, "fetchStyles")
      .mockResolvedValue([
        buildStyle({ id: "fooocus-enhance", name: "Fooocus Enhance" }),
        buildStyle({ id: "watercolor", name: "SAI Watercolor" }),
      ]);
    renderStyleSelector([]);
    await vi.advanceTimersByTimeAsync(300);

    await waitFor(() => expect(fetchStyles).toHaveBeenCalledWith("", expect.anything()));
    expect(await screen.findByRole("button", { name: "Fooocus Enhance" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "SAI Watercolor" })).not.toBeInTheDocument();
  });

  it("adds a style to the selection when an unselected style is clicked", async () => {
    vi.spyOn(queries, "fetchStyles").mockResolvedValue([buildStyle({ id: "fooocus-enhance", name: "Fooocus Enhance" })]);
    const onChange = renderStyleSelector(["fooocus-sharp"]);
    await vi.advanceTimersByTimeAsync(300);

    await userEvent.click(await screen.findByRole("button", { name: "Fooocus Enhance" }));
    expect(onChange).toHaveBeenCalledWith(["fooocus-sharp", "fooocus-enhance"]);
  });

  it("disables unselected style buttons once 5 styles are selected (SPEC.md § 3.5 max)", async () => {
    vi.spyOn(queries, "fetchStyles").mockResolvedValue([buildStyle({ id: "fooocus-enhance", name: "Fooocus Enhance" })]);
    renderStyleSelector(["s1", "s2", "s3", "s4", "s5"]);
    await vi.advanceTimersByTimeAsync(300);

    expect(await screen.findByRole("button", { name: "Fooocus Enhance" })).toBeDisabled();
  });

  it("debounces the search and refetches with the trimmed query", async () => {
    const fetchStyles = vi.spyOn(queries, "fetchStyles").mockResolvedValue([]);
    renderStyleSelector([]);
    await vi.advanceTimersByTimeAsync(300);
    fetchStyles.mockClear();

    fireEvent.change(screen.getByLabelText("Cerca uno stile"), { target: { value: "anime" } });
    await vi.advanceTimersByTimeAsync(300);

    await waitFor(() => expect(fetchStyles).toHaveBeenLastCalledWith("anime", expect.anything()));
  });

  it("shows the 'refine your search' hint once results are hidden with a non-empty query", async () => {
    const manyStyles = Array.from({ length: 30 }, (_, i) => buildStyle({ id: `anime-${i}`, name: `Anime ${i}` }));
    vi.spyOn(queries, "fetchStyles").mockResolvedValue(manyStyles);
    renderStyleSelector([]);
    await vi.advanceTimersByTimeAsync(300);

    fireEvent.change(screen.getByLabelText("Cerca uno stile"), { target: { value: "anime" } });
    await vi.advanceTimersByTimeAsync(300);

    expect(await screen.findByText(/Altri \d+ risultati: affina la ricerca\./)).toBeInTheDocument();
  });

  it("shows the 'search by name' hint when the empty-query pool has more than the visible limit", async () => {
    const manyFooocusStyles = Array.from({ length: 30 }, (_, i) =>
      buildStyle({ id: `fooocus-${i}`, name: `Fooocus ${i}` }),
    );
    vi.spyOn(queries, "fetchStyles").mockResolvedValue(manyFooocusStyles);
    renderStyleSelector([]);
    await vi.advanceTimersByTimeAsync(300);

    expect(
      await screen.findByText(/Altri \d+ stili disponibili: cercali per nome\./),
    ).toBeInTheDocument();
  });
});
