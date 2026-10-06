import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ModelDownloadButton } from "@/components/settings/ModelDownloadButton";
import type { ModelDownloadState, UseModelDownloadResult } from "@/hooks/useModelDownload";
import { buildModelInfo } from "../../fixtures/system";

const DISK = { free_gb: 40, min_free_gb: 10 };
const IDLE: ModelDownloadState = { modelId: null, phase: "idle", bytes: null, total: null, error: null };

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function buildDownload(overrides: Partial<UseModelDownloadResult> = {}): UseModelDownloadResult {
  return { state: IDLE, start: vi.fn(), cancel: vi.fn(), ...overrides };
}

describe("ModelDownloadButton", () => {
  it("idle: shows the install button with the model size", () => {
    const model = buildModelInfo({ id: "flux2-klein", status: "missing", enabled: true, size_gb: 4.2 });
    render(<ModelDownloadButton model={model} disk={DISK} download={buildDownload()} />, { wrapper });
    expect(screen.getByRole("button", { name: "Installa · 4,2 GB" })).toBeInTheDocument();
  });

  it("opens a confirm dialog before starting, and starts on confirm", async () => {
    const start = vi.fn();
    const model = buildModelInfo({ id: "flux2-klein", label: "FLUX.2 klein", status: "missing", enabled: true, size_gb: 4 });
    render(
      <ModelDownloadButton model={model} disk={DISK} download={buildDownload({ start })} />,
      { wrapper },
    );

    await userEvent.click(screen.getByRole("button", { name: "Installa · 4,0 GB" }));
    expect(screen.getByRole("dialog", { name: "Scaricare FLUX.2 klein?" })).toBeInTheDocument();
    expect(start).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Scarica" }));
    expect(start).toHaveBeenCalledWith("flux2-klein");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("cancelling the confirm dialog does not start the download", async () => {
    const start = vi.fn();
    const model = buildModelInfo({ id: "flux2-klein", status: "missing", enabled: true, size_gb: 4 });
    render(<ModelDownloadButton model={model} disk={DISK} download={buildDownload({ start })} />, { wrapper });

    await userEvent.click(screen.getByRole("button", { name: "Installa · 4,0 GB" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Annulla" }));

    expect(start).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("disabled: shows the space needed when downloading would leave less than the margin free", () => {
    const model = buildModelInfo({ id: "flux2-klein", status: "missing", enabled: true, size_gb: 35 });
    render(<ModelDownloadButton model={model} disk={DISK} download={buildDownload()} />, { wrapper });
    expect(screen.getByText("Servono 35,0 GB più 10,0 GB di margine, liberi 40,0 GB.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Installa/ })).not.toBeInTheDocument();
  });

  it("downloading: shows an accessible progress bar and Annulla", async () => {
    const cancel = vi.fn();
    const model = buildModelInfo({ id: "flux2-klein", label: "FLUX.2 klein", status: "missing", enabled: true });
    const download = buildDownload({
      state: { modelId: "flux2-klein", phase: "downloading", bytes: 50, total: 200, error: null },
      cancel,
    });
    render(<ModelDownloadButton model={model} disk={DISK} download={download} />, { wrapper });

    const bar = screen.getByRole("progressbar", { name: "Download di FLUX.2 klein" });
    expect(bar).toHaveAttribute("aria-valuenow", "25");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");

    await userEvent.click(screen.getByRole("button", { name: "Annulla" }));
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("verifying: shows the verifying message instead of a progress bar", () => {
    const model = buildModelInfo({ id: "flux2-klein", status: "missing", enabled: true });
    const download = buildDownload({
      state: { modelId: "flux2-klein", phase: "verifying", bytes: null, total: null, error: null },
    });
    render(<ModelDownloadButton model={model} disk={DISK} download={download} />, { wrapper });

    expect(screen.getByText("Verifica in corso...")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("error: shows the backend's Italian message and a Riprova that restarts the same model", async () => {
    const start = vi.fn();
    const model = buildModelInfo({ id: "flux2-klein", status: "missing", enabled: true });
    const download = buildDownload({
      start,
      state: {
        modelId: "flux2-klein",
        phase: "failed",
        bytes: null,
        total: null,
        error: { code: "CHECKSUM_MISMATCH", message: "Il file scaricato non corrisponde al checksum atteso." },
      },
    });
    render(<ModelDownloadButton model={model} disk={DISK} download={download} />, { wrapper });

    expect(screen.getByText("Il file scaricato non corrisponde al checksum atteso.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));
    expect(start).toHaveBeenCalledWith("flux2-klein");
  });

  it("installed: shows a confirmation instead of the button once this model completes", () => {
    const model = buildModelInfo({ id: "flux2-klein", status: "missing", enabled: true });
    const download = buildDownload({
      state: { modelId: "flux2-klein", phase: "completed", bytes: null, total: null, error: null },
    });
    render(<ModelDownloadButton model={model} disk={DISK} download={download} />, { wrapper });

    expect(screen.getByText("Installato")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Installa/ })).not.toBeInTheDocument();
  });

  it("disables itself with a generic reason while another model downloads", () => {
    const model = buildModelInfo({ id: "flux2-klein", status: "missing", enabled: true });
    const download = buildDownload({
      state: { modelId: "other-model", phase: "downloading", bytes: 1, total: 2, error: null },
    });
    render(<ModelDownloadButton model={model} disk={DISK} download={download} />, { wrapper });

    expect(
      screen.getByText("È in corso il download di un altro modello. Attendi che finisca."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Installa/ })).not.toBeInTheDocument();
  });
});
