import type { TableInsert, TableRow, TableUpdate } from "./database";

export type LuppVideo = TableRow<"videos">;
export type CreateVideoPayload = TableInsert<"videos">;
export type UpdateVideoPayload = TableUpdate<"videos">;

export interface UploadedVideo {
  url: string;
  path: string;
  provider: "supabase" | "bunny" | "cloudflare";
}

export interface VideoUploadProgress {
  bytesTotal?: number;
  bytesUploaded?: number;
  phase: "preparing" | "uploading" | "processing" | "complete";
  progress: number;
}

export interface VideoStorageProvider {
  uploadVideo(file: File, storeId: string, onProgress?: (progress: VideoUploadProgress) => void): Promise<UploadedVideo>;
  uploadThumbnail?(file: File, storeId: string): Promise<UploadedVideo>;
  deleteVideo(path: string): Promise<void>;
}
