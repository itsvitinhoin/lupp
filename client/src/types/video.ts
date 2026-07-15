import type { TableInsert, TableRow, TableUpdate } from "./database";

export type LuppVideo = TableRow<"videos">;
export type CreateVideoPayload = TableInsert<"videos">;
export type UpdateVideoPayload = TableUpdate<"videos">;

export interface UploadedVideo {
  duration_seconds?: number | null;
  file_size?: number | null;
  path: string;
  playback_url?: string | null;
  processing_status?: "uploading" | "processing" | "ready" | "failed" | "archived";
  provider: "bunny";
  provider_video_id?: string | null;
  thumbnail_url?: string | null;
  url: string;
}

export interface VideoUploadProgress {
  bytesTotal?: number;
  bytesUploaded?: number;
  phase: "preparing" | "uploading" | "processing" | "complete";
  progress: number;
}

export interface VideoStorageProvider {
  uploadVideo(file: File, storeId: string, onProgress?: (progress: VideoUploadProgress) => void): Promise<UploadedVideo>;
  deleteVideo(path: string): Promise<void>;
}
