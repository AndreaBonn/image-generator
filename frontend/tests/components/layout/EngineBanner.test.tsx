import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EngineBanner } from "@/components/layout/EngineBanner";
import * as queries from "@/api/queries";

function renderBanner() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <EngineBanner />
    </QueryClientProvider>,
  );
}

describe("EngineBanner", () => {
  it("shows nothing while the health check has not resolved yet", () => {
    vi.spyOn(queries, "fetchHealth").mockReturnValue(new Promise(() => {}));

    renderBanner();

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows nothing when the engine is reachable", async () => {
    const fetchHealth = vi
      .spyOn(queries, "fetchHealth")
      .mockResolvedValue({ backend: "ok", engine: "ok" });

    renderBanner();

    await waitFor(() => expect(fetchHealth).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("warns with the start command when the engine is unreachable", async () => {
    vi.spyOn(queries, "fetchHealth").mockResolvedValue({ backend: "ok", engine: "unreachable" });

    renderBanner();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Il motore non risponde.");
    expect(screen.getByText("./scripts/start.sh")).toBeInTheDocument();
  });

  it("shows nothing when the health check itself fails", async () => {
    const fetchHealth = vi.spyOn(queries, "fetchHealth").mockRejectedValue(new Error("boom"));

    renderBanner();

    await waitFor(() => expect(fetchHealth).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
