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
  carouselAnchorFallback: string;
  carouselDesktopCount: string;
  carouselMobileCount: string;
  carouselShowPrice: boolean;
  carouselShowCartActions: boolean;
  carouselSectionPaddingX: string;
  carouselSectionPaddingY: string;
  carouselSectionMarginX: string;
  carouselSectionMarginY: string;
  carouselCardGap: string;
  carouselShowScrollHint: boolean;
  carouselShowNavigationArrows: boolean;
  carouselBackgroundColor: string;
  carouselTitleColor: string;
  carouselDescriptionColor: string;
  carouselAccentColor: string;
  carouselFontSource: string;
  carouselFontFamily: string;
  carouselShowTitle: boolean;
  carouselShowDescription: boolean;
  carouselCardBorderRadius: string;
  carouselCardMinWidth: string;
  carouselCardMaxWidth: string;
  carouselCardAspectRatio: string;
  carouselCardBackgroundColor: string;
  carouselCardShadowEnabled: boolean;
  carouselCardShadowColor: string;
  carouselCardShadowOpacity: string;
  carouselCardShadowBlur: string;
  carouselCardShadowOffsetX: string;
  carouselCardShadowOffsetY: string;
  carouselAutoplayEnabled: boolean;
  carouselAutoplayIntervalMs: string;
  carouselAutoplayDirection: string;
  carouselAutoplayPauseOnHover: boolean;
  carouselAutoplayLoop: boolean;
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
  carouselAnchorFallback: DEFAULTS.carousel.anchor_fallback,
  carouselDesktopCount: String(DEFAULTS.carousel.max_items),
  carouselMobileCount: String(DEFAULTS.carousel.mobile_max_items),
  carouselShowPrice: DEFAULTS.carousel.show_price,
  carouselShowCartActions: DEFAULTS.carousel.show_cart_actions,
  carouselSectionPaddingX: String(DEFAULTS.carousel.section_padding_x),
  carouselSectionPaddingY: String(DEFAULTS.carousel.section_padding_y),
  carouselSectionMarginX: String(DEFAULTS.carousel.section_margin_x),
  carouselSectionMarginY: String(DEFAULTS.carousel.section_margin_y),
  carouselCardGap: String(DEFAULTS.carousel.card_gap),
  carouselShowScrollHint: DEFAULTS.carousel.show_scroll_hint,
  carouselShowNavigationArrows: DEFAULTS.carousel.show_navigation_arrows,
  carouselBackgroundColor: DEFAULTS.carousel.background_color,
  carouselTitleColor: DEFAULTS.carousel.title_color,
  carouselDescriptionColor: DEFAULTS.carousel.description_color,
  carouselAccentColor: DEFAULTS.carousel.accent_color,
  carouselFontSource: DEFAULTS.carousel.font_source,
  carouselFontFamily: DEFAULTS.carousel.font_family,
  carouselShowTitle: DEFAULTS.carousel.show_title,
  carouselShowDescription: DEFAULTS.carousel.show_description,
  carouselCardBorderRadius: String(DEFAULTS.carousel.card_border_radius),
  carouselCardMinWidth: String(DEFAULTS.carousel.card_min_width),
  carouselCardMaxWidth: String(DEFAULTS.carousel.card_max_width),
  carouselCardAspectRatio: DEFAULTS.carousel.card_aspect_ratio,
  carouselCardBackgroundColor: DEFAULTS.carousel.card_background_color,
  carouselCardShadowEnabled: DEFAULTS.carousel.card_shadow_enabled,
  carouselCardShadowColor: DEFAULTS.carousel.card_shadow_color,
  carouselCardShadowOpacity: String(DEFAULTS.carousel.card_shadow_opacity),
  carouselCardShadowBlur: String(DEFAULTS.carousel.card_shadow_blur),
  carouselCardShadowOffsetX: String(DEFAULTS.carousel.card_shadow_offset_x),
  carouselCardShadowOffsetY: String(DEFAULTS.carousel.card_shadow_offset_y),
  carouselAutoplayEnabled: DEFAULTS.carousel.autoplay_enabled,
  carouselAutoplayIntervalMs: String(DEFAULTS.carousel.autoplay_interval_ms),
  carouselAutoplayDirection: DEFAULTS.carousel.autoplay_direction,
  carouselAutoplayPauseOnHover: DEFAULTS.carousel.autoplay_pause_on_hover,
  carouselAutoplayLoop: DEFAULTS.carousel.autoplay_loop,
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
      carouselAnchorFallback: String(
        carousel.anchor_fallback || DEFAULTS.carousel.anchor_fallback,
      ),
      carouselDesktopCount: String(carousel.max_items || DEFAULTS.carousel.max_items),
      carouselMobileCount: String(
        carousel.mobile_max_items || DEFAULTS.carousel.mobile_max_items,
      ),
      carouselShowPrice: carousel.show_price !== false,
      carouselShowCartActions: carousel.show_cart_actions !== false,
      carouselSectionPaddingX: String(
        carousel.section_padding_x ?? DEFAULTS.carousel.section_padding_x,
      ),
      carouselSectionPaddingY: String(
        carousel.section_padding_y ?? DEFAULTS.carousel.section_padding_y,
      ),
      carouselSectionMarginX: String(
        carousel.section_margin_x ?? DEFAULTS.carousel.section_margin_x,
      ),
      carouselSectionMarginY: String(
        carousel.section_margin_y ?? DEFAULTS.carousel.section_margin_y,
      ),
      carouselCardGap: String(carousel.card_gap ?? DEFAULTS.carousel.card_gap),
      carouselShowScrollHint: carousel.show_scroll_hint !== false,
      carouselShowNavigationArrows: carousel.show_navigation_arrows !== false,
      carouselBackgroundColor: String(
        carousel.background_color || DEFAULTS.carousel.background_color,
      ),
      carouselTitleColor: String(carousel.title_color || DEFAULTS.carousel.title_color),
      carouselDescriptionColor: String(
        carousel.description_color || DEFAULTS.carousel.description_color,
      ),
      carouselAccentColor: String(carousel.accent_color ?? DEFAULTS.carousel.accent_color),
      carouselFontSource: String(carousel.font_source || DEFAULTS.carousel.font_source),
      carouselFontFamily: String(carousel.font_family ?? DEFAULTS.carousel.font_family),
      carouselShowTitle: carousel.show_title !== false,
      carouselShowDescription: carousel.show_description !== false,
      carouselCardBorderRadius: String(
        carousel.card_border_radius ?? DEFAULTS.carousel.card_border_radius,
      ),
      carouselCardMinWidth: String(carousel.card_min_width || DEFAULTS.carousel.card_min_width),
      carouselCardMaxWidth: String(carousel.card_max_width || DEFAULTS.carousel.card_max_width),
      carouselCardAspectRatio: String(
        carousel.card_aspect_ratio || DEFAULTS.carousel.card_aspect_ratio,
      ),
      carouselCardBackgroundColor: String(
        carousel.card_background_color || DEFAULTS.carousel.card_background_color,
      ),
      carouselCardShadowEnabled: Boolean(carousel.card_shadow_enabled),
      carouselCardShadowColor: String(
        carousel.card_shadow_color || DEFAULTS.carousel.card_shadow_color,
      ),
      carouselCardShadowOpacity: String(
        carousel.card_shadow_opacity ?? DEFAULTS.carousel.card_shadow_opacity,
      ),
      carouselCardShadowBlur: String(
        carousel.card_shadow_blur ?? DEFAULTS.carousel.card_shadow_blur,
      ),
      carouselCardShadowOffsetX: String(
        carousel.card_shadow_offset_x ?? DEFAULTS.carousel.card_shadow_offset_x,
      ),
      carouselCardShadowOffsetY: String(
        carousel.card_shadow_offset_y ?? DEFAULTS.carousel.card_shadow_offset_y,
      ),
      carouselAutoplayEnabled: Boolean(carousel.autoplay_enabled),
      carouselAutoplayIntervalMs: String(
        carousel.autoplay_interval_ms || DEFAULTS.carousel.autoplay_interval_ms,
      ),
      carouselAutoplayDirection: String(
        carousel.autoplay_direction || DEFAULTS.carousel.autoplay_direction,
      ),
      carouselAutoplayPauseOnHover: carousel.autoplay_pause_on_hover !== false,
      carouselAutoplayLoop: carousel.autoplay_loop !== false,
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
      anchor_fallback: form.carouselAnchorFallback,
      enabled: canUseHorizontalFeed && form.carouselEnabled,
      title: form.carouselTitle.trim() || DEFAULTS.carousel.title,
      description: form.carouselDescription.trim(),
      before_heading: form.carouselBeforeHeading.trim() || DEFAULTS.carousel.before_heading,
      max_items: Number(form.carouselDesktopCount) || DEFAULTS.carousel.max_items,
      mobile_max_items: Number(form.carouselMobileCount) || DEFAULTS.carousel.mobile_max_items,
      show_price: form.carouselShowPrice,
      show_cart_actions: form.carouselShowCartActions,
      section_padding_x:
        Number(form.carouselSectionPaddingX) || DEFAULTS.carousel.section_padding_x,
      section_padding_y:
        Number(form.carouselSectionPaddingY) || DEFAULTS.carousel.section_padding_y,
      section_margin_x: Number(form.carouselSectionMarginX) || 0,
      section_margin_y: Number(form.carouselSectionMarginY) || 0,
      card_gap: Number(form.carouselCardGap) || DEFAULTS.carousel.card_gap,
      show_scroll_hint: form.carouselShowScrollHint,
      show_navigation_arrows: form.carouselShowNavigationArrows,
      background_color: form.carouselBackgroundColor,
      title_color: form.carouselTitleColor,
      description_color: form.carouselDescriptionColor,
      accent_color: form.carouselAccentColor.trim(),
      font_source: form.carouselFontSource,
      font_family: form.carouselFontFamily.trim(),
      show_title: form.carouselShowTitle,
      show_description: form.carouselShowDescription,
      card_border_radius:
        Number(form.carouselCardBorderRadius) || DEFAULTS.carousel.card_border_radius,
      card_min_width: Number(form.carouselCardMinWidth) || DEFAULTS.carousel.card_min_width,
      card_max_width: Number(form.carouselCardMaxWidth) || DEFAULTS.carousel.card_max_width,
      card_aspect_ratio: form.carouselCardAspectRatio,
      card_background_color: form.carouselCardBackgroundColor,
      card_shadow_enabled: form.carouselCardShadowEnabled,
      card_shadow_color: form.carouselCardShadowColor,
      card_shadow_opacity:
        Number(form.carouselCardShadowOpacity) || DEFAULTS.carousel.card_shadow_opacity,
      card_shadow_blur: Number(form.carouselCardShadowBlur) || DEFAULTS.carousel.card_shadow_blur,
      card_shadow_offset_x: Number(form.carouselCardShadowOffsetX) || 0,
      card_shadow_offset_y:
        Number(form.carouselCardShadowOffsetY) || DEFAULTS.carousel.card_shadow_offset_y,
      autoplay_enabled: form.carouselAutoplayEnabled,
      autoplay_interval_ms:
        Number(form.carouselAutoplayIntervalMs) || DEFAULTS.carousel.autoplay_interval_ms,
      autoplay_direction: form.carouselAutoplayDirection,
      autoplay_pause_on_hover: form.carouselAutoplayPauseOnHover,
      autoplay_loop: form.carouselAutoplayLoop,
    },
  });

  return { form, setField, buildLauncherSettings };
}
