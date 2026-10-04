import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SettingsPage } from "@/pages/SettingsPage";
import * as queries from "@/api/queries";
import { buildSystemInfo } from "../fixtures/system";

function renderSettingsPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SettingsPage />
    </QueryClientProvider>,
  );
}

/**
 * Augments SettingsPage.test.tsx (owned by another agent) with the one
 * uncovered line there: retrying the system-status fetch from the error
 * state (SPEC.md § 11.2, "Riprova").
 */
describe("SettingsPage error retry", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("refetches the system status when Riprova is clicked after a failure", async () => {
    const fetchSystemSpy = vi
      .spyOn(queries, "fetchSystem")
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(buildSystemInfo());

    renderSettingsPage();

    await screen.findByText("Impossibile leggere lo stato del motore.");
    await userEvent.click(screen.getByRole("button", { name: "Riprova" }));

    await waitFor(() => expect(fetchSystemSpy).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByText("Impossibile leggere lo stato del motore.")).not.toBeInTheDocument(),
    );
  });

  it("hides the GPU card when the engine reports no GPU info", async () => {
    vi.spyOn(queries, "fetchSystem").mockResolvedValue(buildSystemInfo({ gpu: null }));

    renderSettingsPage();

    // "Impostazioni" renders during loading too; wait for a success-only
    // element so the assertion below exercises the loaded, gpu-less state
    // instead of racing the query.
    await screen.findByRole("button", { name: "Svuota cartella output del motore" });
    expect(screen.queryByText("Scheda video")).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar", { name: "VRAM in uso" })).not.toBeInTheDocument();
  });
});
