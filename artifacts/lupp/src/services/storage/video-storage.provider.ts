import { ACCEPTED_VIDEO_TYPES, MAX_VIDEO_UPLOAD_BYTES } from "@/lib/constants";
import { requireSupabase } from "@/lib/supabase";
import type { UploadedVideo, VideoStorageProvider } from "@/types/video";

function extensionFromFile(file: File) {
  return file.name.split(".").pop()?.toLowerCase() || "mp4";
}

export class SupabaseVideoProvider implements VideoStorageProvider {
  async uploadVideo(file: File, storeId: string, onProgress?: (progress: number) => void): Promise<UploadedVideo> {
    if (!ACCEPTED_VIDEO_TYPES.includes(file.type)) {
      throw new Error("Formato inválido. Envie um vídeo MP4, MOV ou WebM.");
    }

    if (file.size > MAX_VIDEO_UPLOAD_BYTES) {
      throw new Error("O vídeo excede o limite inicial de 200MB.");
    }

    const supabase = requireSupabase();
    const path = `${storeId}/${crypto.randomUUID()}.${extensionFromFile(file)}`;
    onProgress?.(10);

    const { error } = await supabase.storage.from("videos").upload(path, file, {
      cacheControl: "31536000",
      upsert: false,
      contentType: file.type,
    });
    if (error) throw error;

    onProgress?.(100);
    const { data } = supabase.storage.from("videos").getPublicUrl(path);
    return { url: data.publicUrl, path, provider: "supabase" };
  }

  async uploadThumbnail(file: File, storeId: string): Promise<UploadedVideo> {
    const supabase = requireSupabase();
    const path = `${storeId}/${crypto.randomUUID()}.${extensionFromFile(file)}`;
    const { error } = await supabase.storage.from("thumbnails").upload(path, file, {
      cacheControl: "31536000",
      upsert: false,
      contentType: file.type,
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
