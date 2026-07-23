/** Shared by the feed editor preview and the public feed SPA — both render
 * from the same serialized video shape (`video_products[].products`, one
 * flagged `is_primary`). */
export function primaryProductOfVideo(video: any) {
  return (
    video?.video_products?.find((item: any) => item.is_primary)?.products ??
    video?.video_products?.[0]?.products ??
    null
  );
}
