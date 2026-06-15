import * as tus from "tus-js-client";
import { extensionFromName, getVideoContentType, isAcceptedVideoFile, MAX_VIDEO_UPLOAD_BYTES, MAX_VIDEO_UPLOAD_MB } from "@/lib/constants";
import { env } from "@/lib/env";
import { requireSupabase } from "@/lib/supabase";
import type { UploadedVideo, VideoStorageProvider, VideoUploadProgress } from "@/types/video";

function extensionFromFile(file: File) {
  return extensionFromName(file.name) || "mp4";
}

function getResumableUploadEndpoint() {
  try {
    const url = new URL(env.supabaseUrl);
    const projectRef = url.hostname.endsWith(".supabase.co") ? url.hostname.split(".")[0] : "";

    if (projectRef) {
      return `${url.protocol}//${projectRef}.storage.supabase.co/storage/v1/upload/resumable`;
    }

    return `${url.origin}/storage/v1/upload/resumable`;
  } catch {
    return `${env.supabaseUrl.replace(/\/$/, "")}/storage/v1/upload/resumable`;
  }
}

function formatTusError(error: Error | tus.DetailedError) {
  if (error instanceof tus.DetailedError && error.originalResponse) {
    const status = error.originalResponse.getStatus();
    const body = error.originalResponse.getBody();
    if (status === 413) {
      return "O Supabase recusou o arquivo pelo limite global de Storage. Projetos Free aceitam no máximo 50MB; para vídeos maiores, suba para Pro e ajuste Storage > Settings > Global file size limit.";
    }

    return `Falha no upload resumível (${status}). ${body || error.message}`;
  }

  return error.message;
}

export class SupabaseVideoProvider implements VideoStorageProvider {
  async uploadVideo(file: File, storeId: string, onProgress?: (progress: VideoUploadProgress) => void): Promise<UploadedVideo> {
    if (!isAcceptedVideoFile(file)) {
      throw new Error("Formato inválido. Envie um vídeo MP4, MOV ou WebM.");
    }

    if (file.size > MAX_VIDEO_UPLOAD_BYTES) {
      throw new Error(`O vídeo excede o limite configurado de ${MAX_VIDEO_UPLOAD_MB}MB.`);
    }

    const supabase = requireSupabase();
    const path = `${storeId}/${crypto.randomUUID()}.${extensionFromFile(file)}`;
    const contentType = getVideoContentType(file);
    const { data } = await supabase.auth.getSession();

    if (!data.session?.access_token) {
      throw new Error("Sessão expirada. Faça login novamente para enviar vídeos.");
    }

    onProgress?.({ bytesTotal: file.size, bytesUploaded: 0, phase: "preparing", progress: 1 });

    await new Promise<void>((resolve, reject) => {
      const upload = new tus.Upload(file, {
        endpoint: getResumableUploadEndpoint(),
        retryDelays: [0, 3000, 5000, 10000, 20000],
        headers: {
          authorization: `Bearer ${data.session.access_token}`,
          apikey: env.supabaseAnonKey,
        },
        metadata: {
          bucketName: "videos",
          objectName: path,
          contentType,
          cacheControl: "31536000",
        },
        chunkSize: 6 * 1024 * 1024,
        uploadDataDuringCreation: false,
        removeFingerprintOnSuccess: true,
        onProgress: (bytesUploaded, bytesTotal) => {
          const nextProgress = bytesTotal > 0 ? Math.min(99, Math.round((bytesUploaded / bytesTotal) * 100)) : 1;
          onProgress?.({ bytesTotal, bytesUploaded, phase: "uploading", progress: nextProgress });
        },
        onError: (error) => {
          reject(new Error(formatTusError(error)));
        },
        onSuccess: () => resolve(),
      });

      upload
        .findPreviousUploads()
        .then((previousUploads) => {
          if (previousUploads.length > 0) {
            upload.resumeFromPreviousUpload(previousUploads[0]);
          }

          upload.start();
        })
        .catch((error: Error) => reject(error));
    });

    onProgress?.({ bytesTotal: file.size, bytesUploaded: file.size, phase: "complete", progress: 100 });
    const { data: publicUrlData } = supabase.storage.from("videos").getPublicUrl(path);
    return { url: publicUrlData.publicUrl, path, provider: "supabase" };
  }

  async uploadThumbnail(file: File, storeId: string): Promise<UploadedVideo> {
    const supabase = requireSupabase();
    const path = `${storeId}/${crypto.randomUUID()}.${extensionFromFile(file)}`;
    const { error } = await supabase.storage.from("thumbnails").upload(path, file, {
      cacheControl: "31536000",
      upsert: false,
      contentType: file.type || "image/jpeg",
    });
    if (error) throw error;

    const { data } = supabase.storage.from("thumbnails").getPublicUrl(path);
    return { url: data.publicUrl, path, provider: "supabase" };
  }

  async deleteVideo(path: string) {
    const { error } = await requireSupabase().storage.from("videos").remove([path]);
    if (error) throw error;
  }
}

export class BunnyStreamProvider implements VideoStorageProvider {
  async uploadVideo(): Promise<UploadedVideo> {
    throw new Error("Bunny Stream ainda não está conectado. Configure as credenciais no backend antes de usar.");
  }

  async deleteVideo(): Promise<void> {
    throw new Error("Bunny Stream ainda não está conectado.");
  }
}

export class CloudflareStreamProvider implements VideoStorageProvider {
  async uploadVideo(): Promise<UploadedVideo> {
    throw new Error("Cloudflare Stream ainda não está conectado. Configure as credenciais no backend antes de usar.");
  }

  async deleteVideo(): Promise<void> {
    throw new Error("Cloudflare Stream ainda não está conectado.");
  }
}

export const videoStorageProvider = new SupabaseVideoProvider();
