export interface Style {
  id: string;
  name: string;
  source_file: string;
  /** WEBP 256px, null if the preview has not been generated yet (SPEC.md § O9). */
  preview_url?: string | null;
}
