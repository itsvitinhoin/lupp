import { env } from "@/env";

/**
 * Bunny Storage zone client (image assets: store logos, video thumbnails).
 * Distinct from Bunny Stream (src/lib/bunny.ts), which hosts the videos.
 * Integration is off when the env vars are unset — callers check
 * isBunnyStorageConfigured() and answer 500 missing_bunny_storage_config.
 */

const ALLOWED_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "svg", "gif"]);

export function isBunnyStorageConfigured() {
  return Boolean(
    env.BUNNY_STORAGE_ZONE_NAME?.trim() &&
      env.BUNNY_STORAGE_API_KEY?.trim() &&
      env.BUNNY_STORAGE_CDN_HOSTNAME?.trim(),
  );
}

/** Whitelisted image extension from a client-provided file name ("" if none). */
export function imageExtensionFromFileName(fileName: string) {
  const extension = fileName.split(".").pop()?.trim().toLowerCase() ?? "";
  return ALLOWED_IMAGE_EXTENSIONS.has(extension) ? extension : "";
}

function cdnBase() {
  const hostname = (env.BUNNY_STORAGE_CDN_HOSTNAME ?? "").trim().replace(/\/+$/, "");
  return hostname.startsWith("http") ? hostname : `https://${hostname}`;
}

export function bunnyStoragePublicUrl(path: string) {
  return `${cdnBase()}/${path}`;
}

/**
 * Extracts the storage path from a public CDN URL. Returns "" for URLs on any
 * other host (e.g. legacy Supabase-hosted assets) so cleanup callers skip them.
 */
export function bunnyStoragePathFromPublicUrl(publicUrl?: string | null) {
  if (!publicUrl || !isBunnyStorageConfigured()) return "";
  try {
    const url = new URL(publicUrl);
    const cdn = new URL(cdnBase());
    if (url.hostname !== cdn.hostname) return "";
    return decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  } catch {
    return "";
  }
}

function storageObjectUrl(path: string) {
  const hostname = env.BUNNY_STORAGE_HOSTNAME.trim().replace(/\/+$/, "");
  return `https://${hostname}/${env.BUNNY_STORAGE_ZONE_NAME}/${path}`;
}

async function readBunnyStorageError(response: Response) {
  const text = await response.text().catch(() => "");
  return `Bunny Storage error ${response.status}: ${text.slice(0, 300)}`;
}

export async function uploadToBunnyStorage(params: {
  path: string;
  body: Buffer;
  contentType: string;
}) {
  const response = await fetch(storageObjectUrl(params.path), {
    method: "PUT",
    headers: {
      AccessKey: env.BUNNY_STORAGE_API_KEY ?? "",
      "Content-Type": params.contentType || "application/octet-stream",
    },
    body: new Uint8Array(params.body),
  });

  if (!response.ok) throw new Error(await readBunnyStorageError(response));

  return { path: params.path, url: bunnyStoragePublicUrl(params.path) };
}

/** Deletes an object; a 404 (already gone) is treated as success. */
export async function deleteFromBunnyStorage(path: string) {
  const response = await fetch(storageObjectUrl(path), {
    method: "DELETE",
    headers: { AccessKey: env.BUNNY_STORAGE_API_KEY ?? "" },
  });

  if (!response.ok && response.status !== 404) {
    throw new Error(await readBunnyStorageError(response));
  }
}
