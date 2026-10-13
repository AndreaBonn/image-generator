import type { Task } from "@/api/types";

export function buildTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "qualita",
    label: "Immagine di qualità",
    description: "Generazione SDXL ad alta qualità.",
    duration_hint: null,
    group: "crea",
    family: "sdxl",
    available: true,
    unavailable_reason: null,
    missing_model_ids: [],
    prompt_language: {
      required: "en",
      label: "Scrivi in inglese",
      reason: "Questo modello capisce bene solo l'inglese.",
    },
    prompt_tips: ["Descrivi soggetto, ambiente, luce e stile, in quest'ordine."],
    prompt_examples: ["portrait of an old fisherman, golden hour"],
    supports_styles: true,
    supports_negative: true,
    default_styles: [],
    reference_labels: null,
    min_references: 0,
    max_references: 0,
    defaults: { steps: 30, cfg: 4 },
    limits: { steps: { min: 10, max: 60 }, cfg: { min: 1, max: 12 } },
    aspect_ratios: [
      { value: "1152*896", width: 1152, height: 896, label: "Orizzontale 4:3 · 1152×896", featured: true },
      { value: "1024*1024", width: 1024, height: 1024, label: "Quadrato 1:1 · 1024×1024", featured: true },
    ],
    default_aspect_ratio: "1152*896",
    ...overrides,
  };
}
