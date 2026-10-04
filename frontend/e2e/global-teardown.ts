import { rm } from "node:fs/promises";

export default async function globalTeardown(): Promise<void> {
  const dataDir = process.env.E2E_DATA_DIR;
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
}
