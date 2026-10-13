import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { EditPage } from "@/pages/EditPage";
import * as queries from "@/api/queries";
import { buildTask } from "../fixtures/task";
import { buildModelInfo, buildSystemInfo } from "../fixtures/system";
import { installMockEventSource } from "../mocks/mockEventSource";

function renderEditPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/modifica?mode=inpaint"]}>
        <EditPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("EditPage missing models", () => {
  beforeEach(() => {
    installMockEventSource();
    vi.spyOn(queries, "fetchSystem").mockResolvedValue(
      buildSystemInfo({
        models: [buildModelInfo({ id: "sdxl_offset_lora", label: "SDXL offset LoRA", status: "missing", size_gb: 0.05 })],
      }),
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("offers to download the models the selected mode lacks", async () => {
    vi.spyOn(queries, "fetchTasks").mockResolvedValue([
      buildTask({
        id: "inpaint",
        group: "modifica",
        label: "Modifica una parte",
        available: false,
        unavailable_reason: "Modelli non installati: SDXL offset LoRA.",
        missing_model_ids: ["sdxl_offset_lora"],
      }),
    ]);
    renderEditPage();

    await userEvent.click(await screen.findByRole("button", { name: "Scarica i modelli mancanti" }));

    const dialog = await screen.findByRole("dialog", { name: /Scaricare i modelli per «Modifica una parte»\?/ });
    expect(await screen.findByText("SDXL offset LoRA")).toBeInTheDocument();
    expect(dialog).toBeInTheDocument();
  });

  it("shows no download button when the mode is available", async () => {
    vi.spyOn(queries, "fetchTasks").mockResolvedValue([
      buildTask({ id: "inpaint", group: "modifica", label: "Modifica una parte", available: true }),
    ]);
    renderEditPage();

    expect(await screen.findByRole("button", { name: "Genera" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Scarica i modelli mancanti" })).not.toBeInTheDocument();
  });
});
