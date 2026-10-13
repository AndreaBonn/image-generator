import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "@/App";
import * as queries from "@/api/queries";

// App.tsx's only responsibility is wiring routes to pages; the pages
// themselves (and their own API calls) are covered by their own test
// files, so they are stubbed here to isolate the routing contract.
vi.mock("@/pages/CreatePage", () => ({ CreatePage: () => <p>Stub Crea</p> }));
vi.mock("@/pages/EditPage", () => ({ EditPage: () => <p>Stub Modifica</p> }));
vi.mock("@/pages/ImprovePage", () => ({ ImprovePage: () => <p>Stub Migliora</p> }));
vi.mock("@/pages/GalleryPage", () => ({ GalleryPage: () => <p>Stub Galleria</p> }));
vi.mock("@/pages/SettingsPage", () => ({ SettingsPage: () => <p>Stub Impostazioni</p> }));
vi.mock("@/pages/GuidePage", () => ({ GuidePage: () => <p>Stub Guida</p> }));

function renderAppAt(path: string) {
  vi.spyOn(queries, "fetchHealth").mockResolvedValue({ backend: "ok", engine: "ok" });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("App routing", () => {
  it("renders CreatePage at the index route", () => {
    renderAppAt("/");

    expect(screen.getByText("Stub Crea")).toBeInTheDocument();
  });

  it("renders EditPage at /modifica", () => {
    renderAppAt("/modifica");

    expect(screen.getByText("Stub Modifica")).toBeInTheDocument();
  });

  it("renders ImprovePage at /migliora", () => {
    renderAppAt("/migliora");

    expect(screen.getByText("Stub Migliora")).toBeInTheDocument();
  });

  it("renders GalleryPage at /galleria", () => {
    renderAppAt("/galleria");

    expect(screen.getByText("Stub Galleria")).toBeInTheDocument();
  });

  it("renders SettingsPage at /impostazioni", () => {
    renderAppAt("/impostazioni");

    expect(screen.getByText("Stub Impostazioni")).toBeInTheDocument();
  });

  it("renders GuidePage at /guida (N3)", () => {
    renderAppAt("/guida");

    expect(screen.getByText("Stub Guida")).toBeInTheDocument();
  });

  it("wraps every route in the AppShell, with the nav bar always visible", () => {
    renderAppAt("/galleria");

    expect(screen.getByRole("navigation", { name: "Navigazione principale" })).toBeInTheDocument();
  });

  it("renders nothing at all for an unknown route, since there is no catch-all", () => {
    const { container } = renderAppAt("/questa-rotta-non-esiste");

    // AppShell is itself inside the layout Route: with no child route
    // matching, React Router renders neither the page nor the shell.
    expect(screen.queryByText(/^Stub /)).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });
});
