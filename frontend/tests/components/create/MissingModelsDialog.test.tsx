import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MissingModelsDialog } from "@/components/create/MissingModelsDialog";
import * as queries from "@/api/queries";
import { buildTask } from "../../fixtures/task";
import { buildModelInfo, buildSystemInfo } from "../../fixtures/system";
import { renderWithProviders } from "../../fixtures/providers";
import { installMockEventSource, latestEventSource } from "../../mocks/mockEventSource";

const task = buildTask({
  id: "bozza",
  label: "Bozza veloce",
  available: false,
  unavailable_reason: "Modelli non installati.",
  missing_model_ids: ["juggernaut_xl_v8", "sdxl_lightning_lora"],
});

const models = [
  buildModelInfo({ id: "juggernaut_xl_v8", label: "Juggernaut XL v8", status: "missing", size_gb: 6.6 }),
  buildModelInfo({ id: "sdxl_lightning_lora", label: "SDXL-Lightning", status: "missing", size_gb: 0.4 }),
];

function mockSystem(disk = { free_gb: 40, min_free_gb: 5 }) {
  return vi.spyOn(queries, "fetchSystem").mockResolvedValue(buildSystemInfo({ models, disk }));
}

describe("MissingModelsDialog", () => {
  beforeEach(() => {
    installMockEventSource();
    vi.spyOn(queries, "fetchTasks").mockResolvedValue([task]);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists the missing models, then downloads them one after the other", async () => {
    const fetchSystem = mockSystem();
    const start = vi.spyOn(queries, "startModelDownload").mockResolvedValue(undefined);
    const onInstalled = vi.fn();
    renderWithProviders(<MissingModelsDialog task={task} onClose={vi.fn()} onInstalled={onInstalled} />);

    const dialog = await screen.findByRole("dialog", { name: /Scaricare i modelli per «Bozza veloce»\?/ });
    await within(dialog).findByText("Juggernaut XL v8");
    expect(dialog).toHaveTextContent("Juggernaut XL v8");
    expect(dialog).toHaveTextContent("SDXL-Lightning");
    expect(dialog).toHaveTextContent("Verranno scaricati 7,0 GB");

    await userEvent.click(screen.getByRole("button", { name: "Scarica" }));
    expect(start).toHaveBeenLastCalledWith("juggernaut_xl_v8");
    expect(screen.getByText("Modello 1 di 2: Juggernaut XL v8")).toBeInTheDocument();

    act(() => latestEventSource().emit("completed", {}));
    await waitFor(() => expect(start).toHaveBeenLastCalledWith("sdxl_lightning_lora"));
    // Each finished model refreshes /system, so a later plan never re-offers it.
    await waitFor(() => expect(fetchSystem).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Modello 2 di 2: SDXL-Lightning")).toBeInTheDocument();
    expect(onInstalled).not.toHaveBeenCalled();

    act(() => latestEventSource().emit("completed", {}));
    await waitFor(() => expect(onInstalled).toHaveBeenCalledWith("bozza"));
  });

  it("hands the task back when /system already reports every model installed", async () => {
    vi.spyOn(queries, "fetchSystem").mockResolvedValue(
      buildSystemInfo({ models: models.map((model) => ({ ...model, status: "installed" as const })) }),
    );
    const onInstalled = vi.fn();
    renderWithProviders(<MissingModelsDialog task={task} onClose={vi.fn()} onInstalled={onInstalled} />);

    expect(await screen.findByText("Modelli installati.")).toBeInTheDocument();
    await waitFor(() => expect(onInstalled).toHaveBeenCalledWith("bozza"));
    expect(screen.queryByRole("button", { name: "Scarica" })).not.toBeInTheDocument();
  });

  it("shows the space it lacks instead of a download button", async () => {
    mockSystem({ free_gb: 10, min_free_gb: 5 });
    renderWithProviders(<MissingModelsDialog task={task} onClose={vi.fn()} onInstalled={vi.fn()} />);

    expect(await screen.findByText(/Servono 7,0 GB più 5,0 GB di margine, liberi 10,0 GB\./)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Scarica" })).not.toBeInTheDocument();
  });

  it("stops on a failed model and retries that same model", async () => {
    mockSystem();
    const start = vi.spyOn(queries, "startModelDownload").mockResolvedValue(undefined);
    renderWithProviders(<MissingModelsDialog task={task} onClose={vi.fn()} onInstalled={vi.fn()} />);

    await userEvent.click(await screen.findByRole("button", { name: "Scarica" }));
    act(() => latestEventSource().emit("failed", { code: "DOWNLOAD_FAILED", message: "Rete assente." }));

    expect(await screen.findByText("Rete assente.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(start).toHaveBeenCalledTimes(2);
    expect(start).toHaveBeenLastCalledWith("juggernaut_xl_v8");
    expect(screen.queryByText("Rete assente.")).not.toBeInTheDocument();
  });

  it("does not offer a download while another one is running elsewhere", async () => {
    mockSystem();
    renderWithProviders(<MissingModelsDialog task={task} onClose={vi.fn()} onInstalled={vi.fn()} />);
    await screen.findByRole("button", { name: "Scarica" });

    act(() => latestEventSource().emit("progress", { bytes: 10, total: 100 }));

    expect(await screen.findByText(/È in corso il download di un altro modello/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Scarica" })).not.toBeInTheDocument();
  });

  it("closes with Annulla before anything starts", async () => {
    mockSystem();
    const onClose = vi.fn();
    renderWithProviders(<MissingModelsDialog task={task} onClose={onClose} onInstalled={vi.fn()} />);

    await screen.findByRole("button", { name: "Scarica" });
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Annulla" }));
    expect(onClose).toHaveBeenCalled();
  });
});
