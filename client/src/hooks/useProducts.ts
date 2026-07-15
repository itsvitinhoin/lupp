import { useQuery } from "@tanstack/react-query";
import { productsService } from "@/services/products.service";
import { isApiConfigured } from "@/lib/env";

export function useProducts(storeId?: string, search = "", status = "all") {
  return useQuery({
    queryKey: ["products", storeId, search, status],
    queryFn: () => productsService.listProducts(storeId!, search, status),
    enabled: isApiConfigured && Boolean(storeId),
  });
}
