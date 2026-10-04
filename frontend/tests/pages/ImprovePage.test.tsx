import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ImprovePage } from "@/pages/ImprovePage";
import * as queries from "@/api/queries";
import { clipPathForPercent } from "@/lib/beforeAfter";
import { BeforeAfterSlider } from "@/components/common/BeforeAfterSlider";
import { buildTask } from "../fixtures/task";
import { installMockEventSource } from "../mocks/mockEventSource";

const NO_IMAGE_REASON = "Carica un'immagine prima di generare.";

function improveTasks(upscaleAvailable = true) {
  return [
    buildTask({ id: "variazione_sottile", group: "migliora", label: "Variazione leggera" }),
    buildTask({ id: "variazione_forte", group: "migliora", label: "Variazione forte" }),
    buildTask({
      id: "upscale",
      group: "migliora",
      label: "Ingrandisci",
      available: upscaleAvailable,
      unavailable_reason: upscaleAvailable ? null : "Il modello di ingrandimento non è installato.",
    }),
  ];
}

function renderImprovePage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/migliora"]}>
        <ImprovePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function uploadImage() {
  const file = new File(["fake-image-bytes"], "photo.png", { type: "image/png" });
  await userEvent.upload(screen.getByLabelText("Scegli un'immagine da migliorare"), file);
  await waitFor(() => expect(screen.queryByText(NO_IMAGE_REASON)).not.toBeInTheDocument());
}

describe("ImprovePage", () => {
  beforeEach(() => {
    installMockEventSource();
    vi.spyOn(queries, "uploadFile").mockResolvedValue({
      upload_id: "upload-image-1",
      width: 1152,
      height: 896,
    });
    globalThis.URL.createObjectURL = vi.fn(() => "blob:preview");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("disables every action with a reason until an image is loaded", async () => {
    vi.spyOn(queries, "fetchTasks").mockResolvedValue(improveTasks());
    renderImprovePage();

    await screen.findByRole("button", { name: "Variazione leggera" });
    for (const name of ["Variazione leggera", "Variazione forte", "Ingrandisci"]) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
    expect(screen.getAllByText(NO_IMAGE_REASON)).toHaveLength(3);

    await uploadImage();
    expect(screen.getByRole("button", { name: "Variazione leggera" })).toBeEnabled();
  });

  it("keeps upscale disabled with the catalog reason when its task is unavailable", async () => {
    vi.spyOn(queries, "fetchTasks").mockResolvedValue(improveTasks(false));
    renderImprovePage();
    await screen.findByRole("button", { name: "Ingrandisci" });
    await uploadImage();

    expect(screen.getByRole("button", { name: "Ingrandisci" })).toBeDisabled();
    expect(screen.getByText("Il modello di ingrandimento non è installato.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Variazione forte" })).toBeEnabled();
  });

  it("sends a variation job with the optional prompt and the uploaded image", async () => {
    vi.spyOn(queries, "fetchTasks").mockResolvedValue(improveTasks());
    const createJob = vi.spyOn(queries, "createJob").mockResolvedValue({ job_id: "job-1" });
    renderImprovePage();
    await screen.findByRole("button", { name: "Variazione forte" });
    await uploadImage();

    await userEvent.type(screen.getByLabelText("Descrizione (facoltativa)"), "autumn colors");
    await userEvent.click(screen.getByRole("button", { name: "Variazione forte" }));

    await waitFor(() => expect(createJob).toHaveBeenCalledTimes(1));
    const body = createJob.mock.calls[0]?.[0];
    expect(body).toEqual(
      expect.objectContaining({
        task_id: "variazione_forte",
        prompt: "autumn colors",
        input_upload_id: "upload-image-1",
      }),
    );
    expect(body).not.toHaveProperty("upscale_factor");
  });

  it("sends an upscale job with factor 4 and no prompt", async () => {
    vi.spyOn(queries, "fetchTasks").mockResolvedValue(improveTasks());
    const createJob = vi.spyOn(queries, "createJob").mockResolvedValue({ job_id: "job-2" });
    renderImprovePage();
    await screen.findByRole("button", { name: "Ingrandisci" });
    await uploadImage();

    await userEvent.type(screen.getByLabelText("Descrizione (facoltativa)"), "ignored");
    await userEvent.click(screen.getByRole("radio", { name: "×4" }));
    await userEvent.click(screen.getByRole("button", { name: "Ingrandisci" }));

    await waitFor(() => expect(createJob).toHaveBeenCalledTimes(1));
    expect(createJob.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ task_id: "upscale", prompt: "", upscale_factor: 4 }),
    );
  });
});

describe("before/after comparison", () => {
  it("clips the after image to the slider percentage, clamped to 0-100", () => {
    expect(clipPathForPercent(30)).toBe("inset(0 70% 0 0)");
    expect(clipPathForPercent(-5)).toBe("inset(0 100% 0 0)");
    expect(clipPathForPercent(140)).toBe("inset(0 0% 0 0)");
  });

  it("moves the visible portion when the slider changes", () => {
    render(<BeforeAfterSlider beforeUrl="/before.png" afterUrl="/after.png" sliderId="cmp" />);
    const after = screen.getByAltText("Risultato, dopo");
    expect(after.style.clipPath).toBe("inset(0 50% 0 0)");

    fireEvent.change(screen.getByLabelText("Confronto prima/dopo"), { target: { value: "80" } });
    expect(after.style.clipPath).toBe("inset(0 20% 0 0)");
  });
});
