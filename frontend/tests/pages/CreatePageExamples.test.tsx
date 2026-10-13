import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CreatePage } from "@/pages/CreatePage";
import * as queries from "@/api/queries";
import { buildTask } from "../fixtures/task";
import { buildExampleItem, buildExamplesResponse } from "../fixtures/example";
import { installMockEventSource, latestEventSource } from "../mocks/mockEventSource";

function renderCreatePage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CreatePage />
    </QueryClientProvider>,
  );
}

describe("CreatePage examples panel (SPEC.md § 11.3)", () => {
  beforeEach(() => {
    installMockEventSource();
    vi.spyOn(queries, "fetchTasks").mockResolvedValue([buildTask({ id: "qualita", label: "Immagine di qualità" })]);
    vi.spyOn(queries, "fetchStyles").mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the panel when first_use is true", async () => {
    vi.spyOn(queries, "fetchExamples").mockResolvedValue(
      buildExamplesResponse({ first_use: true, examples: [buildExampleItem({ task_id: "qualita" })] }),
    );
    renderCreatePage();

    expect(await screen.findByText("Prova un esempio")).toBeInTheDocument();
  });

  it("hides the panel once the user has already generated (first_use false)", async () => {
    vi.spyOn(queries, "fetchExamples").mockResolvedValue(buildExamplesResponse({ first_use: false }));
    renderCreatePage();

    await screen.findByLabelText("Descrivi l'immagine che vuoi");
    expect(screen.queryByText("Prova un esempio")).not.toBeInTheDocument();
  });

  it("fills the form and moves focus to Genera without sending a job", async () => {
    const example = buildExampleItem({
      task_id: "qualita",
      prompt: "a lighthouse at dusk, cinematic",
      seed: 777,
      aspect_ratio: "1024*1024",
    });
    vi.spyOn(queries, "fetchExamples").mockResolvedValue(
      buildExamplesResponse({ first_use: true, examples: [example] }),
    );
    const createJobSpy = vi.spyOn(queries, "createJob");
    renderCreatePage();

    await userEvent.click(await screen.findByRole("button", { name: "Prova questo" }));

    await waitFor(() => expect(screen.getByLabelText("Descrivi l'immagine che vuoi")).toHaveValue(example.prompt));
    expect(screen.getByText("Codice del risultato: 777, tenuto")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Genera" })).toHaveFocus();
    expect(createJobSpy).not.toHaveBeenCalled();
  });

  it("hides the panel after the first generation completes in the same session", async () => {
    vi.spyOn(queries, "fetchExamples")
      .mockResolvedValueOnce(buildExamplesResponse({ first_use: true, examples: [buildExampleItem({ task_id: "qualita" })] }))
      .mockResolvedValue(buildExamplesResponse({ first_use: false }));
    vi.spyOn(queries, "createJob").mockResolvedValue({ job_id: "job-1" });
    renderCreatePage();
    expect(await screen.findByRole("heading", { name: "Prova un esempio" })).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Descrivi l'immagine che vuoi"), "a red fox");
    await userEvent.click(screen.getByRole("button", { name: "Genera" }));
    const source = await waitFor(() => latestEventSource());
    source.emit("completed", { generation_ids: [] });

    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Prova un esempio" })).not.toBeInTheDocument(),
    );
  });
});
