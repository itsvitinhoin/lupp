import { useQuery } from "@tanstack/react-query";
import { analyticsService } from "@/services/analytics.service";
import { isApiConfigured } from "@/lib/env";

export function useDashboardMetrics(storeId?: string) {
  return useQuery({
    queryKey: ["dashboard-metrics", storeId],
    queryFn: () => analyticsService.getDashboardMetrics(storeId!),
    enabled: isApiConfigured && Boolean(storeId),
  });
}
