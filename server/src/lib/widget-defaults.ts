import { WIDGET_SETTINGS_DEFAULTS } from "@workspace/widget-config";
import { asRecord } from "@/lib/text";
/**
 * Widget seeding + the "ensure floating widget" merge. All literal defaults
 * come from the shared contract (@workspace/widget-config) so the dashboard,
 * this module and the bootstrap resolver can never drift apart again.
 */

const DEFAULTS = WIDGET_SETTINGS_DEFAULTS;

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
      ...DEFAULTS.display,
      include_paths: [...DEFAULTS.display.include_paths],
      exclude_paths: [...DEFAULTS.display.exclude_paths],
      ...display,
    },
    carousel: {
      enabled: DEFAULTS.carousel.enabled,
      title: DEFAULTS.carousel.title,
      description: DEFAULTS.carousel.description,
      before_heading: DEFAULTS.carousel.before_heading,
      max_items: DEFAULTS.carousel.max_items,
      mobile_max_items: DEFAULTS.carousel.mobile_max_items,
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
      mode: DEFAULTS.display.mode,
      include_paths: [...DEFAULTS.display.include_paths],
      exclude_paths: uniqueValues(
        Array.isArray(display.exclude_paths)
          ? display.exclude_paths
          : [...DEFAULTS.display.exclude_paths],
      ),
      product_mode: DEFAULTS.display.product_mode,
      hide_without_videos: DEFAULTS.display.hide_without_videos,
      home_experience_enabled:
        display.home_experience_enabled ?? DEFAULTS.display.home_experience_enabled,
      home_ordering: display.home_ordering || DEFAULTS.display.home_ordering,
    },
    carousel: {
      ...carousel,
      before_heading: carousel.before_heading ?? DEFAULTS.carousel.before_heading,
      description: carousel.description ?? DEFAULTS.carousel.description,
      enabled: carousel.enabled ?? DEFAULTS.carousel.enabled,
      max_items: carousel.max_items ?? DEFAULTS.carousel.max_items,
      mobile_max_items: carousel.mobile_max_items ?? DEFAULTS.carousel.mobile_max_items,
      title: carousel.title ?? DEFAULTS.carousel.title,
    },
  };
}
