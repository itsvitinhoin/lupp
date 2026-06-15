import { useQuery } from "@tanstack/react-query";
import { analyticsService } from "@/services/analytics.service";
import { isSupabaseConfigured } from "@/lib/env";

export function useDashboardMetrics(storeId?: string) {
  return useQuery({
    queryKey: ["dashboard-metrics", storeId],
    queryFn: () => analyticsService.getDashboardMetrics(storeId!),
    enabled: isSupabaseConfigured && Boolean(storeId),
  });
}
