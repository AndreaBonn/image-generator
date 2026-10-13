import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClearOutputCard } from "@/components/settings/ClearOutputCard";
import * as queries from "@/api/queries";

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ClearOutputCard />
    </QueryClientProvider>,
  );
}

describe("ClearOutputCard", () => {
  it("explains the folder as working copies, with no engine jargon (I5)", () => {
    renderCard();

    expect(screen.getByRole("heading", { name: "Copie di lavoro del motore" })).toBeInTheDocument();
    expect(
      screen.getByText(/le tue immagini restano tutte nella Galleria/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/ComfyUI/)).not.toBeInTheDocument();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("asks for confirmation before clearing, without calling the API yet", async () => {
    const clearEngineOutput = vi.spyOn(queries, "clearEngineOutput");

    renderCard();
    await userEvent.click(
      screen.getByRole("button", { name: "Cancella le copie di lavoro" }),
    );

    expect(screen.getByText(/Confermi la cancellazione/)).toBeInTheDocument();
    expect(clearEngineOutput).not.toHaveBeenCalled();
  });

  it("cancels without calling the API when Annulla is clicked", async () => {
    const clearEngineOutput = vi.spyOn(queries, "clearEngineOutput");

    renderCard();
    await userEvent.click(
      screen.getByRole("button", { name: "Cancella le copie di lavoro" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Annulla" }));

    expect(screen.queryByText(/Confermi la cancellazione/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cancella le copie di lavoro" }),
    ).toBeInTheDocument();
    expect(clearEngineOutput).not.toHaveBeenCalled();
  });

  it("clears the folder and shows the result when confirmed", async () => {
    vi.spyOn(queries, "clearEngineOutput").mockResolvedValue({ removed_files: 12, freed_mb: 340 });

    renderCard();
    await userEvent.click(
      screen.getByRole("button", { name: "Cancella le copie di lavoro" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Sì, cancella" }));

    expect(await screen.findByText("Rimossi 12 file, liberati 340 MB.")).toBeInTheDocument();
    expect(screen.queryByText(/Confermi la cancellazione/)).not.toBeInTheDocument();
  });

  it("shows an error message when clearing the folder fails", async () => {
    vi.spyOn(queries, "clearEngineOutput").mockRejectedValue(new Error("boom"));

    renderCard();
    await userEvent.click(
      screen.getByRole("button", { name: "Cancella le copie di lavoro" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Sì, cancella" }));

    await waitFor(() =>
      expect(screen.getByText("Impossibile cancellare le copie di lavoro.")).toBeInTheDocument(),
    );
    expect(screen.queryByText(/Rimossi/)).not.toBeInTheDocument();
  });
});
