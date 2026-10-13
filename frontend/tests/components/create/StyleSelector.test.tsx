import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StyleSelector } from "@/components/create/StyleSelector";
import * as queries from "@/api/queries";
import type { Style } from "@/api/types";

function buildStyle(overrides: Partial<Style> = {}): Style {
  return {
    id: "fooocus-enhance",
    name: "Fooocus Enhance",
    source_file: "sdxl_styles_fooocus.json",
    preview_url: null,
    ...overrides,
  };
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

async function openCatalog() {
  await userEvent.click(screen.getByRole("button", { name: "Sfoglia tutti gli stili" }));
}

describe("StyleSelector", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("explains the styles in plain text instead of a ? button (S3)", async () => {
    vi.spyOn(queries, "fetchStyles").mockResolvedValue([]);
    renderStyleSelector([]);

    expect(await screen.findByText("Facoltativi: danno un aspetto preciso, come acquerello o foto.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Informazioni/ })).not.toBeInTheDocument();
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

  it("keeps the catalog closed until the user asks to browse it (C9)", async () => {
    vi.spyOn(queries, "fetchStyles").mockResolvedValue([buildStyle({ id: "watercolor", name: "SAI Watercolor" })]);
    renderStyleSelector([]);
    await vi.advanceTimersByTimeAsync(300);

    expect(screen.getByRole("group", { name: "Stili (facoltativi, massimo 5)" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Cerca uno stile")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "SAI Watercolor" })).not.toBeInTheDocument();

    await openCatalog();
    expect(screen.getByLabelText("Cerca uno stile")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "SAI Watercolor" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Chiudi il catalogo" }));
    expect(screen.queryByLabelText("Cerca uno stile")).not.toBeInTheDocument();
  });

  it("fetches styles on mount with an empty query and lists every unselected style, browsable without a query (SPEC.md § O9)", async () => {
    const fetchStyles = vi
      .spyOn(queries, "fetchStyles")
      .mockResolvedValue([
        buildStyle({ id: "fooocus-enhance", name: "Fooocus Enhance" }),
        buildStyle({ id: "watercolor", name: "SAI Watercolor" }),
      ]);
    renderStyleSelector([]);
    await openCatalog();
    await vi.advanceTimersByTimeAsync(300);

    await waitFor(() => expect(fetchStyles).toHaveBeenCalledWith("", expect.anything()));
    expect(await screen.findByRole("button", { name: "Fooocus Enhance" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "SAI Watercolor" })).toBeInTheDocument();
  });

  it("adds a style to the selection when an unselected style is clicked", async () => {
    vi.spyOn(queries, "fetchStyles").mockResolvedValue([buildStyle({ id: "fooocus-enhance", name: "Fooocus Enhance" })]);
    const onChange = renderStyleSelector(["fooocus-sharp"]);
    await openCatalog();
    await vi.advanceTimersByTimeAsync(300);

    await userEvent.click(await screen.findByRole("button", { name: "Fooocus Enhance" }));
    expect(onChange).toHaveBeenCalledWith(["fooocus-sharp", "fooocus-enhance"]);
  });

  it("disables unselected style buttons once 5 styles are selected (SPEC.md § 3.5 max)", async () => {
    vi.spyOn(queries, "fetchStyles").mockResolvedValue([buildStyle({ id: "fooocus-enhance", name: "Fooocus Enhance" })]);
    renderStyleSelector(["s1", "s2", "s3", "s4", "s5"]);
    await openCatalog();
    await vi.advanceTimersByTimeAsync(300);

    expect(await screen.findByRole("button", { name: "Fooocus Enhance" })).toBeDisabled();
  });

  it("debounces the search and refetches with the trimmed query", async () => {
    const fetchStyles = vi.spyOn(queries, "fetchStyles").mockResolvedValue([]);
    renderStyleSelector([]);
    await openCatalog();
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
    await openCatalog();
    await vi.advanceTimersByTimeAsync(300);

    fireEvent.change(screen.getByLabelText("Cerca uno stile"), { target: { value: "anime" } });
    await vi.advanceTimersByTimeAsync(300);

    expect(await screen.findByText(/Altri \d+ risultati: affina la ricerca\./)).toBeInTheDocument();
  });

  it("shows a style count, not a hidden-count hint, when browsing without a query", async () => {
    const manyStyles = Array.from({ length: 30 }, (_, i) => buildStyle({ id: `style-${i}`, name: `Style ${i}` }));
    vi.spyOn(queries, "fetchStyles").mockResolvedValue(manyStyles);
    renderStyleSelector([]);
    await openCatalog();
    await vi.advanceTimersByTimeAsync(300);

    expect(await screen.findByText("30 stili")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Style \d+$/ })).toHaveLength(30);
    expect(screen.queryByText(/cercali per nome/)).not.toBeInTheDocument();
  });

  it("renders the preview thumbnail with explicit dimensions when the style has one", async () => {
    vi.spyOn(queries, "fetchStyles").mockResolvedValue([
      buildStyle({ id: "fooocus-enhance", name: "Fooocus Enhance", preview_url: "/api/v1/styles/previews/abc123" }),
    ]);
    renderStyleSelector([]);
    await openCatalog();
    await vi.advanceTimersByTimeAsync(300);

    const button = await screen.findByRole("button", { name: "Fooocus Enhance" });
    const img = button.querySelector("img");
    expect(img).toHaveAttribute("src", "/api/v1/styles/previews/abc123");
    expect(img).toHaveAttribute("width", "96");
    expect(img).toHaveAttribute("height", "96");
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img).toHaveAttribute("alt", "");
  });

  it("renders a neutral placeholder, no <img>, when the style has no preview", async () => {
    vi.spyOn(queries, "fetchStyles").mockResolvedValue([
      buildStyle({ id: "fooocus-enhance", name: "Fooocus Enhance", preview_url: null }),
    ]);
    renderStyleSelector([]);
    await openCatalog();
    await vi.advanceTimersByTimeAsync(300);

    const button = await screen.findByRole("button", { name: "Fooocus Enhance" });
    expect(button.querySelector("img")).not.toBeInTheDocument();
    expect(button.textContent).toContain("F");
  });

  it("keeps selection behaviour unchanged regardless of preview availability", async () => {
    vi.spyOn(queries, "fetchStyles").mockResolvedValue([
      buildStyle({ id: "fooocus-enhance", name: "Fooocus Enhance", preview_url: "/api/v1/styles/previews/abc123" }),
    ]);
    const onChange = renderStyleSelector([]);
    await openCatalog();
    await vi.advanceTimersByTimeAsync(300);

    await userEvent.click(await screen.findByRole("button", { name: "Fooocus Enhance" }));
    expect(onChange).toHaveBeenCalledWith(["fooocus-enhance"]);
  });
});
