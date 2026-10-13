import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GuidePage } from "@/pages/GuidePage";
import * as queries from "@/api/queries";
import { buildTask } from "../fixtures/task";
import { renderWithProviders } from "../fixtures/providers";

describe("GuidePage (N3)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("lists each creation task with what it is for, its language and its time", async () => {
    vi.spyOn(queries, "fetchTasks").mockResolvedValue([
      buildTask({
        id: "bozza",
        label: "Bozza veloce",
        description: "Prova rapidamente un'idea.",
        duration_hint: "circa 4 s",
      }),
      buildTask({ id: "inpaint", group: "modifica", label: "Modifica una parte" }),
    ]);

    renderWithProviders(<GuidePage />);

    const table = await screen.findByRole("table", { name: "Quale lavoro scegliere" });
    const row = await within(table).findByRole("row", { name: /Bozza veloce/ });
    expect(row).toHaveTextContent("Prova rapidamente un'idea.");
    expect(row).toHaveTextContent("in inglese");
    expect(row).toHaveTextContent("circa 4 s");
    expect(within(table).queryByText("Modifica una parte")).not.toBeInTheDocument();
  });

  it("explains the English requirement and how to restart a stopped engine", async () => {
    vi.spyOn(queries, "fetchTasks").mockResolvedValue([]);

    renderWithProviders(<GuidePage />);

    expect(await screen.findByRole("heading", { name: "Perché a volte in inglese" })).toBeInTheDocument();
    expect(screen.getByText(/Chiudi Image Generator/)).toBeInTheDocument();
  });
});

describe("GuidePage task table states (R7)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("says the list is loading", () => {
    vi.spyOn(queries, "fetchTasks").mockReturnValue(new Promise(() => {}));

    renderWithProviders(<GuidePage />);

    expect(screen.getByText("Caricamento dei lavori...")).toBeInTheDocument();
  });

  it("says the list could not be loaded and offers a retry", async () => {
    const fetchTasks = vi.spyOn(queries, "fetchTasks").mockRejectedValue(new Error("boom"));

    renderWithProviders(<GuidePage />);

    expect(await screen.findByText("Impossibile caricare l'elenco dei lavori.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(fetchTasks).toHaveBeenCalledTimes(2);
  });
});
