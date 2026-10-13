import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { ActiveJobsIndicator } from "@/components/layout/ActiveJobsIndicator";
import * as queries from "@/api/queries";
import { buildTask } from "../../fixtures/task";
import { renderWithProviders } from "../../fixtures/providers";
import { installMockEventSource, latestEventSource } from "../../mocks/mockEventSource";

describe("ActiveJobsIndicator (N1)", () => {
  beforeEach(() => {
    installMockEventSource();
    vi.spyOn(queries, "fetchTasks").mockResolvedValue([buildTask({ id: "bozza", label: "Bozza veloce" })]);
  });
  afterEach(() => vi.restoreAllMocks());

  it("shows nothing when no job is running", async () => {
    const fetchActiveJobs = vi.spyOn(queries, "fetchActiveJobs").mockResolvedValue([]);

    renderWithProviders(<ActiveJobsIndicator />);

    await waitFor(() => expect(fetchActiveJobs).toHaveBeenCalled());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("names the running task and follows its progress from any page", async () => {
    vi.spyOn(queries, "fetchActiveJobs").mockResolvedValue([
      { job_id: "job-1", task_id: "bozza", status: "running" },
    ]);

    renderWithProviders(<ActiveJobsIndicator />);

    expect(await screen.findByRole("status")).toHaveTextContent("Bozza veloce in corso");
    latestEventSource().emit("progress", { step: 3, total: 4 });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Bozza veloce in corso · 75%"));
  });

  it("counts several running jobs", async () => {
    vi.spyOn(queries, "fetchActiveJobs").mockResolvedValue([
      { job_id: "job-1", task_id: "bozza", status: "running" },
      { job_id: "job-2", task_id: "bozza", status: "queued" },
    ]);

    renderWithProviders(<ActiveJobsIndicator />);

    expect(await screen.findByRole("status")).toHaveTextContent("2 lavori in corso");
  });
});
