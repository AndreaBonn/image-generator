import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ModelsTable } from "@/components/settings/ModelsTable";
import * as queries from "@/api/queries";
import { buildModelInfo } from "../../fixtures/system";
import { installMockEventSource, latestEventSource } from "../../mocks/mockEventSource";

const INSTALL_COMMAND = "uv run --script scripts/install_models.py";
const DISK = { free_gb: 40, min_free_gb: 10 };

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderTable(models: Parameters<typeof ModelsTable>[0]["models"]) {
  return render(
    <ModelsTable models={models} installCommand={INSTALL_COMMAND} disk={DISK} />,
    { wrapper },
  );
}

describe("ModelsTable", () => {
  beforeEach(() => {
    installMockEventSource();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("copies the migration command for a missing local model without appending its id", async () => {
    const command = "uv run --script scripts/migrate_from_fooocus.py --apply";
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText }, configurable: true,
    });
    renderTable([{
      ...buildModelInfo({ id: "juggernaut_xl_v8", status: "missing", enabled: true }),
      install_command: command,
    }]);
    expect(screen.getByText(command)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Copia" }));
    expect(writeText).toHaveBeenCalledWith(command);
    expect(screen.getByRole("button", { name: "Copiato" })).toBeInTheDocument();
  });

  it("shows label, status, size and license for every model", () => {
    renderTable([
      buildModelInfo({
        id: "juggernaut-xl-v8",
        label: "Juggernaut XL v8",
        status: "installed",
        size_gb: 6.6,
        license: "CreativeML Open RAIL-M",
      }),
    ]);

    expect(screen.getByText("Juggernaut XL v8")).toBeInTheDocument();
    expect(screen.getByText("Installato")).toBeInTheDocument();
    expect(screen.getByText("6,6 GB")).toBeInTheDocument();
    expect(screen.getByText("CreativeML Open RAIL-M")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Informazioni: Modelli" })).toBeInTheDocument();
  });

  it("says a license id in words (I3)", () => {
    renderTable([buildModelInfo({ id: "m1", license: "cc-by-nc-sa-4.0" })]);
    expect(screen.getByText("Solo uso non commerciale (CC BY-NC-SA 4.0)")).toBeInTheDocument();
  });

  it("shows a dash for the size when it is not known", () => {
    renderTable([buildModelInfo({ id: "m1", size_gb: null })]);
    expect(screen.getByText("-")).toBeInTheDocument();
  });

  it("shows the install command for a model that is missing and enabled", () => {
    renderTable([buildModelInfo({ id: "flux2-klein", status: "missing", enabled: true })]);
    expect(screen.getByText(`${INSTALL_COMMAND} flux2-klein`)).toBeInTheDocument();
  });

  it("hides the install command for a model that is missing but disabled", () => {
    renderTable([buildModelInfo({ id: "flux2-klein", status: "missing", enabled: false })]);
    expect(screen.queryByText(`${INSTALL_COMMAND} flux2-klein`)).not.toBeInTheDocument();
  });

  it("hides the install command for a model that is already installed", () => {
    renderTable([buildModelInfo({ id: "juggernaut-xl-v8", status: "installed", enabled: true })]);
    expect(screen.queryByText(`${INSTALL_COMMAND} juggernaut-xl-v8`)).not.toBeInTheDocument();
  });

  it("copies the install command to the clipboard and shows confirmation", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    renderTable([buildModelInfo({ id: "flux2-klein", status: "missing", enabled: true })]);

    await userEvent.click(screen.getByRole("button", { name: "Copia" }));

    expect(writeText).toHaveBeenCalledWith(`${INSTALL_COMMAND} flux2-klein`);
    expect(await screen.findByRole("button", { name: "Copiato" })).toBeInTheDocument();
  });

  it("keeps showing Copia when the clipboard write fails", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    renderTable([buildModelInfo({ id: "flux2-klein", status: "missing", enabled: true })]);

    await userEvent.click(screen.getByRole("button", { name: "Copia" }));

    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Copia" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copiato" })).not.toBeInTheDocument();
  });

  it("shows the Installa button alongside the install command for a missing, enabled model", () => {
    renderTable([
      buildModelInfo({ id: "flux2-klein", status: "missing", enabled: true, size_gb: 4.2 }),
    ]);
    expect(screen.getByRole("button", { name: "Installa · 4,2 GB" })).toBeInTheDocument();
    expect(screen.getByText(`${INSTALL_COMMAND} flux2-klein`)).toBeInTheDocument();
  });

  it("starts the download after confirming in the dialog, and shows live progress", async () => {
    vi.spyOn(queries, "startModelDownload").mockResolvedValue(undefined);
    renderTable([
      buildModelInfo({ id: "flux2-klein", label: "FLUX.2 klein", status: "missing", enabled: true, size_gb: 4 }),
    ]);

    await userEvent.click(screen.getByRole("button", { name: "Installa · 4,0 GB" }));
    expect(screen.getByRole("dialog", { name: "Scaricare FLUX.2 klein?" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Scarica" }));

    expect(queries.startModelDownload).toHaveBeenCalledWith("flux2-klein");
    expect(await screen.findByRole("progressbar")).toBeInTheDocument();

    const source = latestEventSource();
    source.emit("progress", { bytes: 1, total: 2 });
    expect(await screen.findByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
  });

  it("disables the other model's download while one is in progress", async () => {
    vi.spyOn(queries, "startModelDownload").mockResolvedValue(undefined);
    renderTable([
      buildModelInfo({ id: "model-a", label: "Model A", status: "missing", enabled: true, size_gb: 4 }),
      buildModelInfo({ id: "model-b", label: "Model B", status: "missing", enabled: true, size_gb: 4 }),
    ]);

    const [firstInstallButton] = screen.getAllByRole("button", { name: "Installa · 4,0 GB" });
    await userEvent.click(firstInstallButton as HTMLElement);
    await userEvent.click(screen.getByRole("button", { name: "Scarica" }));

    expect(
      await screen.findByText("È in corso il download di un altro modello. Attendi che finisca."),
    ).toBeInTheDocument();
  });

  it("disables the Installa button with the space needed when disk is short", () => {
    render(
      <ModelsTable
        models={[buildModelInfo({ id: "flux2-klein", status: "missing", enabled: true, size_gb: 35 })]}
        installCommand={INSTALL_COMMAND}
        disk={{ free_gb: 40, min_free_gb: 10 }}
      />,
      { wrapper },
    );
    expect(screen.getByText("Servono 35,0 GB più 10,0 GB di margine, liberi 40,0 GB.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Installa/ })).not.toBeInTheDocument();
  });
});

describe("ModelsTable download completion", () => {
  beforeEach(() => {
    installMockEventSource();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("refreshes /system and /tasks when a download started elsewhere completes", async () => {
    const invalidate = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    renderTable([
      buildModelInfo({ id: "model-a", label: "Model A", status: "missing", enabled: true, size_gb: 4 }),
    ]);

    latestEventSource().emit("completed", {});

    await vi.waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["system"] });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["tasks"] });
    });
  });

  it("does not refresh /system and /tasks while a download is only progressing", async () => {
    const invalidate = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    renderTable([
      buildModelInfo({ id: "model-a", label: "Model A", status: "missing", enabled: true, size_gb: 4 }),
    ]);

    latestEventSource().emit("progress", { bytes: 1, total: 2 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(invalidate).not.toHaveBeenCalled();
  });
});
