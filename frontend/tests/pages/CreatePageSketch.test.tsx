import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CreatePage } from "@/pages/CreatePage";
import * as queries from "@/api/queries";
import { buildTask } from "../fixtures/task";
import { installMockEventSource } from "../mocks/mockEventSource";

// The real pad needs a canvas jsdom lacks; this stand-in only reports a drawing.
vi.mock("@/components/create/SketchPad", () => ({
  SketchPad: ({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) => (
    <button type="button" onClick={() => onDirtyChange?.(true)}>
      Simula un tratto
    </button>
  ),
}));

function renderCreatePage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CreatePage />
    </QueryClientProvider>,
  );
}

describe("CreatePage da_schizzo", () => {
  beforeEach(() => {
    installMockEventSource();
    vi.spyOn(queries, "fetchTasks").mockResolvedValue([
      buildTask({
        id: "da_schizzo",
        label: "Dallo schizzo",
        min_references: 1,
        max_references: 2,
        reference_labels: ["Schizzo", "Stile o soggetto"],
      }),
    ]);
    vi.spyOn(queries, "fetchStyles").mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("blocks adding other references while an unsaved sketch is on the canvas", async () => {
    renderCreatePage();
    const addFromFile = await screen.findByRole("button", { name: "Aggiungi schizzo da file" });
    expect(addFromFile).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "Simula un tratto" }));

    await waitFor(() => expect(addFromFile).toBeDisabled());
    expect(screen.getByRole("button", { name: "Aggiungi schizzo dalla galleria" })).toBeDisabled();
  });
});
