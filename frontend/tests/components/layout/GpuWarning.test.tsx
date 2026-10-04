import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GpuWarning } from "@/components/layout/GpuWarning";
import * as queries from "@/api/queries";
import { buildGpuInfo, buildSystemInfo } from "../../fixtures/system";

function renderGpuWarning() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <QueryClientProvider client={client}>
      <GpuWarning />
    </QueryClientProvider>,
  );
  return { ...result, client };
}

describe("GpuWarning", () => {
  it("shows the warning when free VRAM is low", async () => {
    vi.spyOn(queries, "fetchSystem").mockResolvedValue(
      buildSystemInfo({ gpu: buildGpuInfo({ vram_free_mb: 2000 }) }),
    );

    renderGpuWarning();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Un altro programma sta usando la scheda video.",
    );
  });

  it("shows the warning and lists the process when another program uses the GPU", async () => {
    vi.spyOn(queries, "fetchSystem").mockResolvedValue(
      buildSystemInfo({
        gpu: buildGpuInfo({
          vram_free_mb: 7000,
          other_processes: [{ name: "ollama", used_mb: 6000 }],
        }),
      }),
    );

    renderGpuWarning();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("ollama");
    expect(alert).toHaveTextContent("6000 MB");
  });

  it("renders nothing when the GPU is free and no other process is running", async () => {
    vi.spyOn(queries, "fetchSystem").mockResolvedValue(
      buildSystemInfo({ gpu: buildGpuInfo({ vram_free_mb: 7000, other_processes: [] }) }),
    );

    const { client } = renderGpuWarning();

    await waitFor(() => expect(client.getQueryState(["system"])?.status).toBe("success"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
