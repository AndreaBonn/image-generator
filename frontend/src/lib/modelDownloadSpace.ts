/**
 * True when downloading `neededGb` would leave less than `minFreeGb` free.
 * Mirrors the backend's `has_room` (model_space.py) in GB instead of bytes,
 * for the UI hint shown on ModelDownloadButton before the user clicks
 * Installa. The backend is still the source of truth: a DISK_FULL (507)
 * response is always possible even when this returns false (free space can
 * shrink between the Settings fetch and the click).
 */
export function needsMoreSpace({
  freeGb,
  neededGb,
  minFreeGb,
}: {
  freeGb: number;
  neededGb: number;
  minFreeGb: number;
}): boolean {
  return freeGb - neededGb < minFreeGb;
}
