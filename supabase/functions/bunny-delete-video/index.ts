import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";

const corsHeaders = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": "*",
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

async function readBunnyError(response: Response) {
  const body = await response.json().catch(() => null);
  if (body && typeof body.message === "string") return body.message;
  if (body && typeof body.Message === "string") return body.Message;
  return await response.text().catch(() => "bunny_request_failed");
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

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "missing_supabase_server_config" }, 500);
  }
  if (!libraryId || !apiKey) {
    return jsonResponse({ error: "missing_bunny_stream_config" }, 500);
  }

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return jsonResponse({ error: "missing_authorization" }, 401);

  const body = await req.json().catch(() => ({}));
  const storeId = clean(body.store_id);
  const videoId = clean(body.video_id);

  if (!storeId) return jsonResponse({ error: "missing_store_id" }, 400);
  if (!videoId) return jsonResponse({ error: "missing_video_id" }, 400);

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

  const { data: video, error: videoError } = await supabase
    .from("videos")
    .select("id, provider, provider_video_id")
    .eq("id", videoId)
    .eq("store_id", storeId)
    .maybeSingle();
  if (videoError) return jsonResponse({ error: videoError.message }, 500);
  if (!video) return jsonResponse({ error: "video_not_found" }, 404);

  const providerVideoId = clean(video.provider_video_id);
  if (video.provider === "bunny" && providerVideoId) {
    const response = await fetch(
      `https://video.bunnycdn.com/library/${libraryId}/videos/${providerVideoId}`,
      {
        headers: { AccessKey: apiKey },
        method: "DELETE",
      },
    );
    if (!response.ok && response.status !== 404) {
      return jsonResponse({ error: await readBunnyError(response) }, 502);
    }
  }

  await supabase.from("video_products").delete().eq("video_id", videoId);

  const { error: deleteError } = await supabase
    .from("videos")
    .delete()
    .eq("id", videoId)
    .eq("store_id", storeId);

  if (deleteError) {
    const { error: updateError } = await supabase
      .from("videos")
      .update({ processing_status: "archived", status: "deleted" })
      .eq("id", videoId)
      .eq("store_id", storeId);
    if (updateError) return jsonResponse({ error: updateError.message }, 500);
  }

  return jsonResponse({ ok: true });
});
