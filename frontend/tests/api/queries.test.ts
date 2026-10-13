import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelJob,
  checkPromptLanguage,
  clearEngineOutput,
  createJob,
  deleteGeneration,
  emptyTrash,
  fetchGeneration,
  fetchGenerations,
  fetchHealth,
  fetchStyles,
  fetchSystem,
  fetchTasks,
  imageUrl,
  rerunGeneration,
  restoreGeneration,
  setFavorite,
  thumbnailUrl,
  uploadFile,
} from "@/api/queries";
import { ApiError } from "@/api/errors";
import type { CreateJobBody, Generation } from "@/api/types";

/** Successful `{"data": ...}` envelope (SPEC.md § 7.2). */
function okJson(data: unknown, meta?: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => (meta === undefined ? { data } : { data, meta }),
  } as Response;
}

/** Error `{"error": {...}}` envelope (SPEC.md § 7.2, § 7.5). */
function errorJson(status: number, code: string, message: string) {
  return {
    ok: false,
    status,
    json: async () => ({ error: { code, message, details: [] } }),
  } as Response;
}

function fetchMock() {
  return global.fetch as ReturnType<typeof vi.fn>;
}

function lastCall() {
  const calls = fetchMock().mock.calls;
  const call = calls[calls.length - 1];
  if (!call) throw new Error("fetch was not called");
  return { url: call[0] as string, options: (call[1] ?? {}) as RequestInit };
}

describe("api/queries", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("fetchHealth: GETs /api/v1/health and returns the parsed status", async () => {
    global.fetch = vi.fn().mockResolvedValue(okJson({ backend: "ok", engine: "ok" }));
    const result = await fetchHealth();
    expect(lastCall().url).toBe("/api/v1/health");
    expect(lastCall().options.method ?? "GET").toBe("GET");
    expect(result).toEqual({ backend: "ok", engine: "ok" });
  });

  it("fetchHealth: forwards the AbortSignal", async () => {
    global.fetch = vi.fn().mockResolvedValue(okJson({ backend: "ok", engine: "ok" }));
    const controller = new AbortController();
    await fetchHealth(controller.signal);
    expect(lastCall().options.signal).toBe(controller.signal);
  });

  it("fetchSystem: GETs /api/v1/system", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      okJson({
        engine: { status: "ok", comfyui_version: "0.3.0" },
        gpu: null,
        disk: { free_gb: 40, min_free_gb: 10 },
        loaded_family: null,
        models: [],
        install_command: "uv run --script scripts/install_models.py",
      }),
    );
    const result = await fetchSystem();
    expect(lastCall().url).toBe("/api/v1/system");
    expect(result.loaded_family).toBeNull();
  });

  it("clearEngineOutput: POSTs /api/v1/maintenance/clear-engine-output", async () => {
    global.fetch = vi.fn().mockResolvedValue(okJson({ removed_files: 3, freed_mb: 120 }));
    const result = await clearEngineOutput();
    expect(lastCall().url).toBe("/api/v1/maintenance/clear-engine-output");
    expect(lastCall().options.method).toBe("POST");
    expect(result).toEqual({ removed_files: 3, freed_mb: 120 });
  });

  it("fetchTasks: GETs /api/v1/tasks and returns the catalog array", async () => {
    global.fetch = vi.fn().mockResolvedValue(okJson([{ id: "qualita" }]));
    const result = await fetchTasks();
    expect(lastCall().url).toBe("/api/v1/tasks");
    expect(result).toEqual([{ id: "qualita" }]);
  });

  it("fetchStyles: omits the query string when the query is blank", async () => {
    global.fetch = vi.fn().mockResolvedValue(okJson([]));
    await fetchStyles("");
    expect(lastCall().url).toBe("/api/v1/styles");
  });

  it("fetchStyles: omits the query string when the query is only whitespace", async () => {
    global.fetch = vi.fn().mockResolvedValue(okJson([]));
    await fetchStyles("   ");
    expect(lastCall().url).toBe("/api/v1/styles");
  });

  it("fetchStyles: trims and URL-encodes a non-blank query under ?q=", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      okJson([{ id: "fooocus-sharp", name: "Fooocus Sharp", source_file: "x.json" }]),
    );
    const result = await fetchStyles("  sai fantasy art  ");
    expect(lastCall().url).toBe("/api/v1/styles?q=sai%20fantasy%20art");
    expect(result).toEqual([{ id: "fooocus-sharp", name: "Fooocus Sharp", source_file: "x.json" }]);
  });

  it("checkPromptLanguage: POSTs the text and returns the language check result", async () => {
    global.fetch = vi.fn().mockResolvedValue(okJson({ looks_italian: false }));
    const result = await checkPromptLanguage("golden hour portrait");
    expect(lastCall().url).toBe("/api/v1/prompt/language-check");
    expect(lastCall().options.method).toBe("POST");
    expect(JSON.parse(lastCall().options.body as string)).toEqual({
      text: "golden hour portrait",
    });
    expect(result).toEqual({ looks_italian: false });
  });

  it("createJob: POSTs the job body to /api/v1/jobs with an Idempotency-Key header", async () => {
    global.fetch = vi.fn().mockResolvedValue(okJson({ job_id: "job-1" }));
    const body: CreateJobBody = {
      task_id: "qualita",
      prompt: "portrait of an old fisherman, golden hour",
      params: { seed: null, batch: 2 },
    };
    const result = await createJob(body);
    expect(lastCall().url).toBe("/api/v1/jobs");
    expect(lastCall().options.method).toBe("POST");
    expect(JSON.parse(lastCall().options.body as string)).toEqual(body);
    const headers = lastCall().options.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(result).toEqual({ job_id: "job-1" });
  });

  it("createJob: uses a fresh Idempotency-Key on every call", async () => {
    global.fetch = vi.fn().mockResolvedValue(okJson({ job_id: "job-1" }));
    const body: CreateJobBody = {
      task_id: "qualita",
      prompt: "a",
      params: { seed: null, batch: 1 },
    };
    await createJob(body);
    const first = (lastCall().options.headers as Record<string, string>)["Idempotency-Key"];
    await createJob(body);
    const second = (lastCall().options.headers as Record<string, string>)["Idempotency-Key"];
    expect(first).not.toBe(second);
  });

  it("uploadFile: multipart POST to /api/v1/uploads with file and kind in FormData", async () => {
    global.fetch = vi.fn().mockResolvedValue(okJson({ upload_id: "up-1", width: 100, height: 80 }));
    const file = new File(["bytes"], "source.png", { type: "image/png" });
    const result = await uploadFile(file, "image");

    expect(lastCall().url).toBe("/api/v1/uploads");
    expect(lastCall().options.method).toBe("POST");
    const sentBody = lastCall().options.body;
    expect(sentBody).toBeInstanceOf(FormData);
    const formData = sentBody as FormData;
    expect(formData.get("file")).toBe(file);
    expect(formData.get("kind")).toBe("image");
    // FormData sets its own multipart boundary; the client must not override it.
    const headers = (lastCall().options.headers ?? {}) as Record<string, string>;
    expect(headers["Content-Type"]).toBeUndefined();
    expect(result).toEqual({ upload_id: "up-1", width: 100, height: 80 });
  });

  it("uploadFile: sends kind=mask for a mask upload", async () => {
    global.fetch = vi.fn().mockResolvedValue(okJson({ upload_id: "up-2", width: 100, height: 80 }));
    const file = new File(["bytes"], "mask.png", { type: "image/png" });
    await uploadFile(file, "mask");
    const formData = lastCall().options.body as FormData;
    expect(formData.get("kind")).toBe("mask");
  });

  it("cancelJob: POSTs /api/v1/jobs/{id}/cancel with no body", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 204, json: vi.fn() } as unknown as Response);
    const result = await cancelJob("job-7");
    expect(lastCall().url).toBe("/api/v1/jobs/job-7/cancel");
    expect(lastCall().options.method).toBe("POST");
    expect(lastCall().options.body).toBeUndefined();
    expect(result).toBeUndefined();
  });

  it("fetchGenerations: builds no query string when no params are given", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      okJson([], { page: 1, per_page: 24, total: 0, total_pages: 0 }),
    );
    const result = await fetchGenerations({});
    expect(lastCall().url).toBe("/api/v1/generations");
    expect(result).toEqual({ items: [], meta: { page: 1, per_page: 24, total: 0, total_pages: 0 } });
  });

  it("fetchGenerations: repeats task_ids for a kind filter (G3)", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      okJson([], { page: 1, per_page: 24, total: 0, total_pages: 0 }),
    );
    await fetchGenerations({ taskIds: ["upscale", "rimuovi_sfondo"] });
    expect(lastCall().url).toBe("/api/v1/generations?task_ids=upscale&task_ids=rimuovi_sfondo");
  });

  it("fetchGenerations: serializes page, per_page, task_id, q and favorite", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      okJson([], { page: 2, per_page: 12, total: 50, total_pages: 5 }),
    );
    await fetchGenerations({
      page: 2,
      perPage: 12,
      taskId: "qualita",
      query: "fisherman",
      favorite: true,
    });
    expect(lastCall().url).toBe(
      "/api/v1/generations?page=2&per_page=12&task_id=qualita&q=fisherman&favorite=true",
    );
  });

  it("fetchGenerations: serializes favorite=false explicitly (not omitted)", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      okJson([], { page: 1, per_page: 24, total: 0, total_pages: 0 }),
    );
    await fetchGenerations({ favorite: false });
    expect(lastCall().url).toBe("/api/v1/generations?favorite=false");
  });

  it("fetchGenerations: omits page/per_page/task_id/q when falsy or absent", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      okJson([], { page: 1, per_page: 24, total: 0, total_pages: 0 }),
    );
    await fetchGenerations({ page: 0, perPage: 0, taskId: "", query: "" });
    expect(lastCall().url).toBe("/api/v1/generations");
  });

  it("fetchGeneration: GETs /api/v1/generations/{id} and returns the full record", async () => {
    const generation = {
      id: "gen-1",
      job_id: "job-1",
      task_id: "qualita",
      model_ids: ["juggernaut-xl-v8"],
      prompt: "portrait",
      negative_prompt: "",
      prompt_final: "portrait",
      params: {},
      seed: 42,
      width: 1152,
      height: 896,
      parent_id: null,
      duration_ms: 5000,
      favorite: false,
      created_at: "2026-10-01T10:00:00Z",
      updated_at: "2026-10-01T10:00:00Z",
    };
    global.fetch = vi.fn().mockResolvedValue(okJson(generation));
    const result = await fetchGeneration("gen-1");
    expect(lastCall().url).toBe("/api/v1/generations/gen-1");
    expect(result).toEqual(generation);
  });

  it("setFavorite: PATCHes /api/v1/generations/{id} with {favorite}", async () => {
    global.fetch = vi.fn().mockResolvedValue(okJson({ id: "gen-1", favorite: true }));
    await setFavorite("gen-1", true);
    expect(lastCall().url).toBe("/api/v1/generations/gen-1");
    expect(lastCall().options.method).toBe("PATCH");
    expect(JSON.parse(lastCall().options.body as string)).toEqual({ favorite: true });
  });

  it("setFavorite: can also unset the favorite flag", async () => {
    global.fetch = vi.fn().mockResolvedValue(okJson({ id: "gen-1", favorite: false }));
    await setFavorite("gen-1", false);
    expect(JSON.parse(lastCall().options.body as string)).toEqual({ favorite: false });
  });

  it("deleteGeneration: DELETEs /api/v1/generations/{id}", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 204, json: vi.fn() } as unknown as Response);
    const result = await deleteGeneration("gen-1");
    expect(lastCall().url).toBe("/api/v1/generations/gen-1");
    expect(lastCall().options.method).toBe("DELETE");
    expect(result).toBeUndefined();
  });

  it("restoreGeneration: POSTs /api/v1/generations/{id}/restore", async () => {
    const generation: Generation = {
      id: "gen-1",
      job_id: "job-1",
      task_id: "qualita",
      model_ids: ["juggernaut-xl-v8"],
      prompt: "portrait",
      negative_prompt: "",
      prompt_final: "portrait",
      params: {},
      seed: 42,
      width: 1152,
      height: 896,
      parent_id: null,
      duration_ms: 5000,
      favorite: false,
      created_at: "2026-10-01T10:00:00Z",
      updated_at: "2026-10-01T10:00:00Z",
    };
    global.fetch = vi.fn().mockResolvedValue(okJson(generation));
    const result = await restoreGeneration("gen-1");
    expect(lastCall().url).toBe("/api/v1/generations/gen-1/restore");
    expect(lastCall().options.method).toBe("POST");
    expect(lastCall().options.body).toBeUndefined();
    expect(result).toEqual(generation);
  });

  it("emptyTrash: POSTs /api/v1/generations/trash/empty", async () => {
    global.fetch = vi.fn().mockResolvedValue(okJson({ purged: 3, freed_bytes: 102400 }));
    const result = await emptyTrash();
    expect(lastCall().url).toBe("/api/v1/generations/trash/empty");
    expect(lastCall().options.method).toBe("POST");
    expect(lastCall().options.body).toBeUndefined();
    expect(result).toEqual({ purged: 3, freed_bytes: 102400 });
  });

  it("rerunGeneration: POSTs new_seed and an Idempotency-Key", async () => {
    global.fetch = vi.fn().mockResolvedValue(okJson({ job_id: "job-9" }));
    const result = await rerunGeneration("gen-1", true);
    expect(lastCall().url).toBe("/api/v1/generations/gen-1/rerun");
    expect(lastCall().options.method).toBe("POST");
    expect(JSON.parse(lastCall().options.body as string)).toEqual({ new_seed: true });
    const headers = lastCall().options.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(result).toEqual({ job_id: "job-9" });
  });

  it("rerunGeneration: forwards new_seed=false unchanged", async () => {
    global.fetch = vi.fn().mockResolvedValue(okJson({ job_id: "job-10" }));
    await rerunGeneration("gen-1", false);
    expect(JSON.parse(lastCall().options.body as string)).toEqual({ new_seed: false });
  });

  it("imageUrl / thumbnailUrl: build the file URLs without calling fetch", () => {
    global.fetch = vi.fn();
    expect(imageUrl("gen-1")).toBe("/api/v1/generations/gen-1/image");
    expect(thumbnailUrl("gen-1")).toBe("/api/v1/generations/gen-1/thumbnail");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("propagates a validation error from the backend envelope (SPEC.md § 7.5)", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      errorJson(422, "VALIDATION_ERROR", "Il campo prompt è obbligatorio."),
    );
    const error = await createJob({
      task_id: "qualita",
      prompt: "",
      params: { seed: null, batch: 1 },
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Il campo prompt è obbligatorio.",
      status: 422,
    });
  });

  it("propagates a not-found error from fetchGeneration", async () => {
    global.fetch = vi.fn().mockResolvedValue(errorJson(404, "NOT_FOUND", "Generazione non trovata."));
    const error = await fetchGeneration("missing-id").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "NOT_FOUND", status: 404 });
  });

  it("fetchGenerations propagates a backend error through the paginated envelope path", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      errorJson(503, "ENGINE_UNAVAILABLE", 'Il motore che crea le immagini non risponde: dal menu delle applicazioni scegli "Chiudi Image Generator" e poi riaprilo, oppure avvialo con scripts/start.sh.'),
    );
    const error = await fetchGenerations({}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: "ENGINE_UNAVAILABLE", status: 503 });
  });

  it("propagates a network failure (backend down) as an ApiError", async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    const error = await fetchHealth().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("NETWORK_ERROR");
  });
});
