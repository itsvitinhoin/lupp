import { prisma } from "@/lib/prisma";
import {
  bunnyStreamFetch,
  getBunnyStreamConfig,
  readBunnyError,
} from "@/lib/bunny";
import {
  bunnyStoragePathFromPublicUrl,
  deleteFromBunnyStorage,
} from "@/lib/bunny-storage";

export type DeletableVideo = {
  id: string;
  store_id: string;
  provider: string;
  provider_video_id: string | null;
  thumbnail_url: string | null;
};

export type VideoDeletionResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

/**
 * The one place a video actually gets removed: Bunny Stream asset (a Bunny
 * 404 is tolerated — already gone there must not block the local delete),
 * best-effort thumbnail cleanup, video_products links, then the videos row
 * itself (falling back to archiving it if the hard delete fails for some
 * reason). Shared by the store-scoped route (videos/delete-video.ts) and the
 * admin console's Bunny video management page — both must behave identically
 * regardless of which surface triggered the delete.
 */
export async function deleteVideoAndBunnyAsset(
  video: DeletableVideo,
): Promise<VideoDeletionResult> {
  const providerVideoId = (video.provider_video_id ?? "").trim();
  if (video.provider === "bunny" && providerVideoId) {
    const { libraryId, apiKey } = getBunnyStreamConfig();
    if (!libraryId || !apiKey) {
      return { ok: false, status: 500, error: "missing_bunny_stream_config" };
    }
    const response = await bunnyStreamFetch({
      apiKey,
      libraryId,
      method: "DELETE",
      path: `/videos/${providerVideoId}`,
    });
    if (!response.ok && response.status !== 404) {
      return { ok: false, status: 502, error: await readBunnyError(response) };
    }
  }

  const thumbnailPath = bunnyStoragePathFromPublicUrl(video.thumbnail_url);
  if (thumbnailPath) {
    try {
      await deleteFromBunnyStorage(thumbnailPath);
    } catch {
      // Best-effort — an orphaned thumbnail file is not worth failing the
      // delete over.
    }
  }

  await prisma.videoProduct.deleteMany({ where: { video_id: video.id } });

  try {
    await prisma.video.deleteMany({ where: { id: video.id, store_id: video.store_id } });
  } catch {
    try {
      await prisma.video.updateMany({
        where: { id: video.id, store_id: video.store_id },
        data: { processing_status: "archived", status: "deleted" },
      });
    } catch (updateError) {
      return {
        ok: false,
        status: 500,
        error: updateError instanceof Error ? updateError.message : "video_delete_failed",
      };
    }
  }

  return { ok: true };
}
