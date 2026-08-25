import { promises as fs } from "fs";
import path from "path";
import type { StorageProvider } from "../types";

const BASE_DIR = process.env.STORAGE_LOCAL_PATH ?? "./storage/audio";

/**
 * Local filesystem implementation. Used for development and for
 * self-hosted deployments. For Cloudflare deployment, swap
 * STORAGE_PROVIDER=r2 to use storage/r2.ts instead — nothing else
 * in the app needs to change since all access goes through
 * StorageProvider.
 */
export class LocalStorageProvider implements StorageProvider {
  readonly name = "local";

  private resolve(key: string): string {
    const resolvedBase = path.resolve(BASE_DIR);
    const resolvedPath = path.resolve(BASE_DIR, key);
    if (!resolvedPath.startsWith(resolvedBase)) {
      throw new Error(`Security violation: Invalid storage key path "${key}"`);
    }
    return resolvedPath;
  }

  async put(key: string, data: Buffer | Uint8Array, _contentType: string) {
    const filePath = this.resolve(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, data);
    return { key };
  }

  async getSignedUrl(key: string, _expiresInSec = 3600): Promise<string> {
    // Local dev doesn't need real signing; audio is served through an
    // authenticated API route (/api/recordings/[id]/audio) which checks
    // the session server-side before streaming the file.
    return `/api/recordings/stream?key=${encodeURIComponent(key)}`;
  }

  async delete(key: string): Promise<void> {
    const filePath = this.resolve(key);
    await fs.rm(filePath, { force: true });
  }
}
