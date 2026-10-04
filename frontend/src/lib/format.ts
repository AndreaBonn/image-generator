const ONE_DECIMAL = new Intl.NumberFormat("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const WHOLE = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0 });
const MB_PER_GB = 1024;
const KB_PER_GB = 1024 * 1024;
const SMALL_GB = 0.1;
const TINY_GB = 0.001;

/** Formats a VRAM amount given in MB as a GB string with one decimal, e.g. "7,6 GB". */
export function formatMbAsGb(mb: number): string {
  return `${ONE_DECIMAL.format(mb / MB_PER_GB)} GB`;
}

/** Formats a size in GB for people: "28,4 GB", "47 MB", "53 kB". */
export function formatSizeGb(gb: number): string {
  if (gb >= SMALL_GB) return `${ONE_DECIMAL.format(gb)} GB`;
  if (gb >= TINY_GB) return `${WHOLE.format(gb * MB_PER_GB)} MB`;
  return `${WHOLE.format(gb * KB_PER_GB)} kB`;
}

/** ComfyUI reports "cuda:0 <name> : <allocator>"; keep only the card name. */
export function cleanGpuName(raw: string): string {
  return raw.replace(/^cuda:\d+\s+/, "").replace(/\s+:\s+\S+$/, "");
}
