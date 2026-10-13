import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import * as queries from "@/api/queries";

function renderShell() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/pagina-di-prova"]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="pagina-di-prova" element={<p>Contenuto della pagina</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AppShell", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the nav and the routed page content inside the main region, with no engine banner when healthy", async () => {
    vi.spyOn(queries, "fetchHealth").mockResolvedValue({ backend: "ok", engine: "ok" });

    renderShell();

    expect(screen.getByRole("navigation", { name: "Navigazione principale" })).toBeInTheDocument();
    const main = screen.getByRole("main");
    expect(main).toHaveTextContent("Contenuto della pagina");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows running jobs inside the nav bar on every page (N1)", async () => {
    vi.spyOn(queries, "fetchHealth").mockResolvedValue({ backend: "ok", engine: "ok" });
    vi.spyOn(queries, "fetchTasks").mockResolvedValue([]);
    vi.spyOn(queries, "fetchActiveJobs").mockResolvedValue([
      { job_id: "job-1", task_id: "bozza", status: "running" },
      { job_id: "job-2", task_id: "foto", status: "queued" },
    ]);

    renderShell();

    const nav = screen.getByRole("navigation", { name: "Navigazione principale" });
    expect(await within(nav).findByRole("status")).toHaveTextContent("2 lavori in corso");
  });

  it("shows the engine banner above the nav when the engine is unreachable", async () => {
    vi.spyOn(queries, "fetchHealth").mockResolvedValue({ backend: "ok", engine: "unreachable" });

    renderShell();

    expect(await screen.findByRole("alert")).toHaveTextContent("Il motore che crea le immagini si è fermato.");
    expect(screen.getByRole("navigation", { name: "Navigazione principale" })).toBeInTheDocument();
  });
});
