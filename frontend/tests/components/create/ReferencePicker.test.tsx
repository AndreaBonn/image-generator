import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReferencePicker, type ReferenceItem } from "@/components/create/ReferencePicker";
import * as queries from "@/api/queries";
import { buildGenerationSummary } from "../../fixtures/generation";

function renderPicker(items: ReferenceItem[], onChange = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ReferencePicker items={items} onChange={onChange} />
    </QueryClientProvider>,
  );
  return onChange;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ReferencePicker", () => {
  it("shows the empty-state explanation when there are no references yet", () => {
    renderPicker([]);
    expect(screen.getByText("Aggiungi da 1 a 3 foto dello stesso soggetto.")).toBeInTheDocument();
    expect(screen.getByText("0 di 3")).toBeInTheDocument();
  });

  it("uploads a file and reports the new reference to the parent", async () => {
    vi.spyOn(queries, "uploadFile").mockResolvedValue({
      upload_id: "up-1",
      width: 1024,
      height: 1024,
    });
    const onChange = renderPicker([]);

    const file = new File(["bytes"], "ref.png", { type: "image/png" });
    const input = screen.getByLabelText("Aggiungi riferimento da file");
    await userEvent.upload(input, file);

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const [newItems] = onChange.mock.calls[0] as [ReferenceItem[]];
    expect(newItems).toHaveLength(1);
    expect(newItems[0]?.input).toEqual({ upload_id: "up-1" });
  });

  it("shows an Italian error when the upload fails", async () => {
    vi.spyOn(queries, "uploadFile").mockRejectedValue(new Error("boom"));
    renderPicker([]);

    const file = new File(["bytes"], "ref.png", { type: "image/png" });
    const input = screen.getByLabelText("Aggiungi riferimento da file");
    await userEvent.upload(input, file);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Impossibile caricare l'immagine. Verifica formato e dimensione.",
    );
  });

  it("renders an accessible remove button per reference and reports removal", async () => {
    const items: ReferenceItem[] = [
      { key: "upload:up-1", input: { upload_id: "up-1" }, previewUrl: "blob:1" },
      { key: "generation:gen-1", input: { generation_id: "gen-1" }, previewUrl: "/thumb/gen-1" },
    ];
    const onChange = renderPicker(items);

    expect(screen.getByText("2 di 3")).toBeInTheDocument();
    const removeSecond = screen.getByRole("button", { name: "Rimuovi riferimento 2" });
    await userEvent.click(removeSecond);

    expect(onChange).toHaveBeenCalledWith([items[0]]);
  });

  it("disables adding once the maximum of 3 references is reached", () => {
    const items: ReferenceItem[] = [
      { key: "a", input: { upload_id: "a" }, previewUrl: "blob:a" },
      { key: "b", input: { upload_id: "b" }, previewUrl: "blob:b" },
      { key: "c", input: { upload_id: "c" }, previewUrl: "blob:c" },
    ];
    renderPicker(items);

    expect(screen.getByText("3 di 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aggiungi da file" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Aggiungi dalla galleria" })).toBeDisabled();
  });

  it("opens the gallery dialog, lists generations and picks one as a reference", async () => {
    vi.spyOn(queries, "fetchGenerations").mockResolvedValue({
      items: [buildGenerationSummary({ id: "gen-9", prompt: "a mountain at dawn" })],
      meta: { page: 1, per_page: 24, total: 1, total_pages: 1 },
    });
    const onChange = renderPicker([]);

    await userEvent.click(screen.getByRole("button", { name: "Aggiungi dalla galleria" }));
    const pick = await screen.findByRole("button", { name: "Usa come riferimento: a mountain at dawn" });
    await userEvent.click(pick);

    expect(onChange).toHaveBeenCalledWith([
      { key: "generation:gen-9", input: { generation_id: "gen-9" }, previewUrl: "/api/v1/generations/gen-9/thumbnail" },
    ]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("ReferencePicker while an upload is pending", () => {
  it("disables adding from the gallery until the upload finishes", async () => {
    vi.spyOn(queries, "uploadFile").mockReturnValue(new Promise(() => {}));
    renderPicker([]);

    await userEvent.upload(
      screen.getByLabelText("Aggiungi riferimento da file"),
      new File(["bytes"], "ref.png", { type: "image/png" }),
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Aggiungi dalla galleria" })).toBeDisabled(),
    );
  });
});

describe("ReferencePicker previews", () => {
  it("revokes the local preview URL of a removed upload, but not of the ones kept", async () => {
    const revoke = vi.fn();
    vi.stubGlobal("URL", { ...URL, revokeObjectURL: revoke, createObjectURL: vi.fn() });
    const kept: ReferenceItem = { key: "upload:a", input: { upload_id: "a" }, previewUrl: "blob:a" };
    const removed: ReferenceItem = { key: "upload:b", input: { upload_id: "b" }, previewUrl: "blob:b" };
    const client = new QueryClient();
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <ReferencePicker items={[kept, removed]} onChange={vi.fn()} />
      </QueryClientProvider>,
    );

    rerender(
      <QueryClientProvider client={client}>
        <ReferencePicker items={[kept]} onChange={vi.fn()} />
      </QueryClientProvider>,
    );

    expect(revoke).toHaveBeenCalledWith("blob:b");
    expect(revoke).not.toHaveBeenCalledWith("blob:a");
    vi.unstubAllGlobals();
  });
});
