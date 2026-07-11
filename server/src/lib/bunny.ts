import { createHash } from "node:crypto";
import { env } from "@/env";

/**
 * Thin Bunny Stream client (video.bunnycdn.com library endpoints) shared by
 * the routes ported from the bunny-* edge functions. Dumb by design: builds
 * URL + AccessKey header and parses JSON; response massaging stays in the
 * handlers, like the originals.
 */

export const BUNNY_TUS_ENDPOINT = "https://video.bunnycdn.com/tusupload";

export type BunnyVideo = {
  encodeProgress?: number;
  guid?: string;
  length?: number;
  status?: number;
  storageSize?: number;
};

export function getBunnyStreamConfig() {
  return {
    libraryId: (env.BUNNY_STREAM_LIBRARY_ID ?? "").trim(),
    apiKey: (env.BUNNY_STREAM_API_KEY ?? "").trim(),
    cdnHostname: (env.BUNNY_STREAM_CDN_HOSTNAME ?? "").trim(),
  };
}

// Bunny encode status → the processing_status values the SPA expects:
// 4/8 = ready, 5/6 = failed, anything else is still processing.
export function bunnyStatus(value: unknown): "ready" | "failed" | "processing" {
  const status = Number(value);
  if (status === 4 || status === 8) return "ready";
  if (status === 5 || status === 6) return "failed";
  return "processing";
}

function cdnBase(cdnHostname: string) {
  return cdnHostname.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

export function playbackUrl(cdnHostname: string, videoId: string) {
  return `https://${cdnBase(cdnHostname)}/${videoId}/playlist.m3u8`;
}

export function thumbnailUrl(cdnHostname: string, videoId: string) {
  return `https://${cdnBase(cdnHostname)}/${videoId}/thumbnail.jpg`;
}

// Presigned TUS upload signature per Bunny's docs (and the original edge
// function): hex SHA256 of libraryId + apiKey + expire + videoId.
export function tusUploadSignature({
  apiKey,
  expire,
  libraryId,
  videoId,
}: {
  apiKey: string;
  expire: number;
  libraryId: string;
  videoId: string;
}) {
  return createHash("sha256")
    .update(`${libraryId}${apiKey}${expire}${videoId}`)
    .digest("hex");
}

export async function readBunnyError(response: Response) {
  const body = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (body && typeof body.message === "string") return body.message;
  if (body && typeof body.Message === "string") return body.Message;
  return await response.text().catch(() => "bunny_request_failed");
}

export async function bunnyStreamFetch({
  apiKey,
  body,
  contentType,
  libraryId,
  method,
  path,
}: {
  apiKey: string;
  body?: BodyInit | null;
  contentType?: string;
  libraryId: string;
  method: string;
  path: string;
}) {
  return fetch(`https://video.bunnycdn.com/library/${libraryId}${path}`, {
    body,
    headers: {
      AccessKey: apiKey,
      ...(contentType ? { "Content-Type": contentType } : {}),
    },
    method,
  });
}

export async function bunnyRequest<T>({
  apiKey,
  body,
  contentType = "application/json",
  libraryId,
  method,
  path,
}: {
  apiKey: string;
  body?: BodyInit | null;
  contentType?: string;
  libraryId: string;
  method: string;
  path: string;
}) {
  const response = await bunnyStreamFetch({
    apiKey,
    body,
    contentType,
    libraryId,
    method,
    path,
  });

  if (!response.ok) {
    throw new Error(await readBunnyError(response));
  }

  return (await response.json().catch(() => ({}))) as T;
}
