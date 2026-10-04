import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { apiClient, newIdempotencyKey, requestWithMeta } from "@/api/client";
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

  it("maps a network failure to a generic Italian ApiError, with the cause in details", async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError("fetch failed"));

    const error = await apiClient.get("/health").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toMatch(/Impossibile contattare il server/);
    expect((error as ApiError).details).toEqual([{ message: "fetch failed" }]);
  });

  it("maps a non-Error network rejection to an ApiError with no detail entries", async () => {
    global.fetch = vi.fn().mockRejectedValue("boom");

    const error = await apiClient.get("/health").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("NETWORK_ERROR");
    expect((error as ApiError).details).toEqual([]);
  });

  it("sets Content-Type: application/json for a JSON body and includes it in the request", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: null }),
    } as Response);

    await apiClient.post("/jobs", { task_id: "qualita" });

    const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect((options.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(options.body).toBe(JSON.stringify({ task_id: "qualita" }));
  });

  it("does not set Content-Type for a FormData body, and sends it unstringified", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { upload_id: "up-1" } }),
    } as Response);
    const formData = new FormData();
    formData.append("kind", "image");

    await apiClient.postForm("/uploads", formData);

    const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect((options.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
    expect(options.body).toBe(formData);
  });

  it("adds the Idempotency-Key header only when one is given", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: null }),
    } as Response);

    await apiClient.post("/jobs", {}, "my-key");
    const [, withKey] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect((withKey.headers as Record<string, string>)["Idempotency-Key"]).toBe("my-key");

    await apiClient.post("/jobs", {});
    const [, withoutKey] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[1] as [
      string,
      RequestInit,
    ];
    expect((withoutKey.headers as Record<string, string>)["Idempotency-Key"]).toBeUndefined();
  });

  it("returns undefined on a 204 response without attempting to parse a body", async () => {
    const json = vi.fn(() => {
      throw new Error("json() must not be called on a 204 response");
    });
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 204, json } as unknown as Response);

    const result = await apiClient.del("/generations/gen-1");
    expect(result).toBeUndefined();
    expect(json).not.toHaveBeenCalled();
  });

  it("wraps a malformed JSON body on an otherwise-successful response as a network error", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected end of JSON input");
      },
    } as unknown as Response);

    const error = await apiClient.get("/health").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("NETWORK_ERROR");
  });

  it("falls back to a generic Italian error when a failed response body isn't valid JSON", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    } as unknown as Response);

    const error = await apiClient.get("/health").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      code: "UNKNOWN_ERROR",
      message: "Si è verificato un errore imprevisto. Riprova.",
      status: 502,
    });
  });

  it("falls back to a generic error with empty details when the body doesn't match the error envelope", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ unexpected: "shape" }),
    } as Response);

    const error = await apiClient.get("/health").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "UNKNOWN_ERROR", status: 500 });
    expect((error as ApiError).details).toEqual([]);
  });
});

describe("requestWithMeta", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns the full envelope, data and meta, on success", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: "gen-1" }], meta: { page: 1, total: 1 } }),
    } as Response);

    const result = await requestWithMeta("/generations");
    expect(result).toEqual({ data: [{ id: "gen-1" }], meta: { page: 1, total: 1 } });
  });

  it("throws ApiError with the backend code when the error envelope matches the shape", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: { code: "NOT_FOUND", message: "Generazione non trovata.", details: [] } }),
    } as Response);

    await expect(requestWithMeta("/generations/missing")).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Generazione non trovata.",
      status: 404,
    });
  });

  it("falls back to a generic error when the failed response doesn't match the error envelope", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as Response);

    const error = await requestWithMeta("/generations").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "UNKNOWN_ERROR", status: 500 });
  });

  it("maps a network failure to an ApiError", async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError("fetch failed"));

    const error = await requestWithMeta("/generations").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("NETWORK_ERROR");
  });
});

describe("newIdempotencyKey", () => {
  it("returns a v4-looking UUID string, different on every call", () => {
    const first = newIdempotencyKey();
    const second = newIdempotencyKey();
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(second).toMatch(/^[0-9a-f-]{36}$/);
    expect(first).not.toBe(second);
  });
});
