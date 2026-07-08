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
      return "O Supabase recusou o arquivo pelo limite global de Storage. Em projetos Pro, ajuste Storage > Settings > Global file size limit para pelo menos o tamanho do vídeo.";
    }

    return `Falha no upload resumível (${status}). ${body || error.message}`;
  }

  return error.message;
}

function formatBunnyTusError(error: Error | tus.DetailedError) {
  if (error instanceof tus.DetailedError && error.originalResponse) {
    const status = error.originalResponse.getStatus();
    const body = error.originalResponse.getBody();
    return `Falha no upload direto para a Bunny (${status}). ${body || error.message}`;
  }

  const message = error.message || "bunny_upload_failed";
  if (/failed to fetch|network|load failed/i.test(message)) {
    return "A conexão caiu durante o envio direto para a Bunny. Tente novamente com uma conexão estável.";
  }

  return message;
}

type BunnyUploadAction = "create" | "metadata" | "delete";

type BunnyUploadSession = {
  authorization_expire: number;
  authorization_signature: string;
  library_id: string;
  path?: string;
  playback_url?: string | null;
  provider_video_id: string;
  thumbnail_url?: string | null;
  tus_endpoint: string;
  url?: string | null;
};

type BunnyUploadMetadata = Record<string, any>;

async function postBunnyUploadAction<T>(
  uploadUrl: string,
  token: string,
  payload: Record<string, unknown> & { action: BunnyUploadAction },
) {
  const response = await fetch(uploadUrl, {
    body: JSON.stringify(payload),
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: env.supabaseAnonKey,
      "content-type": "application/json",
      "x-store-id": String(payload.store_id || ""),
    },
    method: "POST",
  });

  const body = await response.json().catch(() => ({})) as Record<string, any>;
  if (!response.ok) {
    throw new Error(String(body.error || "bunny_upload_failed"));
  }

  return body as T;
}

function bunnyUploadedVideoFromBody(body: BunnyUploadMetadata, file: File): UploadedVideo {
  return {
    duration_seconds: body.duration_seconds ?? null,
    file_size: body.file_size ?? file.size,
    path: String(body.path || body.provider_video_id || ""),
    playback_url: body.playback_url || body.video_url || body.url || null,
    processing_status: body.processing_status || body.status || "processing",
    provider: "bunny",
    provider_video_id: body.provider_video_id || body.path || null,
    thumbnail_url: body.thumbnail_url || null,
    url: String(body.video_url || body.playback_url || body.url || ""),
  };
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
    return {
      path,
      playback_url: publicUrlData.publicUrl,
      processing_status: "ready",
      provider: "supabase",
      url: publicUrlData.publicUrl,
    };
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
    return {
      path,
      playback_url: data.publicUrl,
      processing_status: "ready",
      provider: "supabase",
      url: data.publicUrl,
    };
  }

  async deleteVideo(path: string) {
    const { error } = await requireSupabase().storage.from("videos").remove([path]);
    if (error) throw error;
  }
}

export class BunnyStreamProvider implements VideoStorageProvider {
  async uploadVideo(file: File, storeId: string, onProgress?: (progress: VideoUploadProgress) => void): Promise<UploadedVideo> {
    if (!isAcceptedVideoFile(file)) {
      throw new Error("Formato inválido. Envie um vídeo MP4, MOV ou WebM.");
    }

    if (file.size > MAX_VIDEO_UPLOAD_BYTES) {
      throw new Error(`O vídeo excede o limite configurado de ${MAX_VIDEO_UPLOAD_MB}MB.`);
    }

    const supabase = requireSupabase();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      throw new Error("Sessão expirada. Faça login novamente para enviar vídeos.");
    }

    const uploadUrl = `${env.supabaseUrl.replace(/\/$/, "")}/functions/v1/bunny-upload-video`;
    onProgress?.({ bytesTotal: file.size, bytesUploaded: 0, phase: "preparing", progress: 1 });

    let session: BunnyUploadSession | null = null;

    try {
      session = await postBunnyUploadAction<BunnyUploadSession>(uploadUrl, token, {
        action: "create",
        file_name: file.name,
        file_size: file.size,
        file_type: getVideoContentType(file),
        store_id: storeId,
        title: file.name.replace(/\.[^.]+$/, ""),
      });

      if (!session.provider_video_id || !session.tus_endpoint) {
        throw new Error("A Bunny não retornou uma sessão de upload válida.");
      }
      const uploadSession = session;

      await new Promise<void>((resolve, reject) => {
        const upload = new tus.Upload(file, {
          endpoint: uploadSession.tus_endpoint,
          retryDelays: [0, 3000, 5000, 10000, 20000, 60000],
          headers: {
            AuthorizationExpire: String(uploadSession.authorization_expire),
            AuthorizationSignature: uploadSession.authorization_signature,
            LibraryId: String(uploadSession.library_id),
            VideoId: uploadSession.provider_video_id,
          },
          metadata: {
            filetype: getVideoContentType(file),
            title: file.name.replace(/\.[^.]+$/, ""),
          },
          chunkSize: 8 * 1024 * 1024,
          uploadDataDuringCreation: false,
          removeFingerprintOnSuccess: true,
          onProgress: (bytesUploaded, bytesTotal) => {
            const nextProgress = bytesTotal > 0 ? Math.min(94, Math.round((bytesUploaded / bytesTotal) * 94)) : 1;
            onProgress?.({
              bytesTotal,
              bytesUploaded,
              phase: "uploading",
              progress: Math.max(1, nextProgress),
            });
          },
          onError: (error) => reject(new Error(formatBunnyTusError(error))),
          onSuccess: () => resolve(),
        });

        upload.start();
      });

      onProgress?.({ bytesTotal: file.size, bytesUploaded: file.size, phase: "processing", progress: 96 });

      const body = await postBunnyUploadAction<BunnyUploadMetadata>(uploadUrl, token, {
        action: "metadata",
        file_size: file.size,
        provider_video_id: session.provider_video_id,
        store_id: storeId,
      });

      const uploaded = bunnyUploadedVideoFromBody(body, file);
      if (!uploaded.provider_video_id || !uploaded.url) {
        throw new Error("A Bunny não retornou os metadados do vídeo.");
      }

      onProgress?.({
        bytesTotal: file.size,
        bytesUploaded: file.size,
        phase: uploaded.processing_status === "ready" ? "complete" : "processing",
        progress: uploaded.processing_status === "ready" ? 100 : 96,
      });

      return uploaded;
    } catch (error) {
      if (session?.provider_video_id) {
        await postBunnyUploadAction(uploadUrl, token, {
          action: "delete",
          provider_video_id: session.provider_video_id,
          store_id: storeId,
        }).catch(() => null);

        onProgress?.({ bytesTotal: file.size, bytesUploaded: 0, phase: "preparing", progress: 1 });
        return this.uploadViaEdgeProxy(file, storeId, token, onProgress);
      }

      throw error;
    }
  }

  private async uploadViaEdgeProxy(file: File, storeId: string, token: string, onProgress?: (progress: VideoUploadProgress) => void): Promise<UploadedVideo> {
    const uploadUrl = `${env.supabaseUrl.replace(/\/$/, "")}/functions/v1/bunny-upload-video`;
    const uploaded = await new Promise<UploadedVideo>((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open("POST", uploadUrl);
      request.setRequestHeader("Authorization", `Bearer ${token}`);
      request.setRequestHeader("apikey", env.supabaseAnonKey);
      request.setRequestHeader("content-type", getVideoContentType(file));
      request.setRequestHeader("x-file-size", String(file.size));
      request.setRequestHeader("x-file-name", encodeURIComponent(file.name));
      request.setRequestHeader("x-store-id", storeId);
      request.setRequestHeader("x-video-title", encodeURIComponent(file.name.replace(/\.[^.]+$/, "")));
      request.timeout = Math.min(30 * 60 * 1000, Math.max(10 * 60 * 1000, Math.ceil(file.size / 1024 / 1024) * 7000));

      request.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        const nextProgress = Math.min(92, Math.round((event.loaded / event.total) * 92));
        onProgress?.({
          bytesTotal: event.total,
          bytesUploaded: event.loaded,
          phase: "uploading",
          progress: Math.max(1, nextProgress),
        });
      };

      request.onerror = () => reject(new Error("A conexão caiu durante o envio do vídeo para a Bunny."));
      request.ontimeout = () => reject(new Error("O upload demorou mais que o esperado. Tente novamente com uma conexão mais estável."));
      request.onload = () => {
        let body: Record<string, any> = {};
        try {
          body = request.responseText
            ? JSON.parse(request.responseText) as Record<string, any>
            : {};
        } catch {
          reject(new Error("A Bunny retornou uma resposta inválida para o upload."));
          return;
        }
        if (request.status < 200 || request.status >= 300) {
          reject(new Error(String(body.error || "bunny_upload_failed")));
          return;
        }
        resolve(bunnyUploadedVideoFromBody(body, file));
      };

      request.send(file);
    });

    onProgress?.({
      bytesTotal: file.size,
      bytesUploaded: file.size,
      phase: uploaded.processing_status === "ready" ? "complete" : "processing",
      progress: uploaded.processing_status === "ready" ? 100 : 96,
    });

    if (!uploaded.provider_video_id || !uploaded.url) {
      throw new Error("A Bunny não retornou os metadados do vídeo.");
    }

    return uploaded;
  }

  async deleteVideo(): Promise<void> {
    throw new Error("Remova vídeos Bunny pelo registro da Luup para validar loja e permissões.");
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

export const videoStorageProvider =
  env.videoProvider === "bunny"
    ? new BunnyStreamProvider()
    : env.videoProvider === "cloudflare"
      ? new CloudflareStreamProvider()
      : new SupabaseVideoProvider();
