const ONE_DECIMAL = new Intl.NumberFormat("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const WHOLE = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0 });
const MB_PER_GB = 1024;
const KB_PER_GB = 1024 * 1024;
const BYTES_PER_GB = 1024 ** 3;
const SMALL_GB = 0.1;
const TINY_GB = 0.001;

/** Formats a size given in bytes (e.g. trash freed_bytes, A4) the same way as formatSizeGb. */
export function formatBytes(bytes: number): string {
  return formatSizeGb(bytes / BYTES_PER_GB);
}

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

const RELATIVE = new Intl.RelativeTimeFormat("it-IT", { numeric: "auto" });
const SHORT_DATE = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", year: "numeric" });
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const RELATIVE_DAYS_LIMIT = 7;

/** "adesso", "5 minuti fa", "3 ore fa", "ieri", "3 giorni fa", then the date (G1). */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const elapsed = now.getTime() - date.getTime();
  if (elapsed < MINUTE_MS) return "adesso";
  if (elapsed < HOUR_MS) return RELATIVE.format(-Math.floor(elapsed / MINUTE_MS), "minute");
  if (elapsed < DAY_MS) return RELATIVE.format(-Math.floor(elapsed / HOUR_MS), "hour");
  const days = Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS);
  if (days < RELATIVE_DAYS_LIMIT) return RELATIVE.format(-days, "day");
  return SHORT_DATE.format(date);
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
