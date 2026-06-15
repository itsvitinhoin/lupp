import type { TableInsert, TableRow, TableUpdate } from "./database";

export type LuppVideo = TableRow<"videos">;
export type CreateVideoPayload = TableInsert<"videos">;
export type UpdateVideoPayload = TableUpdate<"videos">;

export interface UploadedVideo {
  url: string;
  path: string;
  provider: "supabase" | "bunny" | "cloudflare";
}

export interface VideoStorageProvider {
  uploadVideo(file: File, storeId: string, onProgress?: (progress: number) => void): Promise<UploadedVideo>;
  uploadThumbnail?(file: File, storeId: string): Promise<UploadedVideo>;
  deleteVideo(path: string): Promise<void>;
}
