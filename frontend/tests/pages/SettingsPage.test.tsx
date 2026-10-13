import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SettingsPage } from "@/pages/SettingsPage";
import * as queries from "@/api/queries";
import { buildModelInfo, buildSystemInfo } from "../fixtures/system";
import { installMockEventSource } from "../mocks/mockEventSource";

function renderSettingsPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SettingsPage />
    </QueryClientProvider>,
  );
}

describe("SettingsPage", () => {
  // ModelsTable now mounts useModelDownload (T030), which opens an SSE
  // connection jsdom doesn't implement; these tests don't exercise it.
  beforeEach(() => {
    installMockEventSource();
  });

  it("shows the disk space in red when it is below the configured minimum", async () => {
    vi.spyOn(queries, "fetchSystem").mockResolvedValue(
      buildSystemInfo({ disk: { free_gb: 3, min_free_gb: 10 } }),
    );

    renderSettingsPage();

    const diskText = await screen.findByText(/3,0 GB liberi/);
    expect(diskText).toHaveClass("text-danger");
    expect(diskText).toHaveTextContent("minimo consigliato 10,0 GB");
  });

  it("does not mark disk space in red when it is above the minimum", async () => {
    vi.spyOn(queries, "fetchSystem").mockResolvedValue(
      buildSystemInfo({ disk: { free_gb: 40, min_free_gb: 10 } }),
    );

    renderSettingsPage();

    const diskText = await screen.findByText(/40,0 GB liberi/);
    expect(diskText).toHaveTextContent("40,0 GB liberi");
    expect(diskText).not.toHaveTextContent(/minimo consigliato/);
  });

  it("translates model status to Italian in the table", async () => {
    vi.spyOn(queries, "fetchSystem").mockResolvedValue(
      buildSystemInfo({
        models: [
          buildModelInfo({ id: "a", label: "Modello A", status: "installed" }),
          buildModelInfo({ id: "b", label: "Modello B", status: "missing", enabled: false }),
        ],
      }),
    );

    renderSettingsPage();

    await screen.findByText("Modello A");
    expect(screen.getByText("Installato")).toBeInTheDocument();
    expect(screen.getByText("Mancante")).toBeInTheDocument();
  });

  it("shows the install command for a missing model that is enabled", async () => {
    vi.spyOn(queries, "fetchSystem").mockResolvedValue(
      buildSystemInfo({
        install_command: "uv run --script scripts/install_models.py",
        models: [
          buildModelInfo({
            id: "flux2-klein",
            label: "FLUX.2 klein",
            status: "missing",
            enabled: true,
          }),
        ],
      }),
    );

    renderSettingsPage();

    expect(
      await screen.findByText("uv run --script scripts/install_models.py flux2-klein"),
    ).toBeInTheDocument();
  });

  it("asks for confirmation before clearing the engine output folder, then shows the result", async () => {
    const clearSpy = vi
      .spyOn(queries, "clearEngineOutput")
      .mockResolvedValue({ removed_files: 12, freed_mb: 340 });
    vi.spyOn(queries, "fetchSystem").mockResolvedValue(buildSystemInfo());

    renderSettingsPage();

    const triggerButton = await screen.findByRole("button", {
      name: "Cancella le copie di lavoro",
    });
    await userEvent.click(triggerButton);

    expect(clearSpy).not.toHaveBeenCalled();
    expect(screen.getByText(/Confermi la cancellazione/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Sì, cancella" }));

    await waitFor(() => expect(clearSpy).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText("Rimossi 12 file, liberati 340 MB."),
    ).toBeInTheDocument();
  });

  it("shows an error with a retry action when the system status fails to load", async () => {
    vi.spyOn(queries, "fetchSystem").mockRejectedValue(new Error("boom"));

    renderSettingsPage();

    expect(
      await screen.findByText("Impossibile leggere lo stato del motore."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Riprova" })).toBeInTheDocument();
  });
});
