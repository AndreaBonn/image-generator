import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ExamplesCard } from "@/components/settings/ExamplesCard";
import * as queries from "@/api/queries";
import { buildExampleItem, buildExamplesResponse } from "../../fixtures/example";

function renderExamplesCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ExamplesCard />
    </QueryClientProvider>,
  );
}

describe("ExamplesCard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows how many examples are present", async () => {
    vi.spyOn(queries, "fetchExamples").mockResolvedValue(
      buildExamplesResponse({ examples: [buildExampleItem(), buildExampleItem({ id: "ex-2" })] }),
    );
    renderExamplesCard();

    expect(await screen.findByText("2 esempi presenti.")).toBeInTheDocument();
  });

  it("shows an absent state when no examples exist", async () => {
    vi.spyOn(queries, "fetchExamples").mockResolvedValue(buildExamplesResponse({ examples: [] }));
    renderExamplesCard();

    expect(await screen.findByText("Nessun esempio presente.")).toBeInTheDocument();
  });

  it("shows the copyable generation command", async () => {
    vi.spyOn(queries, "fetchExamples").mockResolvedValue(buildExamplesResponse({ examples: [] }));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderExamplesCard();

    const command = "cd backend && uv run python -m app.cli.assets examples";
    expect(await screen.findByText(command)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Copia" }));
    expect(writeText).toHaveBeenCalledWith(command);
    expect(await screen.findByRole("button", { name: "Copiato" })).toBeInTheDocument();
  });
});
