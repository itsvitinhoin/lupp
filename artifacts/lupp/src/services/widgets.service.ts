import { env } from "@/lib/env";
import { requireSupabase } from "@/lib/supabase";
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
    const { data, error } = await requireSupabase()
      .from("widgets")
      .select("*")
      .eq("store_id", storeId)
      .order("created_at");
    if (error) throw error;
    return data ?? [];
  },

  async updateWidget(widgetId: string, updates: TableUpdate<"widgets">) {
    const { data, error } = await requireSupabase()
      .from("widgets")
      .update(updates)
      .eq("id", widgetId)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  },

  async ensureFloatingWidgetForProductPage(storeId: string) {
    const supabase = requireSupabase();
    const { data: widgets, error: listError } = await supabase
      .from("widgets")
      .select("*")
      .eq("store_id", storeId)
      .eq("type", "floating_video")
      .order("created_at");
    if (listError) throw listError;

    const widget = widgets?.[0] ?? null;
    const settings = asRecord(widget?.settings);
    const appearance = asRecord(settings.appearance);
    const display = asRecord(settings.display);
    const carousel = asRecord(settings.carousel);
    const nextSettings = {
      ...settings,
      appearance,
      display: {
        ...display,
        mode: "all",
        include_paths: [],
        exclude_paths: uniqueValues(
          Array.isArray(display.exclude_paths)
            ? display.exclude_paths
            : ["/checkout", "/carrinho", "/cart"],
        ),
        product_mode: "linked_or_all",
        hide_without_videos: false,
        home_experience_enabled: display.home_experience_enabled ?? true,
        home_ordering: display.home_ordering || "manual",
      },
      // The DB carousel block is the widget's source of truth (the script
      // attribute default is off) — seed it so stores that never saved the
      // dashboard settings still render the horizontal feed. Plan gating
      // stays server-side in the bootstrap (plan_widget_limit).
      carousel: {
        ...carousel,
        before_heading: carousel.before_heading ?? "Com Capa",
        description: carousel.description ?? "",
        enabled: carousel.enabled ?? true,
        max_items: carousel.max_items ?? 12,
        mobile_max_items: carousel.mobile_max_items ?? 6,
        title: carousel.title ?? "Descubra cada detalhe e Compre",
      },
    };

    if (!widget) {
      const { data, error } = await supabase
        .from("widgets")
        .insert({
          name: "Floating Video",
          settings: nextSettings,
          status: "active",
          store_id: storeId,
          target: "site",
          type: "floating_video",
        })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    }

    const { data, error } = await supabase
      .from("widgets")
      .update({
        settings: nextSettings,
        status: "active",
      })
      .eq("id", widget.id)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  },

  async installNuvemshopScript(storeId: string) {
    const client = requireSupabase();
    const {
      data: { session },
      error: sessionError,
    } = await client.auth.getSession();

    if (sessionError) throw sessionError;
    if (!session)
      throw new Error(
        "Sua sessão expirou. Entre novamente para instalar o script.",
      );

    const { data, error } = await client.functions.invoke<NuvemshopScriptInstallResult>("nuvemshop-install-script", {
      body: { store_id: storeId },
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (error) {
      if ("context" in error && error.context instanceof Response) {
        const details = await error.context.json().catch(() => null);
        const message = errorText(details);
        if (message) {
          throw new Error(message.replace(/_/g, " "));
        }
      }
      throw error;
    }

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
      `${env.supabaseUrl}/functions/v1/lupp-widget-bootstrap?${query.toString()}`,
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
