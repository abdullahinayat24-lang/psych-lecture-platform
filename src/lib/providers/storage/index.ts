import type { StorageProvider } from "../types";
import { LocalStorageProvider } from "./local";
import { R2StorageProvider } from "./r2";

let cached: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (cached) return cached;
  const kind = process.env.STORAGE_PROVIDER ?? "local";
  switch (kind) {
    case "r2":
      cached = new R2StorageProvider();
      break;
    case "local":
    default:
      cached = new LocalStorageProvider();
  }
  return cached;
}
