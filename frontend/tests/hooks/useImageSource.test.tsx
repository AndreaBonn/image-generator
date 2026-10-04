import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useImageSource } from "@/hooks/useImageSource";
import * as queries from "@/api/queries";
import type { Generation } from "@/api/types";

function buildGeneration(overrides: Partial<Generation> = {}): Generation {
  return {
    id: "gen-1",
    job_id: "job-1",
    task_id: "qualita",
    model_ids: ["juggernaut-xl-v8"],
    prompt: "portrait of an old fisherman, golden hour",
    negative_prompt: "",
    prompt_final: "portrait of an old fisherman, golden hour",
    params: {},
    seed: 42,
    width: 1152,
    height: 896,
    parent_id: null,
    duration_ms: 5000,
    favorite: false,
    created_at: "2026-10-01T10:00:00Z",
    updated_at: "2026-10-01T10:00:00Z",
    ...overrides,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useImageSource", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("has no image and does not fetch when there is no source generation id", () => {
    const fetchGenerationSpy = vi.spyOn(queries, "fetchGeneration");
    const { result } = renderHook(() => useImageSource(null), { wrapper });

    expect(result.current.hasImage).toBe(false);
    expect(result.current.image).toBeNull();
    expect(result.current.isLoadingSource).toBe(false);
    expect(fetchGenerationSpy).not.toHaveBeenCalled();
  });

  it("fetches the source generation and derives the image from it (SPEC.md § 11.2)", async () => {
    const generation = buildGeneration({ id: "gen-42", width: 800, height: 600 });
    const fetchGenerationSpy = vi
      .spyOn(queries, "fetchGeneration")
      .mockResolvedValue(generation);

    const { result } = renderHook(() => useImageSource("gen-42"), { wrapper });

    await waitFor(() => expect(result.current.hasImage).toBe(true));

    expect(fetchGenerationSpy).toHaveBeenCalledWith("gen-42", expect.anything());
    expect(result.current.image).toEqual({
      url: queries.imageUrl("gen-42"),
      width: 800,
      height: 600,
      uploadId: null,
    });
  });
});
