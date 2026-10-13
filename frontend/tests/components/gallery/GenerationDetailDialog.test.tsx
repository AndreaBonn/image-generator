import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GenerationDetailDialog } from "@/components/gallery/GenerationDetailDialog";
import * as queries from "@/api/queries";
import { imageUrl } from "@/api/queries";
import type { Generation } from "@/api/types";

function buildGeneration(overrides: Partial<Generation> = {}): Generation {
  return {
    id: "gen-1",
    job_id: "job-1",
    task_id: "qualita",
    model_ids: ["juggernaut-xl-v8"],
    prompt: "portrait of an old fisherman, golden hour",
    negative_prompt: "",
    prompt_final: "portrait of an old fisherman, golden hour, detailed",
    params: {},
    seed: 42,
    width: 1152,
    height: 896,
    parent_id: null,
    duration_ms: 12_500,
    favorite: false,
    created_at: "2026-10-01T10:00:00Z",
    updated_at: "2026-10-01T10:00:00Z",
    ...overrides,
  };
}

function renderDialog(props: Partial<Parameters<typeof GenerationDetailDialog>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onClose = props.onClose ?? vi.fn();
  const onOpenGeneration = props.onOpenGeneration ?? vi.fn();
  const result = render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <GenerationDetailDialog
          generationId={props.generationId ?? "gen-1"}
          onClose={onClose}
          onOpenGeneration={onOpenGeneration}
          taskLabels={props.taskLabels}
          onRerunStarted={props.onRerunStarted}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...result, client, onClose, onOpenGeneration };
}

describe("GenerationDetailDialog", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a checkerboard behind the image for background removal", async () => {
    vi.spyOn(queries, "fetchGeneration").mockResolvedValue(buildGeneration({ task_id: "rimuovi_sfondo" }));

    const { container } = renderDialog();

    const img = await screen.findByRole("img");
    const checkerboard = container.querySelector(".bg-checkerboard");
    expect(checkerboard).not.toBeNull();
    expect(checkerboard).toContainElement(img);
  });

  it("does not show a checkerboard behind the image for quality generation", async () => {
    vi.spyOn(queries, "fetchGeneration").mockResolvedValue(buildGeneration({ task_id: "qualita" }));

    const { container } = renderDialog();

    expect(await screen.findByRole("img")).toBeInTheDocument();
    expect(container.querySelector(".bg-checkerboard")).toBeNull();
  });

  it("shows a loading message while the detail is being fetched", async () => {
    vi.spyOn(queries, "fetchGeneration").mockReturnValue(new Promise(() => {}));

    renderDialog();

    expect(screen.getByText("Caricamento...")).toBeInTheDocument();
  });

  it("shows an error with a retry action when the detail fails to load", async () => {
    const fetchGeneration = vi
      .spyOn(queries, "fetchGeneration")
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(buildGeneration());

    renderDialog();

    expect(await screen.findByText("Impossibile caricare il dettaglio.")).toBeInTheDocument();
    expect(fetchGeneration).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));

    await waitFor(() => expect(fetchGeneration).toHaveBeenCalledTimes(2));
    expect(await screen.findByAltText(/portrait of an old fisherman/)).toBeInTheDocument();
  });

  it("shows description, task, size and age up front (G4)", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-01T12:00:00Z"), shouldAdvanceTime: true });
    vi.spyOn(queries, "fetchGeneration").mockResolvedValue(
      buildGeneration({ id: "gen-9", prompt: "portrait of an old fisherman, golden hour", width: 1152, height: 896 }),
    );

    renderDialog({ generationId: "gen-9", taskLabels: new Map([["qualita", "Immagine di qualità"]]) });

    const img = await screen.findByAltText("portrait of an old fisherman, golden hour");
    expect(img).toHaveAttribute("src", imageUrl("gen-9"));
    expect(screen.getByText("Descrizione").nextElementSibling).toHaveTextContent(
      "portrait of an old fisherman, golden hour",
    );
    expect(screen.getByText("Immagine di qualità · 1152×896 px · 2 ore fa")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("keeps the technical details in a closed section (G4)", async () => {
    vi.spyOn(queries, "fetchGeneration").mockResolvedValue(
      buildGeneration({
        prompt_final: "portrait of an old fisherman, golden hour, detailed",
        seed: 777,
        model_ids: ["juggernaut-xl-v8", "flux2-klein"],
        duration_ms: 12_500,
      }),
    );

    renderDialog();

    const seed = await screen.findByText("777");
    expect(seed).not.toBeVisible();
    await userEvent.click(screen.getByText("Dettagli tecnici"));
    expect(seed).toBeVisible();
    expect(screen.getByText("portrait of an old fisherman, golden hour, detailed")).toBeVisible();
    expect(screen.getByText("juggernaut-xl-v8, flux2-klein")).toBeVisible();
    expect(screen.getByText("12.5 s")).toBeVisible();
  });

  it("shows placeholders for an empty prompt, empty final prompt, no model and no duration", async () => {
    vi.spyOn(queries, "fetchGeneration").mockResolvedValue(
      buildGeneration({ prompt: "", prompt_final: "", model_ids: [], duration_ms: null }),
    );

    renderDialog();

    await screen.findByAltText("Immagine generata");
    expect(screen.getAllByText("(vuoto)")).toHaveLength(2);

    const modelLabel = screen.getByText("Modello");
    expect(modelLabel.nextElementSibling).toHaveTextContent("-");
    const durationLabel = screen.getByText("Durata");
    expect(durationLabel.nextElementSibling).toHaveTextContent("-");
  });

  it("shows the source-generation link only when the generation has a parent", async () => {
    vi.spyOn(queries, "fetchGeneration").mockResolvedValue(buildGeneration({ parent_id: "gen-parent" }));
    const onOpenGeneration = vi.fn();

    renderDialog({ onOpenGeneration });

    const parentButton = await screen.findByRole("button", { name: "Vedi immagine di origine" });
    await userEvent.click(parentButton);

    expect(onOpenGeneration).toHaveBeenCalledWith("gen-parent");
  });

  it("hides the source-generation link when the generation has no parent", async () => {
    vi.spyOn(queries, "fetchGeneration").mockResolvedValue(buildGeneration({ parent_id: null }));

    renderDialog();

    await screen.findByAltText(/portrait/);
    expect(screen.queryByRole("button", { name: "Vedi immagine di origine" })).not.toBeInTheDocument();
  });

  it("offers a download link pointing at the full-size image", async () => {
    vi.spyOn(queries, "fetchGeneration").mockResolvedValue(buildGeneration({ id: "gen-5" }));

    renderDialog({ generationId: "gen-5" });

    const downloadLink = await screen.findByRole("link", { name: "Scarica" });
    expect(downloadLink).toHaveAttribute("href", imageUrl("gen-5"));
    expect(downloadLink).toHaveAttribute("download");
  });

  it("leads with the ways to continue and keeps Elimina apart (G5)", async () => {
    vi.spyOn(queries, "fetchGeneration").mockResolvedValue(buildGeneration());

    renderDialog();

    const next = await screen.findByRole("group", { name: "Continua da qui" });
    expect(within(next).getAllByRole("link").map((link) => link.textContent)).toEqual(["Modifica", "Migliora"]);
    expect(within(next).getByRole("button", { name: "Un'altra variante" })).toBeInTheDocument();
    expect(within(next).queryByRole("button", { name: "Elimina" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Elimina" })).toBeInTheDocument();
  });

  it("links Modifica and Migliora to the editor pages with this generation as source", async () => {
    vi.spyOn(queries, "fetchGeneration").mockResolvedValue(buildGeneration({ id: "gen-5" }));

    renderDialog({ generationId: "gen-5" });

    expect(await screen.findByRole("link", { name: "Modifica" })).toHaveAttribute(
      "href",
      "/modifica?source=gen-5",
    );
    expect(screen.getByRole("link", { name: "Migliora" })).toHaveAttribute(
      "href",
      "/migliora?source=gen-5",
    );
  });

  it("toggles the favorite label and sends the opposite value to the API", async () => {
    vi.spyOn(queries, "fetchGeneration").mockResolvedValue(buildGeneration({ favorite: false }));
    const setFavorite = vi.spyOn(queries, "setFavorite").mockResolvedValue(buildGeneration({ favorite: true }));

    renderDialog();

    const favoriteButton = await screen.findByRole("button", { name: "Aggiungi ai preferiti" });
    expect(favoriteButton).not.toHaveAttribute("aria-pressed");

    await userEvent.click(favoriteButton);

    expect(setFavorite).toHaveBeenCalledWith("gen-1", true);
  });

  it("shows the remove-favorite label when the generation is already a favorite", async () => {
    vi.spyOn(queries, "fetchGeneration").mockResolvedValue(buildGeneration({ favorite: true }));

    renderDialog();

    const favoriteButton = await screen.findByRole("button", { name: "Rimuovi dai preferiti" });
    expect(favoriteButton).not.toHaveAttribute("aria-pressed");
  });

  it("reruns with a new seed and shows a confirmation message", async () => {
    vi.spyOn(queries, "fetchGeneration").mockResolvedValue(buildGeneration({ id: "gen-3" }));
    const rerunGeneration = vi
      .spyOn(queries, "rerunGeneration")
      .mockResolvedValue({ job_id: "job-99" });

    const onRerunStarted = vi.fn();
    renderDialog({ generationId: "gen-3", onRerunStarted });

    const rerunButton = await screen.findByRole("button", { name: "Un'altra variante" });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    await userEvent.click(rerunButton);

    expect(rerunGeneration).toHaveBeenCalledWith("gen-3", true);
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Nuova variante in preparazione: la trovi nella Galleria appena pronta.",
    );
    expect(onRerunStarted).toHaveBeenCalledWith("job-99");
  });

  it("says when a new variant could not be started (R10)", async () => {
    vi.spyOn(queries, "fetchGeneration").mockResolvedValue(buildGeneration({ id: "gen-3" }));
    vi.spyOn(queries, "rerunGeneration").mockRejectedValue(new Error("boom"));

    renderDialog({ generationId: "gen-3" });
    await userEvent.click(await screen.findByRole("button", { name: "Un'altra variante" }));

    expect(await screen.findByText("Impossibile avviare una nuova variante.")).toBeInTheDocument();
  });

  it("asks for confirmation before deleting, and does not delete on Annulla", async () => {
    vi.spyOn(queries, "fetchGeneration").mockResolvedValue(buildGeneration());
    const deleteGeneration = vi.spyOn(queries, "deleteGeneration").mockResolvedValue(undefined);

    renderDialog();

    await userEvent.click(await screen.findByRole("button", { name: "Elimina" }));
    expect(screen.getByText("Eliminare questa immagine?")).toBeInTheDocument();
    expect(deleteGeneration).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Annulla" }));

    expect(screen.queryByText("Eliminare questa immagine?")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Elimina" })).toBeInTheDocument();
    expect(deleteGeneration).not.toHaveBeenCalled();
  });

  it("deletes and closes the dialog when the deletion is confirmed", async () => {
    vi.spyOn(queries, "fetchGeneration").mockResolvedValue(buildGeneration({ id: "gen-8" }));
    const deleteGeneration = vi.spyOn(queries, "deleteGeneration").mockResolvedValue(undefined);
    const onClose = vi.fn();

    renderDialog({ generationId: "gen-8", onClose });

    await userEvent.click(await screen.findByRole("button", { name: "Elimina" }));
    await userEvent.click(screen.getByRole("button", { name: "Sì, elimina" }));

    await waitFor(() => expect(deleteGeneration).toHaveBeenCalledWith("gen-8"));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("shows an error and keeps the dialog open when deletion fails", async () => {
    vi.spyOn(queries, "fetchGeneration").mockResolvedValue(buildGeneration());
    vi.spyOn(queries, "deleteGeneration").mockRejectedValue(new Error("boom"));
    const onClose = vi.fn();

    renderDialog({ onClose });

    await userEvent.click(await screen.findByRole("button", { name: "Elimina" }));
    await userEvent.click(screen.getByRole("button", { name: "Sì, elimina" }));

    expect(await screen.findByText("Impossibile eliminare l'immagine.")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when the backdrop is clicked", async () => {
    vi.spyOn(queries, "fetchGeneration").mockResolvedValue(buildGeneration());
    const onClose = vi.fn();

    renderDialog({ onClose });

    await userEvent.click(screen.getByRole("button", { name: "Chiudi il dettaglio" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the close button is clicked", async () => {
    vi.spyOn(queries, "fetchGeneration").mockResolvedValue(buildGeneration());
    const onClose = vi.fn();

    renderDialog({ onClose });

    await userEvent.click(screen.getByRole("button", { name: "Chiudi" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Escape is pressed", async () => {
    vi.spyOn(queries, "fetchGeneration").mockResolvedValue(buildGeneration());
    const onClose = vi.fn();

    renderDialog({ onClose });
    await screen.findByRole("dialog");

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("moves focus into the dialog on mount and restores it to the opener on unmount", async () => {
    vi.spyOn(queries, "fetchGeneration").mockResolvedValue(buildGeneration());
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    function Harness({ show }: { show: boolean }) {
      return (
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <button type="button">Apri dettaglio</button>
            {show ? (
              <GenerationDetailDialog
                generationId="gen-1"
                onClose={vi.fn()}
                onOpenGeneration={vi.fn()}
              />
            ) : null}
          </MemoryRouter>
        </QueryClientProvider>
      );
    }

    const { rerender } = render(<Harness show={false} />);
    const opener = screen.getByRole("button", { name: "Apri dettaglio" });
    opener.focus();
    expect(opener).toHaveFocus();

    rerender(<Harness show={true} />);

    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(dialog).toHaveFocus());

    rerender(<Harness show={false} />);

    expect(opener).toHaveFocus();
  });

  it("traps Tab focus inside the dialog, wrapping from the last to the first focusable element", async () => {
    vi.spyOn(queries, "fetchGeneration").mockResolvedValue(buildGeneration({ parent_id: null }));

    renderDialog();

    const deleteButton = await screen.findByRole("button", { name: "Elimina" });
    const closeButton = screen.getByRole("button", { name: "Chiudi" });

    deleteButton.focus();
    expect(deleteButton).toHaveFocus();

    fireEvent.keyDown(document, { key: "Tab" });
    expect(closeButton).toHaveFocus();

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(deleteButton).toHaveFocus();
  });

  it("leaves Tab to the browser when focus is on a focusable element between the first and the last", async () => {
    vi.spyOn(queries, "fetchGeneration").mockResolvedValue(buildGeneration({ parent_id: null }));

    renderDialog();

    const deleteButton = await screen.findByRole("button", { name: "Elimina" });
    const editLink = screen.getByRole("link", { name: "Modifica" });

    editLink.focus();
    const middleTabAllowed = fireEvent.keyDown(document, { key: "Tab" });
    deleteButton.focus();
    const lastTabAllowed = fireEvent.keyDown(document, { key: "Tab" });

    expect({ middleTabAllowed, lastTabAllowed }).toEqual({
      middleTabAllowed: true,
      lastTabAllowed: false,
    });
  });
});
