import { useQuery } from "@tanstack/react-query";
import { videosService } from "@/services/videos.service";
import { isApiConfigured } from "@/lib/env";

export function useVideos(storeId?: string, search = "", status = "all") {
  return useQuery({
    queryKey: ["videos", storeId, search, status],
    queryFn: () => videosService.listVideos(storeId!, search, status),
    enabled: isApiConfigured && Boolean(storeId),
  });
}
