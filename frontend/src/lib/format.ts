/** Formats a VRAM amount given in MB as a GB string with one decimal, e.g. "7.2 GB". */
export function formatMbAsGb(mb: number): string {
  return `${(mb / 1024).toFixed(1)} GB`;
}
