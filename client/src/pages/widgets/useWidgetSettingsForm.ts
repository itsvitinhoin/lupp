import React from "react";
import { WIDGET_SETTINGS_DEFAULTS } from "@workspace/widget-config";

export type WidgetSettingsForm = {
  launcherLabel: string;
  launcherPosition: string;
  launcherAccent: string;
  launcherBackground: string;
  launcherTextColor: string;
  launcherFont: string;
  launcherSize: string;
  launcherModel: string;
  launcherOffsetX: string;
  launcherOffsetY: string;
  displayMode: string;
  productMode: string;
  includePaths: string;
  excludePaths: string;
  hideWithoutVideos: boolean;
  homeExperienceEnabled: boolean;
  homeOrdering: string;
  fixedVideo: boolean;
  allowClose: boolean;
  randomizeThumbnail: boolean;
  customInstallmentsEnabled: boolean;
  customInstallmentsCount: string;
  customInstallmentsInterestFree: boolean;
  customPixDiscountEnabled: boolean;
  customPixDiscountPercent: string;
  customPaymentNote: string;
  carouselEnabled: boolean;
  carouselTitle: string;
  carouselDescription: string;
  carouselBeforeHeading: string;
  carouselAnchorSelector: string;
  carouselAnchorPlacement: string;
  carouselDesktopCount: string;
  carouselMobileCount: string;
};

export type SetWidgetSettingsField = <K extends keyof WidgetSettingsForm>(
  key: K,
  value: WidgetSettingsForm[K],
) => void;

const DEFAULTS = WIDGET_SETTINGS_DEFAULTS;

const defaultForm: WidgetSettingsForm = {
  launcherLabel: DEFAULTS.appearance.label,
  launcherPosition: DEFAULTS.appearance.position,
  launcherAccent: DEFAULTS.appearance.accent_color,
  launcherBackground: DEFAULTS.appearance.background_color,
  launcherTextColor: DEFAULTS.appearance.text_color,
  launcherFont: DEFAULTS.appearance.font_family,
  launcherSize: String(DEFAULTS.appearance.bubble_size),
  launcherModel: DEFAULTS.appearance.model,
  launcherOffsetX: String(DEFAULTS.appearance.offset_x),
  launcherOffsetY: String(DEFAULTS.appearance.offset_y),
  displayMode: DEFAULTS.display.mode,
  productMode: DEFAULTS.display.product_mode,
  includePaths: DEFAULTS.display.include_paths.join("\n"),
  excludePaths: DEFAULTS.display.exclude_paths.join("\n"),
  hideWithoutVideos: DEFAULTS.display.hide_without_videos,
  homeExperienceEnabled: DEFAULTS.display.home_experience_enabled,
  homeOrdering: DEFAULTS.display.home_ordering,
  fixedVideo: false,
  allowClose: true,
  randomizeThumbnail: false,
  customInstallmentsEnabled: false,
  customInstallmentsCount: "6",
  customInstallmentsInterestFree: true,
  customPixDiscountEnabled: false,
  customPixDiscountPercent: "0",
  customPaymentNote: "",
  carouselEnabled: DEFAULTS.carousel.enabled,
  carouselTitle: DEFAULTS.carousel.title,
  carouselDescription: DEFAULTS.carousel.description,
  carouselBeforeHeading: DEFAULTS.carousel.before_heading,
  carouselAnchorSelector: DEFAULTS.carousel.anchor_selector,
  carouselAnchorPlacement: DEFAULTS.carousel.anchor_placement,
  carouselDesktopCount: String(DEFAULTS.carousel.max_items),
  carouselMobileCount: String(DEFAULTS.carousel.mobile_max_items),
};

export function asSettings(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, any>;
}

function pathsFromText(value: string) {
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function pathsToText(value: unknown) {
  return Array.isArray(value) ? value.filter(Boolean).join("\n") : "";
}

/**
 * Single source of truth for the widget personalization form: one state
 * object for every field, hydration from the saved floating widget row and
 * the plan-based carousel auto-disable, plus the `buildLauncherSettings`
 * payload builder (server contract — key names must not change). Defaults
 * come from @workspace/widget-config so the panel, the API and the widget
 * runtime always agree on what an untouched store renders.
 */
export function useWidgetSettingsForm({
  floatingWidget,
  canUseHorizontalFeed,
}: {
  floatingWidget: Record<string, any> | null;
  canUseHorizontalFeed: boolean;
}) {
  const [form, setForm] = React.useState<WidgetSettingsForm>(defaultForm);

  const setField = React.useCallback<SetWidgetSettingsField>((key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  React.useEffect(() => {
    if (!floatingWidget) return;
    const settings = asSettings(floatingWidget.settings);
    const appearance = asSettings(settings.appearance);
    const display = asSettings(settings.display);
    const commerce = asSettings(settings.commerce);
    const carousel = asSettings(settings.carousel);

    setForm({
      launcherPosition: String(appearance.position || DEFAULTS.appearance.position),
      launcherAccent: String(appearance.accent_color || DEFAULTS.appearance.accent_color),
      launcherBackground: String(
        appearance.background_color || DEFAULTS.appearance.background_color,
      ),
      launcherTextColor: String(appearance.text_color || DEFAULTS.appearance.text_color),
      launcherLabel: String(appearance.label ?? DEFAULTS.appearance.label),
      launcherFont: String(appearance.font_family || DEFAULTS.appearance.font_family),
      launcherSize: String(appearance.bubble_size || DEFAULTS.appearance.bubble_size),
      launcherModel: String(appearance.model || DEFAULTS.appearance.model),
      launcherOffsetX: String(appearance.offset_x ?? DEFAULTS.appearance.offset_x),
      launcherOffsetY: String(appearance.offset_y ?? DEFAULTS.appearance.offset_y),
      fixedVideo: Boolean(appearance.fixed_video),
      allowClose: appearance.allow_close !== false,
      randomizeThumbnail: Boolean(appearance.randomize_thumbnail),
      displayMode: String(display.mode || DEFAULTS.display.mode),
      productMode: String(display.product_mode || DEFAULTS.display.product_mode),
      includePaths: pathsToText(display.include_paths),
      excludePaths:
        pathsToText(display.exclude_paths) || DEFAULTS.display.exclude_paths.join("\n"),
      hideWithoutVideos: Boolean(display.hide_without_videos),
      homeExperienceEnabled: display.home_experience_enabled !== false,
      homeOrdering: String(display.home_ordering || DEFAULTS.display.home_ordering),
      customInstallmentsEnabled: Boolean(commerce.custom_installments_enabled),
      customInstallmentsCount: String(commerce.custom_installments_count || "6"),
      customInstallmentsInterestFree:
        commerce.custom_installments_interest_free !== false,
      customPixDiscountEnabled: Boolean(commerce.custom_pix_discount_enabled),
      customPixDiscountPercent: String(commerce.custom_pix_discount_percent || "0"),
      customPaymentNote: String(commerce.custom_payment_note || ""),
      carouselEnabled: carousel.enabled !== false,
      carouselTitle: String(carousel.title || DEFAULTS.carousel.title),
      carouselDescription: String(carousel.description || ""),
      carouselBeforeHeading: String(
        carousel.before_heading || DEFAULTS.carousel.before_heading,
      ),
      carouselAnchorSelector: String(carousel.anchor_selector || ""),
      carouselAnchorPlacement: String(
        carousel.anchor_placement || DEFAULTS.carousel.anchor_placement,
      ),
      carouselDesktopCount: String(carousel.max_items || DEFAULTS.carousel.max_items),
      carouselMobileCount: String(
        carousel.mobile_max_items || DEFAULTS.carousel.mobile_max_items,
      ),
    });
  }, [floatingWidget?.id, floatingWidget?.updated_at]);

  React.useEffect(() => {
    if (!canUseHorizontalFeed && form.carouselEnabled) {
      setForm((prev) => ({ ...prev, carouselEnabled: false }));
    }
  }, [canUseHorizontalFeed, form.carouselEnabled]);

  const buildLauncherSettings = (currentSettings: Record<string, any>) => ({
    ...currentSettings,
    appearance: {
      accent_color: form.launcherAccent,
      allow_close: form.allowClose,
      background_color: form.launcherBackground,
      bubble_size: Number(form.launcherSize) || DEFAULTS.appearance.bubble_size,
      fixed_video: form.fixedVideo,
      font_family: form.launcherFont,
      label: form.launcherLabel,
      model: form.launcherModel,
      offset_x: Number(form.launcherOffsetX ?? DEFAULTS.appearance.offset_x) || 0,
      offset_y: Number(form.launcherOffsetY ?? DEFAULTS.appearance.offset_y) || 0,
      position: form.launcherPosition,
      randomize_thumbnail: form.randomizeThumbnail,
      text_color: form.launcherTextColor,
    },
    display: {
      exclude_paths: pathsFromText(form.excludePaths),
      hide_without_videos: form.hideWithoutVideos,
      home_experience_enabled: form.homeExperienceEnabled,
      home_ordering: form.homeOrdering,
      include_paths: pathsFromText(form.includePaths),
      mode: form.displayMode,
      product_mode: form.productMode,
    },
    commerce: {
      custom_installments_enabled: form.customInstallmentsEnabled,
      custom_installments_count: Number(form.customInstallmentsCount) || 1,
      custom_installments_interest_free: form.customInstallmentsInterestFree,
      custom_pix_discount_enabled: form.customPixDiscountEnabled,
      custom_pix_discount_percent: Number(form.customPixDiscountPercent) || 0,
      custom_payment_note: form.customPaymentNote.trim(),
    },
    carousel: {
      anchor_placement: form.carouselAnchorPlacement,
      anchor_selector: form.carouselAnchorSelector.trim(),
      enabled: canUseHorizontalFeed && form.carouselEnabled,
      title: form.carouselTitle.trim() || DEFAULTS.carousel.title,
      description: form.carouselDescription.trim(),
      before_heading: form.carouselBeforeHeading.trim() || DEFAULTS.carousel.before_heading,
      max_items: Number(form.carouselDesktopCount) || DEFAULTS.carousel.max_items,
      mobile_max_items: Number(form.carouselMobileCount) || DEFAULTS.carousel.mobile_max_items,
    },
  });

  return { form, setField, buildLauncherSettings };
}
