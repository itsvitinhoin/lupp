import { z } from "zod";

/**
 * Whitelisted videos columns the SPA may write (create/update). Everything
 * else (store_id, id, timestamps) is server-controlled.
 */
export const VideoColumnsSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullish(),
  video_url: z.string().nullish(),
  thumbnail_url: z.string().nullish(),
  storage_path: z.string().nullish(),
  provider: z.string().optional(),
  duration_seconds: z.number().int().nullish(),
  aspect_ratio: z.string().optional(),
  status: z.enum(["draft", "active", "paused", "archived"]).optional(),
  cta_label: z.string().optional(),
  is_feed_enabled: z.boolean().optional(),
  is_product_page_enabled: z.boolean().optional(),
  allow_likes: z.boolean().optional(),
  allow_comments: z.boolean().optional(),
  allow_sharing: z.boolean().optional(),
  is_featured: z.boolean().optional(),
  sort_order: z.number().int().optional(),
  product_visibility_scope: z.enum(["product", "variant"]).optional(),
  product_visibility_url: z.string().nullish(),
  provider_video_id: z.string().nullish(),
  playback_url: z.string().nullish(),
  processing_status: z
    .enum(["uploading", "processing", "ready", "failed", "archived"])
    .optional(),
  file_size: z.number().int().nullish(),
});
