import { afterEach, describe, expect, it } from "vitest";
import { clearCreateDraft, loadCreateDraft, saveCreateDraft, type CreateDraft } from "@/lib/createDraft";

const draft: CreateDraft = {
  taskId: "bozza",
  prompt: "a red fox",
  negativePrompt: "blur",
  aspectRatio: "1152*896",
  batch: 2,
  styleIds: ["Fooocus Enhance"],
  seed: 7,
  seedLocked: true,
  steps: 20,
  cfg: 4,
};

describe("createDraft (C16)", () => {
  afterEach(() => window.sessionStorage.clear());

  it("round-trips a saved draft", () => {
    saveCreateDraft(draft);
    expect(loadCreateDraft()).toEqual(draft);
  });

  it("returns null when nothing was saved", () => {
    expect(loadCreateDraft()).toBeNull();
  });

  it("returns null for a corrupted entry instead of throwing", () => {
    window.sessionStorage.setItem("image-generator-create-draft-v1", "{not json");
    expect(loadCreateDraft()).toBeNull();
  });

  it("drops a draft whose fields have the wrong types", () => {
    window.sessionStorage.setItem(
      "image-generator-create-draft-v1",
      JSON.stringify({ ...draft, batch: "tre", styleIds: "Fooocus" }),
    );
    expect(loadCreateDraft()).toBeNull();
  });

  it("forgets the draft once cleared", () => {
    saveCreateDraft(draft);
    clearCreateDraft();
    expect(loadCreateDraft()).toBeNull();
  });
});
