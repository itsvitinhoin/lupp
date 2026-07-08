import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";

const corsHeaders = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, content-length, x-store-id, x-file-name, x-video-title, x-file-size, x-upload-attempt",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

const acceptedContentTypes = new Set([
  "application/octet-stream",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
]);

const planVideoLimits: Record<string, number> = {
  start: 100,
  growth: 300,
  pro: 1000,
  scale: 5000,
};

type BunnyVideo = {
  encodeProgress?: number;
  guid?: string;
  length?: number;
  status?: number;
  storageSize?: number;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

function clean(value: unknown) {
  return String(value || "").trim();
}

function cleanHeader(value: unknown) {
  const text = clean(value);
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

function bunnyStatus(value: unknown) {
  const status = Number(value);
  if (status === 4 || status === 8) return "ready";
  if (status === 5 || status === 6) return "failed";
  return "processing";
}

function playbackUrl(cdnHostname: string, videoId: string) {
  return `https://${cdnHostname.replace(/^https?:\/\//i, "").replace(/\/$/, "")}/${videoId}/playlist.m3u8`;
}

function thumbnailUrl(cdnHostname: string, videoId: string) {
  return `https://${cdnHostname.replace(/^https?:\/\//i, "").replace(/\/$/, "")}/${videoId}/thumbnail.jpg`;
}

async function sha256Hex(value: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function uploadMetadata(video: BunnyVideo, cdnHostname: string, videoId: string, fallbackFileSize = 0) {
  const finalPlaybackUrl = playbackUrl(cdnHostname, videoId);

  return {
    duration_seconds: video.length || null,
    file_size: video.storageSize || fallbackFileSize || null,
    path: videoId,
    playback_url: finalPlaybackUrl,
    processing_status: bunnyStatus(video.status),
    provider: "bunny",
    provider_video_id: videoId,
    status: bunnyStatus(video.status),
    thumbnail_url: thumbnailUrl(cdnHostname, videoId),
    url: finalPlaybackUrl,
    video_url: finalPlaybackUrl,
  };
}

async function readBunnyError(response: Response) {
  const body = await response.json().catch(() => null);
  if (body && typeof body.message === "string") return body.message;
  if (body && typeof body.Message === "string") return body.Message;
  return await response.text().catch(() => "bunny_request_failed");
}

async function bunnyRequest<T>({
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
  const response = await fetch(
    `https://video.bunnycdn.com/library/${libraryId}${path}`,
    {
      body,
      headers: {
        AccessKey: apiKey,
        "Content-Type": contentType,
      },
      method,
    },
  );

  if (!response.ok) {
    throw new Error(await readBunnyError(response));
  }

  return (await response.json().catch(() => ({}))) as T;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const libraryId = clean(Deno.env.get("BUNNY_STREAM_LIBRARY_ID"));
  const apiKey = clean(Deno.env.get("BUNNY_STREAM_API_KEY"));
  const cdnHostname = clean(Deno.env.get("BUNNY_STREAM_CDN_HOSTNAME"));

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "missing_supabase_server_config" }, 500);
  }

  if (!libraryId || !apiKey || !cdnHostname) {
    return jsonResponse({ error: "missing_bunny_stream_config" }, 500);
  }

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return jsonResponse({ error: "missing_authorization" }, 401);

  const storeId = clean(req.headers.get("x-store-id"));
  const fileName = cleanHeader(req.headers.get("x-file-name")) || "video";
  const title = cleanHeader(req.headers.get("x-video-title")) || fileName;
  const contentType = clean(req.headers.get("content-type")).split(";")[0];
  const fileSize = Number(req.headers.get("content-length") || req.headers.get("x-file-size") || 0);

  if (!storeId) return jsonResponse({ error: "missing_store_id" }, 400);
  if (!req.body) return jsonResponse({ error: "missing_video_body" }, 400);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(jwt);

  if (userError || !user) {
    return jsonResponse({ error: "invalid_user" }, 401);
  }

  const { data: member } = await supabase
    .from("store_members")
    .select("id")
    .eq("store_id", storeId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member) return jsonResponse({ error: "store_access_denied" }, 403);

  const { data: store } = await supabase
    .from("stores")
    .select("id, plan_id")
    .eq("id", storeId)
    .maybeSingle();

  if (!store) return jsonResponse({ error: "store_not_found" }, 404);

  const planId = clean(store.plan_id) || "start";
  const videoLimit = planVideoLimits[planId] ?? planVideoLimits.start;
  const { count, error: countError } = await supabase
    .from("videos")
    .select("id", { count: "exact", head: true })
    .eq("store_id", storeId)
    .in("status", ["active", "draft", "paused"]);

  if (countError) return jsonResponse({ error: countError.message }, 500);
  if ((count ?? 0) >= videoLimit) {
    return jsonResponse({ error: "plan_video_limit_reached" }, 402);
  }

  if (contentType === "application/json") {
    const payload = await req.json().catch(() => null) as Record<string, unknown> | null;
    const action = clean(payload?.action);

    try {
      if (action === "create") {
        const uploadFileName = clean(payload?.file_name) || fileName;
        const uploadTitle = clean(payload?.title) || uploadFileName.replace(/\.[^.]+$/, "") || title;
        const uploadContentType = clean(payload?.file_type);
        const uploadFileSize = Number(payload?.file_size || 0);

        if (!acceptedContentTypes.has(uploadContentType)) {
          return jsonResponse({ error: "invalid_video_content_type" }, 400);
        }

        if (!Number.isFinite(uploadFileSize) || uploadFileSize <= 0) {
          return jsonResponse({ error: "missing_file_size" }, 400);
        }

        const created = await bunnyRequest<BunnyVideo>({
          apiKey,
          body: JSON.stringify({ thumbnailTime: 1000, title: uploadTitle }),
          libraryId,
          method: "POST",
          path: "/videos",
        });
        const videoId = clean(created.guid);
        if (!videoId) return jsonResponse({ error: "missing_bunny_video_id" }, 502);

        const authorizationExpire = Math.floor(Date.now() / 1000) + 60 * 60 * 4;
        const authorizationSignature = await sha256Hex(`${libraryId}${apiKey}${authorizationExpire}${videoId}`);

        return jsonResponse({
          authorization_expire: authorizationExpire,
          authorization_signature: authorizationSignature,
          cdn_hostname: cdnHostname,
          library_id: libraryId,
          path: videoId,
          playback_url: playbackUrl(cdnHostname, videoId),
          provider: "bunny",
          provider_video_id: videoId,
          thumbnail_url: thumbnailUrl(cdnHostname, videoId),
          tus_endpoint: "https://video.bunnycdn.com/tusupload",
          url: playbackUrl(cdnHostname, videoId),
        });
      }

      if (action === "metadata") {
        const videoId = clean(payload?.provider_video_id || payload?.path);
        if (!videoId) return jsonResponse({ error: "missing_bunny_video_id" }, 400);

        const video = await bunnyRequest<BunnyVideo>({
          apiKey,
          libraryId,
          method: "GET",
          path: `/videos/${videoId}`,
        });

        return jsonResponse(uploadMetadata(video, cdnHostname, videoId, Number(payload?.file_size || 0)));
      }

      if (action === "delete") {
        const videoId = clean(payload?.provider_video_id || payload?.path);
        if (!videoId) return jsonResponse({ error: "missing_bunny_video_id" }, 400);

        await bunnyRequest<Record<string, unknown>>({
          apiKey,
          libraryId,
          method: "DELETE",
          path: `/videos/${videoId}`,
        });

        return jsonResponse({ ok: true });
      }
    } catch (error) {
      return jsonResponse(
        {
          error: error instanceof Error ? error.message : "bunny_upload_failed",
        },
        502,
      );
    }

    return jsonResponse({ error: "invalid_bunny_upload_action" }, 400);
  }

  if (!acceptedContentTypes.has(contentType)) {
    return jsonResponse({ error: "invalid_video_content_type" }, 400);
  }
  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return jsonResponse({ error: "missing_file_size" }, 400);
  }

  let videoId = "";
  try {
    const created = await bunnyRequest<BunnyVideo>({
      apiKey,
      body: JSON.stringify({ thumbnailTime: 1000, title }),
      libraryId,
      method: "POST",
      path: "/videos",
    });
    videoId = clean(created.guid);
    if (!videoId) return jsonResponse({ error: "missing_bunny_video_id" }, 502);

    await bunnyRequest<Record<string, unknown>>({
      apiKey,
      body: req.body,
      contentType: "application/octet-stream",
      libraryId,
      method: "PUT",
      path: `/videos/${videoId}`,
    });

    const video = await bunnyRequest<BunnyVideo>({
      apiKey,
      libraryId,
      method: "GET",
      path: `/videos/${videoId}`,
    });

    return jsonResponse(uploadMetadata(video, cdnHostname, videoId, fileSize));
  } catch (error) {
    if (videoId) {
      await bunnyRequest<Record<string, unknown>>({
        apiKey,
        libraryId,
        method: "DELETE",
        path: `/videos/${videoId}`,
      }).catch(() => null);
    }

    return jsonResponse(
      {
        error: error instanceof Error ? error.message : "bunny_upload_failed",
      },
      502,
    );
  }
});
