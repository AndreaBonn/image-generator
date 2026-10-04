import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CreatePage } from "@/pages/CreatePage";
import * as queries from "@/api/queries";
import { buildTask } from "../fixtures/task";
import { installMockEventSource, latestEventSource } from "../mocks/mockEventSource";

function renderCreatePage() {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <CreatePage />
    </QueryClientProvider>,
  );
}

describe("CreatePage generation error", () => {
  beforeEach(() => {
    installMockEventSource();
    vi.spyOn(queries, "fetchTasks").mockResolvedValue([buildTask()]);
    vi.spyOn(queries, "fetchStyles").mockResolvedValue([]);
  });

  it("keeps the prompt and shows the Italian error message when the job fails", async () => {
    vi.spyOn(queries, "createJob").mockResolvedValue({ job_id: "job-1" });

    renderCreatePage();

    const textarea = await screen.findByLabelText("Descrizione");
    await userEvent.type(textarea, "portrait of an old fisherman");
    await userEvent.click(screen.getByRole("button", { name: "Genera" }));

    const source = await waitFor(() => latestEventSource());
    source.emit("failed", {
      code: "ENGINE_UNAVAILABLE",
      message: "Il motore non risponde. Avvialo con scripts/start.sh.",
    });

    await waitFor(() =>
      expect(
        screen.getByText("Il motore non risponde. Avvialo con scripts/start.sh."),
      ).toBeInTheDocument(),
    );
    expect(textarea).toHaveValue("portrait of an old fisherman");
  });
});
