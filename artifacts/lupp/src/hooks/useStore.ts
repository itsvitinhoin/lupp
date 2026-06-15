import { useQuery } from "@tanstack/react-query";
import { storesService } from "@/services/stores.service";
import { isSupabaseConfigured } from "@/lib/env";
import { useAuth } from "./useAuth";

export function useStores() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["stores", user?.id],
    queryFn: () => storesService.listUserStores(),
    enabled: isSupabaseConfigured && Boolean(user),
  });
}

export function useCurrentStore() {
  const storesQuery = useStores();
  return {
    ...storesQuery,
    store: storesQuery.data?.[0] ?? null,
  };
}
