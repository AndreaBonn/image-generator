import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { apiClient } from "@/api/client";
import { ApiError } from "@/api/errors";

describe("apiClient", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns the data field on a successful envelope", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { foo: "bar" } }),
    } as Response);

    const result = await apiClient.get<{ foo: string }>("/whatever");
    expect(result).toEqual({ foo: "bar" });
  });

  it("throws ApiError with the Italian message from the error envelope", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        error: {
          code: "VALIDATION_ERROR",
          message: "Il campo prompt è obbligatorio.",
          details: [{ field: "prompt", message: "obbligatorio" }],
        },
      }),
    } as Response);

    await expect(apiClient.get("/jobs")).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Il campo prompt è obbligatorio.",
    });
  });

  it("maps a network failure to a generic Italian ApiError", async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError("fetch failed"));

    const error = await apiClient.get("/health").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toMatch(/Impossibile contattare il server/);
  });
});
