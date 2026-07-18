import { asRecord } from "@/lib/text";
/**
 * Widget defaults ported from the SPA (src/lib/constants.ts +
 * widgets.service.ts): the widgets a new store is seeded with, and the
 * settings merge applied when ensuring the floating widget for product pages.
 */

function uniqueValues(values: unknown[]) {
  return Array.from(
    new Set(values.map((value) => String(value || "").trim()).filter(Boolean)),
  );
}

export const DEFAULT_WIDGETS = [
  { name: "Product Video", type: "product_video", target: "product" },
  { name: "Home Showcase", type: "home_showcase", target: "home" },
  { name: "Floating Video", type: "floating_video", target: "site" },
  { name: "Stories Bar", type: "stories_bar", target: "site" },
] as const;

export function withDefaultFloatingWidgetSettings(settingsValue?: unknown) {
  const settings = asRecord(settingsValue);
  const display = asRecord(settings.display);
  const carousel = asRecord(settings.carousel);

  return {
    ...settings,
    display: {
      mode: "all",
      include_paths: [],
      exclude_paths: ["/checkout", "/carrinho", "/cart"],
      product_mode: "linked_or_all",
      hide_without_videos: false,
      home_experience_enabled: true,
      home_ordering: "manual",
      ...display,
    },
    carousel: {
      enabled: true,
      title: "Descubra cada detalhe e Compre",
      description: "",
      before_heading: "Com Capa",
      max_items: 12,
      mobile_max_items: 6,
      ...carousel,
    },
  };
}

/**
 * Settings merge for "ensure the floating widget renders on product pages":
 * forces mode=all with the default exclusions and seeds the carousel block
 * (the DB carousel block is the widget's source of truth — the script
 * attribute default is off). Plan gating stays in the bootstrap
 * (plan_widget_limit).
 */
export function buildFloatingEnsureSettings(settingsValue?: unknown) {
  const settings = asRecord(settingsValue);
  const appearance = asRecord(settings.appearance);
  const display = asRecord(settings.display);
  const carousel = asRecord(settings.carousel);

  return {
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
}
