import { prisma } from "../../src/lib/prisma";

/** Video row factory (optionally with product links, first id primary). */
export async function createVideo(overrides: {
  storeId: string;
  title?: string;
  status?: "draft" | "active" | "paused" | "archived" | "deleted";
  processing_status?: "uploading" | "processing" | "ready" | "failed" | "archived";
  is_feed_enabled?: boolean;
  is_product_page_enabled?: boolean;
  is_featured?: boolean;
  sort_order?: number;
  provider?: string;
  provider_video_id?: string | null;
  thumbnail_url?: string | null;
  created_at?: Date;
  productIds?: string[];
}) {
  const video = await prisma.video.create({
    data: {
      store_id: overrides.storeId,
      title: overrides.title ?? "Test Video",
      status: overrides.status ?? "active",
      processing_status: overrides.processing_status ?? "ready",
      is_feed_enabled: overrides.is_feed_enabled ?? true,
      is_product_page_enabled: overrides.is_product_page_enabled ?? true,
      is_featured: overrides.is_featured ?? false,
      sort_order: overrides.sort_order ?? 0,
      provider: overrides.provider ?? "bunny",
      provider_video_id: overrides.provider_video_id,
      thumbnail_url: overrides.thumbnail_url,
      ...(overrides.created_at ? { created_at: overrides.created_at } : {}),
    },
  });

  if (overrides.productIds?.length) {
    await prisma.videoProduct.createMany({
      data: overrides.productIds.map((product_id, index) => ({
        video_id: video.id,
        product_id,
        is_primary: index === 0,
      })),
    });
  }

  return video;
}
