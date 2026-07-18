import React from "react";
import { useLocation } from "wouter";
import { env, isApiConfigured } from "@/lib/env";
import { useCurrentStore } from "@/hooks/useStore";
import { isShopifyEmbeddedSession } from "@/lib/shopify-embedded";

const SCRIPT_MARKER = "data-lupp-dashboard-widget";
const WIDGET_NODES_SELECTOR = "[data-lupp-widget-root],[data-lupp-feed-overlay]";

function removeWidgetArtifacts() {
  document
    .querySelectorAll(`script[${SCRIPT_MARKER}],${WIDGET_NODES_SELECTOR}`)
    .forEach((node) => node.remove());
}

/**
 * Injects the embeddable storefront widget (public/widget.js) into the
 * dashboard so the merchant sees their own floating launcher on every
 * /app page. Mounted once next to AppRoutes so it survives navigation
 * between /app pages without re-fetching the widget bootstrap.
 */
export function DashboardVideoWidget() {
  const [path] = useLocation();
  const { store } = useCurrentStore();

  const onDashboard =
    path.startsWith("/app") || (path === "/" && isShopifyEmbeddedSession());
  const enabled = onDashboard && isApiConfigured && Boolean(store?.id);
  const storeId = store?.id ?? "";

  React.useEffect(() => {
    if (!enabled || !storeId) return;

    removeWidgetArtifacts();

    const script = document.createElement("script");
    script.src = env.widgetCdnUrl;
    script.async = true;
    script.setAttribute(SCRIPT_MARKER, "true");
    // The store id alone identifies the store; widget.js resolves everything
    // else (config, videos, storefront urls) in its single bootstrap call.
    script.dataset.storeId = storeId;
    script.dataset.widget = "floating_launcher";
    script.dataset.apiUrl = env.apiUrl;
    script.dataset.luppUrl = env.appUrl;
    document.body.appendChild(script);

    return () => {
      removeWidgetArtifacts();
      // widget.js has no destroy API; its async bootstrap may resolve after
      // unmount and still append a root. Purge that late render, but only if
      // no newer instance (a live marked script) has been injected since.
      const purgeLateRender = () => {
        if (!document.querySelector(`script[${SCRIPT_MARKER}]`)) {
          document
            .querySelectorAll(WIDGET_NODES_SELECTOR)
            .forEach((node) => node.remove());
        }
      };
      document.addEventListener("luup:widget-rendered", purgeLateRender, {
        once: true,
      });
      window.setTimeout(() => {
        document.removeEventListener("luup:widget-rendered", purgeLateRender);
      }, 15_000);
    };
  }, [enabled, storeId]);

  return null;
}
