import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "../../fixtures/providers";
import userEvent from "@testing-library/user-event";
import { GenerationCard } from "@/components/gallery/GenerationCard";
import * as queries from "@/api/queries";
import { imageUrl, thumbnailUrl } from "@/api/queries";
import { buildGenerationSummary } from "../../fixtures/generation";

describe("GenerationCard", () => {
  it("offers favorite, download and edit right on the thumbnail (G2)", async () => {
    const setFavorite = vi
      .spyOn(queries, "setFavorite")
      .mockResolvedValue({ favorite: true } as never);
    const onOpen = vi.fn();
    const generation = buildGenerationSummary({ id: "gen-4", prompt: "un faro", favorite: false });

    renderWithProviders(<GenerationCard generation={generation} onOpen={onOpen} />);

    const actions = screen.getByRole("group", { name: "Azioni rapide" });
    expect(within(actions).getByRole("link", { name: "Scarica" })).toHaveAttribute("href", imageUrl("gen-4"));
    expect(within(actions).getByRole("link", { name: "Modifica" })).toHaveAttribute(
      "href",
      "/modifica?source=gen-4",
    );
    const favorite = within(actions).getByRole("button", { name: "Aggiungi ai preferiti" });
    expect(favorite).not.toHaveAttribute("aria-pressed");
    await userEvent.click(favorite);
    expect(setFavorite).toHaveBeenCalledWith("gen-4", true);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("tells what kind of work it is and when it was made (G1)", () => {
    vi.useFakeTimers({ now: new Date("2026-10-13T18:00:00Z") });
    const generation = buildGenerationSummary({ task_id: "foto", created_at: "2026-10-13T15:00:00Z" });

    renderWithProviders(<GenerationCard generation={generation} taskLabel="Foto realistica" onOpen={vi.fn()} />);

    expect(screen.getByText("Foto realistica · 3 ore fa")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("shows a checkerboard behind the image for background removal", () => {
    const generation = buildGenerationSummary({ task_id: "rimuovi_sfondo" });

    const { container } = renderWithProviders(<GenerationCard generation={generation} onOpen={vi.fn()} />);

    const checkerboard = container.querySelector(".bg-checkerboard");
    expect(checkerboard).not.toBeNull();
    expect(checkerboard).toContainElement(screen.getByRole("img"));
  });

  it("does not show a checkerboard behind the image for quality generation", () => {
    const generation = buildGenerationSummary({ task_id: "qualita" });

    const { container } = renderWithProviders(<GenerationCard generation={generation} onOpen={vi.fn()} />);

    expect(screen.getByRole("img")).toBeInTheDocument();
    expect(container.querySelector(".bg-checkerboard")).toBeNull();
  });

  it("uses the generation's own thumbnail_url when present", () => {
    const generation = buildGenerationSummary({
      id: "gen-1",
      prompt: "portrait of an old fisherman",
      thumbnail_url: "https://cdn.example.com/gen-1-thumb.jpg",
    });

    renderWithProviders(<GenerationCard generation={generation} onOpen={vi.fn()} />);

    const img = screen.getByAltText("portrait of an old fisherman");
    expect(img).toHaveAttribute("src", "https://cdn.example.com/gen-1-thumb.jpg");
  });

  it("falls back to the computed thumbnail URL when thumbnail_url is absent", () => {
    const generation = buildGenerationSummary({ id: "gen-2", prompt: "cozy reading corner" });

    renderWithProviders(<GenerationCard generation={generation} onOpen={vi.fn()} />);

    const img = screen.getByAltText("cozy reading corner");
    expect(img).toHaveAttribute("src", thumbnailUrl("gen-2"));
  });

  it("falls back to a generic alt text and caption when the prompt is empty", () => {
    const generation = buildGenerationSummary({ id: "gen-3", prompt: "" });

    renderWithProviders(<GenerationCard generation={generation} onOpen={vi.fn()} />);

    expect(screen.getByAltText("Immagine generata")).toBeInTheDocument();
    expect(screen.getByText("(senza descrizione)")).toBeInTheDocument();
  });

  it("sets the image width and height from the generation", () => {
    const generation = buildGenerationSummary({ width: 1152, height: 896 });

    renderWithProviders(<GenerationCard generation={generation} onOpen={vi.fn()} />);

    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("width", "1152");
    expect(img).toHaveAttribute("height", "896");
  });

  it("shows the favorite badge only when the generation is marked favorite", () => {
    const generation = buildGenerationSummary({ favorite: true });

    renderWithProviders(<GenerationCard generation={generation} onOpen={vi.fn()} />);

    expect(screen.getByText("★ Preferito")).toBeInTheDocument();
  });

  it("hides the favorite badge when the generation is not marked favorite", () => {
    const generation = buildGenerationSummary({ favorite: false });

    renderWithProviders(<GenerationCard generation={generation} onOpen={vi.fn()} />);

    expect(screen.queryByText("★ Preferito")).not.toBeInTheDocument();
  });

  it("calls onOpen with the generation id when clicked", async () => {
    const onOpen = vi.fn();
    const generation = buildGenerationSummary({ id: "gen-42" });

    renderWithProviders(<GenerationCard generation={generation} onOpen={onOpen} />);
    await userEvent.click(screen.getByRole("button", { name: /^Apri:/ }));

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith("gen-42");
  });
});
