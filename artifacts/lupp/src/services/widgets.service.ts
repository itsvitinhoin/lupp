import { apiGet, apiPatch, apiPost } from "@/lib/api";
import { env } from "@/lib/env";
import type { TableUpdate } from "@/types/database";

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function uniqueValues(values: unknown[]) {
  return Array.from(
    new Set(values.map((value) => String(value || "").trim()).filter(Boolean)),
  );
}

function errorText(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map(errorText).filter(Boolean).join(" | ") || null;
  }
  if (typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const direct =
    record.message ||
    record.error_description ||
    record.error ||
    record.reason ||
    record.description;
  if (typeof direct === "string") return direct;

  return errorText(record.details) || errorText(record.errors);
}

export type NuvemshopScriptInstallResult = {
  installed: boolean;
  method: string;
  script_id: string;
  message?: string;
  pending_manual_install?: boolean;
  verified?: boolean;
  warning?: string;
};

export type WidgetBootstrapProbe = {
  active: boolean;
  carouselDisabledReason: string | null;
  error: string | null;
  httpStatus: number;
  ok: boolean;
  resolvedBy: string | null;
  tried: string[];
};

export const widgetsService = {
  async listWidgets(storeId: string) {
    const params = new URLSearchParams({ store_id: storeId });
    const data = await apiGet<{ widgets: any[] }>(`/api/widgets?${params}`);
    return data.widgets ?? [];
  },

  async updateWidget(widgetId: string, updates: TableUpdate<"widgets">) {
    const data = await apiPatch<{ widget: any }>(
      `/api/widgets/${widgetId}`,
      updates as Record<string, unknown>,
    );
    return data.widget;
  },

  // The settings-merge/seed logic (mode=all, default exclusions, carousel
  // seeding) moved server-side: POST /api/widgets/floating/ensure.
  async ensureFloatingWidgetForProductPage(storeId: string) {
    const data = await apiPost<{ widget: any }>("/api/widgets/floating/ensure", {
      store_id: storeId,
    });
    return data.widget;
  },

  async installNuvemshopScript(storeId: string) {
    const data = await apiPost<NuvemshopScriptInstallResult>(
      "/api/integrations/nuvemshop/install-script",
      { store_id: storeId },
      {
        humanize: (payload) => {
          const message = errorText(payload);
          return message ? message.replace(/_/g, " ") : null;
        },
      },
    );

    return data ?? { installed: true, method: "POST", script_id: "" };
  },

  // Queries the public widget bootstrap exactly like a storefront visitor
  // would, so the admin can show whether the widget will actually render.
  async probeWidgetBootstrap(params: {
    provider?: string;
    storeDomain?: string;
    storeId?: string;
  }): Promise<WidgetBootstrapProbe> {
    const query = new URLSearchParams({
      mode: "meta",
      widget: "floating_video",
    });
    if (params.storeId) query.set("store_id", params.storeId);
    if (params.storeDomain) {
      query.set("provider", params.provider || "nuvemshop");
      query.set("store_domain", params.storeDomain);
    }

    const response = await fetch(
      `${env.apiUrl}/api/widget/bootstrap?${query.toString()}`,
    );
    const payload = asRecord(await response.json().catch(() => null));
    const carousel = asRecord(asRecord(asRecord(payload.widget).settings).carousel);

    return {
      active: Boolean(payload.active),
      carouselDisabledReason:
        carousel.enabled === false
          ? String(carousel.disabled_reason || "carousel_disabled")
          : null,
      error: payload.error ? String(payload.error) : null,
      httpStatus: response.status,
      ok: response.ok,
      resolvedBy: payload.resolved_by ? String(payload.resolved_by) : null,
      tried: Array.isArray(payload.tried) ? payload.tried.map(String) : [],
    };
  },

  getEmbedCode(storeSlug: string, widgetType: string) {
    const scriptUrl = JSON.stringify(env.widgetCdnUrl).replace(
      /<\/script/gi,
      "<\\/script",
    );
    const slug = JSON.stringify(storeSlug).replace(/<\/script/gi, "<\\/script");
    const type = JSON.stringify(widgetType).replace(
      /<\/script/gi,
      "<\\/script",
    );

    return `<script>
(function () {
  var s = document.createElement('script');
  s.async = true;
  s.src = ${scriptUrl};
  s.setAttribute('data-store', ${slug});
  s.setAttribute('data-widget', ${type});
  s.setAttribute('data-lupp-url', ${JSON.stringify(env.appUrl).replace(/<\/script/gi, "<\\/script")});

  var firstScript = document.getElementsByTagName('script')[0];
  firstScript.parentNode.insertBefore(s, firstScript);
})();
</script>`;
  },
};
