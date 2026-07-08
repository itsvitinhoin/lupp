import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";

const corsHeaders = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
};

type BunnyVideo = {
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

async function readBunnyError(response: Response) {
  const body = await response.json().catch(() => null);
  if (body && typeof body.message === "string") return body.message;
  if (body && typeof body.Message === "string") return body.Message;
  return await response.text().catch(() => "bunny_request_failed");
}

async function getBunnyVideo({
  apiKey,
  libraryId,
  videoId,
}: {
  apiKey: string;
  libraryId: string;
  videoId: string;
}) {
  const response = await fetch(
    `https://video.bunnycdn.com/library/${libraryId}/videos/${videoId}`,
    {
      headers: { AccessKey: apiKey },
      method: "GET",
    },
  );
  if (!response.ok) throw new Error(await readBunnyError(response));
  return (await response.json()) as BunnyVideo;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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

  const body = await req.json().catch(() => ({}));
  const storeId = clean(body.store_id);
  const videoId = clean(body.video_id);
  const providerVideoId = clean(body.provider_video_id);

  if (!storeId) return jsonResponse({ error: "missing_store_id" }, 400);
  if (!videoId && !providerVideoId) {
    return jsonResponse({ error: "missing_video_id" }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(jwt);
  if (userError || !user) return jsonResponse({ error: "invalid_user" }, 401);

  const { data: member } = await supabase
    .from("store_members")
    .select("id")
    .eq("store_id", storeId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member) return jsonResponse({ error: "store_access_denied" }, 403);

  let resolvedProviderVideoId = providerVideoId;
  let databaseVideoId = videoId;
  if (videoId) {
    const { data: video, error: videoError } = await supabase
      .from("videos")
      .select("id, provider_video_id")
      .eq("id", videoId)
      .eq("store_id", storeId)
      .maybeSingle();
    if (videoError) return jsonResponse({ error: videoError.message }, 500);
    if (!video) return jsonResponse({ error: "video_not_found" }, 404);
    databaseVideoId = video.id;
    resolvedProviderVideoId = clean(video.provider_video_id);
  }

  if (!resolvedProviderVideoId) {
    return jsonResponse({ error: "missing_provider_video_id" }, 400);
  }

  try {
    const video = await getBunnyVideo({
      apiKey,
      libraryId,
      videoId: resolvedProviderVideoId,
    });
    const processingStatus = bunnyStatus(video.status);
    const finalPlaybackUrl = playbackUrl(cdnHostname, resolvedProviderVideoId);
    const payload = {
      duration_seconds: video.length || null,
      file_size: video.storageSize || null,
      playback_url: finalPlaybackUrl,
      processing_status: processingStatus,
      provider_video_id: resolvedProviderVideoId,
      thumbnail_url: thumbnailUrl(cdnHostname, resolvedProviderVideoId),
      video_url: finalPlaybackUrl,
    };

    if (databaseVideoId) {
      const { error: updateError } = await supabase
        .from("videos")
        .update(payload)
        .eq("id", databaseVideoId)
        .eq("store_id", storeId);
      if (updateError) return jsonResponse({ error: updateError.message }, 500);
    }

    return jsonResponse(payload);
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : "bunny_status_failed",
      },
      502,
    );
  }
});
