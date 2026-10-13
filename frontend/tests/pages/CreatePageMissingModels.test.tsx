import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as queries from "@/api/queries";
import { buildTask } from "../fixtures/task";
import { buildModelInfo, buildSystemInfo } from "../fixtures/system";
import { renderCreatePage } from "../fixtures/createPage";
import { installMockEventSource, latestEventSource } from "../mocks/mockEventSource";

const draft = buildTask({ id: "bozza", label: "Bozza veloce" });
const quality = buildTask({ id: "qualita", label: "Immagine di qualità" });
const qualityMissing = {
  ...quality,
  available: false,
  unavailable_reason: "Modelli non installati: SDXL offset LoRA.",
  missing_model_ids: ["sdxl_offset_lora"],
};

describe("CreatePage missing models", () => {
  beforeEach(() => {
    installMockEventSource();
    vi.spyOn(queries, "fetchStyles").mockResolvedValue([]);
    vi.spyOn(queries, "fetchExamples").mockResolvedValue({ first_use: false, examples: [] });
    vi.spyOn(queries, "fetchGenerations").mockResolvedValue({ items: [], total: 0 } as never);
    vi.spyOn(queries, "fetchSystem").mockResolvedValue(
      buildSystemInfo({
        models: [buildModelInfo({ id: "sdxl_offset_lora", label: "SDXL offset LoRA", status: "missing", size_gb: 0.05 })],
      }),
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
  });

  it("selects the task once its models are installed and /tasks reports it available", async () => {
    const fetchTasks = vi.spyOn(queries, "fetchTasks").mockResolvedValue([draft, qualityMissing]);
    vi.spyOn(queries, "startModelDownload").mockResolvedValue(undefined);
    renderCreatePage();

    const card = await screen.findByRole("button", { name: /Immagine di qualità/ });
    await userEvent.click(card);
    await userEvent.click(await screen.findByRole("button", { name: "Scarica" }));

    fetchTasks.mockResolvedValue([draft, quality]);
    act(() => latestEventSource().emit("completed", {}));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Immagine di qualità/ })).toHaveAttribute("aria-pressed", "true"),
    );
  });

  it("keeps the current task when /tasks still reports the task unavailable", async () => {
    vi.spyOn(queries, "fetchTasks").mockResolvedValue([draft, qualityMissing]);
    vi.spyOn(queries, "startModelDownload").mockResolvedValue(undefined);
    renderCreatePage();

    await userEvent.click(await screen.findByRole("button", { name: /Immagine di qualità/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Scarica" }));
    act(() => latestEventSource().emit("completed", {}));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Bozza veloce/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Immagine di qualità/ })).toHaveAttribute("aria-pressed", "false");
  });
});
