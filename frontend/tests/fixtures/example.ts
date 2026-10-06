import type { ExampleItem, ExamplesResponse } from "@/api/types";

export function buildExampleItem(overrides: Partial<ExampleItem> = {}): ExampleItem {
  return {
    id: "ex-1",
    task_id: "qualita",
    prompt: "portrait of an old fisherman, golden hour",
    seed: 42,
    aspect_ratio: "1152*896",
    width: 1152,
    height: 896,
    image_url: "/api/v1/examples/ex-1/image",
    ...overrides,
  };
}

export function buildExamplesResponse(overrides: Partial<ExamplesResponse> = {}): ExamplesResponse {
  return {
    first_use: true,
    examples: [buildExampleItem()],
    ...overrides,
  };
}
