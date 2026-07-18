import React from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { env } from "@/lib/env";
import { useCurrentStore } from "@/hooks/useStore";

/**
 * Embeds public/simulador.html, pre-filling its form with the current store
 * via query params. The static page owns the form, the editable script
 * textarea and the sandboxed preview iframe.
 */
export default function Simulator() {
  const { store } = useCurrentStore();

  const src = React.useMemo(() => {
    const params = new URLSearchParams();
    params.set("widget_src", `${env.appUrl}/widget.js`);
    params.set("lupp_url", env.appUrl);
    params.set("api_url", env.apiUrl);
    if (store) {
      params.set("store_id", store.id);
      params.set("store", store.slug);
      // Pre-fill the simulated page with the storefront home so the widget's
      // context bootstrap (data-product-url fallback in sandboxed iframes)
      // resolves against the real store URL.
      if (store.url) params.set("product_url", store.url);
    }
    return `${env.appUrl}/simulador.html?${params.toString()}`;
  }, [store]);

  return (
    <AppLayout title="Simulador" fullWidth>
      <iframe
        key={src}
        src={src}
        title="Simulador do widget Luup"
        className="h-[calc(100vh-9rem)] w-full rounded-2xl border border-slate-200 bg-white"
        allow="autoplay; fullscreen; clipboard-write"
      />
    </AppLayout>
  );
}
